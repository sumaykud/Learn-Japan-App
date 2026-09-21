-- 005_superadmin_setup.sql — one-time superadmin creation with a setup code
--
-- Replaces the email allowlist from 002 as the way the first superadmin is
-- made. The allowlist trusted an email address, and this project's Stack Auth
-- does not verify email ownership before sign-in (every account in
-- neon_auth.users_sync has primary_email_verified = false, and the client signs
-- up with noVerificationCallback). With the owner's address published in the
-- public repository's 002, anyone could sign up as that address before the
-- owner did and be handed the top tier.
--
-- The allowlist also depended on neon_auth.users_sync having caught up: if the
-- first ensure_profile() call beat the sync, the email read as NULL, the
-- account was created as a plain pending learner, and later sign-ins never
-- re-derived the role. The owner would have been stuck with no way in.
--
-- HOW IT WORKS NOW
--
--   1. Someone with database access runs, in the Neon SQL editor or psql:
--          select public.create_superadmin_setup_code();
--      That returns a code once. Only its hash is stored.
--   2. They open /admin/setup, create or sign in to an account, and enter it.
--   3. claim_superadmin() makes that account an approved superadmin and
--      destroys the code.
--
-- Being able to run step 1 IS the proof of ownership. The function is not
-- executable by any role the Data API hands out, so no browser can mint a code.
--
-- It is one-time in the sense that matters: both minting and claiming refuse
-- once an approved superadmin exists. After that the tier grows only by an
-- existing superadmin appointing someone in the console. If every superadmin
-- were ever removed by hand in SQL, step 1 works again — which is the recovery
-- path, and still requires database access.

-- ---------------------------------------------------------------------------
-- 0. Fix from 003: a new function is callable through TWO grants
-- ---------------------------------------------------------------------------
--
-- Every function created in public here is executable by the browser's role
-- twice over:
--
--   * Postgres grants EXECUTE to PUBLIC on CREATE FUNCTION, and every role —
--     authenticated and anonymous included — is a member of PUBLIC.
--   * Neon's Data API provisioning installed
--         ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public
--         GRANT EXECUTE ON FUNCTIONS TO authenticated;
--     so each new function also gets an explicit grant to authenticated.
--
-- 003 revoked other_superadmins() from authenticated and anonymous by name.
-- That removed the second grant and left the first, so both roles could still
-- call it through PUBLIC. An internal function is only private once it is
-- revoked from public, authenticated AND anonymous together, which is what
-- every revoke below does. db/checks.sql now tests with
-- has_function_privilege(), which sees both paths, instead of listing grantees.

revoke all on function public.other_superadmins(text) from public, authenticated, anonymous;

-- ---------------------------------------------------------------------------
-- 1. The code
-- ---------------------------------------------------------------------------
--
-- At most one outstanding code: minting a new one replaces the old, so a code
-- that may have leaked is revoked simply by minting again.

create table if not exists public.superadmin_setup (
  singleton  boolean primary key default true check (singleton),
  code_hash  text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

revoke all on public.superadmin_setup from public, authenticated, anonymous;
alter table public.superadmin_setup enable row level security;
alter table public.superadmin_setup force row level security;

-- One normalisation for both sides, so a code read aloud, retyped in lower
-- case or pasted with its dashes all hash the same.
--
-- An unsalted SHA-256 is enough here and a slow password hash would add
-- nothing: the code carries 122 random bits, so there is no dictionary to try.
create or replace function public.superadmin_code_hash(setup_code text)
returns text
language sql
stable
set search_path = pg_catalog
as $$
  select encode(
    sha256(convert_to(upper(regexp_replace(coalesce(setup_code, ''), '[^0-9A-Za-z]', '', 'g')), 'UTF8')),
    'hex'
  );
$$;

revoke all on function public.superadmin_code_hash(text) from public, authenticated, anonymous;

-- ---------------------------------------------------------------------------
-- 2. Minting — database access only
-- ---------------------------------------------------------------------------

create or replace function public.create_superadmin_setup_code(valid_for interval default interval '24 hours')
returns text
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  raw  text;
  code text;
begin
  if public.other_superadmins(null) > 0 then
    raise exception 'setup already completed: a superadmin exists';
  end if;
  if valid_for <= interval '0' or valid_for > interval '7 days' then
    raise exception 'valid_for must be more than zero and at most 7 days';
  end if;

  -- gen_random_uuid() draws from the server's cryptographic RNG. Grouped so it
  -- can be read out without losing your place.
  raw  := upper(replace(gen_random_uuid()::text, '-', ''));
  code := substr(raw, 1, 8) || '-' || substr(raw, 9, 8) || '-' || substr(raw, 17, 8) || '-' || substr(raw, 25, 8);

  insert into public.superadmin_setup (singleton, code_hash, expires_at)
  values (true, public.superadmin_code_hash(code), now() + valid_for)
  on conflict (singleton) do update
    set code_hash  = excluded.code_hash,
        created_at = now(),
        expires_at = excluded.expires_at;

  return code;
end;
$$;

-- The whole security of this migration is this line. Leaving out any one of
-- the three roles leaves a browser able to mint a code.
revoke all on function public.create_superadmin_setup_code(interval) from public, authenticated, anonymous;

-- ---------------------------------------------------------------------------
-- 3. Claiming
-- ---------------------------------------------------------------------------
--
-- Split in two so the logic can be tested. claim_superadmin_as() takes the
-- user id as an argument and is callable by nobody but the owner; the public
-- claim_superadmin() supplies auth.user_id() from the caller's verified JWT.
-- A browser therefore cannot claim on anyone's behalf but its own.

create or replace function public.claim_superadmin_as(target_user text, setup_code text)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  stored public.superadmin_setup%rowtype;
begin
  if target_user is null then
    raise exception 'not authenticated';
  end if;

  -- Take the lock before checking anything, so two claims racing with the
  -- same code serialise here. The loser wakes to find the row gone and a
  -- superadmin in place, and is refused below.
  select * into stored from public.superadmin_setup where singleton for update;

  if public.other_superadmins(null) > 0 then
    raise exception 'setup already completed';
  end if;

  -- One message for missing, expired and wrong, so the answer says nothing
  -- about whether a code is currently outstanding.
  if stored.code_hash is null
     or stored.expires_at <= now()
     or stored.code_hash <> public.superadmin_code_hash(setup_code) then
    raise exception 'invalid or expired setup code';
  end if;

  -- The profile comes from ensure_profile(), which the client calls on every
  -- sign-in. A deleted account has none and is refused there, so it cannot
  -- come back through this door either.
  if not exists (select 1 from public.profiles where user_id = target_user) then
    raise exception 'sign in first so that your account exists';
  end if;

  update public.profiles
  set role        = 'superadmin',
      status      = 'approved',
      approved_at = now(),
      approved_by = 'setup-code'
  where user_id = target_user;

  -- Consumed. It cannot be used twice, even by the same person.
  delete from public.superadmin_setup;
end;
$$;

revoke all on function public.claim_superadmin_as(text, text) from public, authenticated, anonymous;

create or replace function public.claim_superadmin(setup_code text)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  perform public.claim_superadmin_as(auth.user_id(), setup_code);
end;
$$;

revoke all on function public.claim_superadmin(text) from public;
grant execute on function public.claim_superadmin(text) to authenticated;

-- What the setup page asks before offering the form. It reveals only that no
-- superadmin exists yet — never whether a code has been minted.
create or replace function public.superadmin_setup_available()
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select public.other_superadmins(null) = 0;
$$;

revoke all on function public.superadmin_setup_available() from public;
grant execute on function public.superadmin_setup_available() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Every new account starts as a pending learner
-- ---------------------------------------------------------------------------
--
-- No role is derived from an email address any more. Everything else, the
-- tombstone refusal from 004 included, is unchanged.

create or replace function public.ensure_profile()
returns table (
  user_id text,
  email text,
  display_name text,
  role text,
  status text,
  levels text[],
  furigana text,
  theme text
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
#variable_conflict use_column
declare
  uid text := auth.user_id();
  addr text;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  if exists (select 1 from public.deleted_accounts d where d.user_id = uid) then
    raise exception 'account deleted';
  end if;

  select u.email into addr from neon_auth.users_sync u where u.id = uid;

  insert into public.profiles as p (user_id, email)
  values (uid, addr)
  on conflict (user_id) do update
    set email = coalesce(excluded.email, p.email);

  return query
    select p.user_id, p.email, p.display_name, p.role, p.status, p.levels, p.furigana, p.theme
    from public.profiles p
    where p.user_id = uid;
end;
$$;

grant execute on function public.ensure_profile() to authenticated;

-- Nothing reads it now. Left in place it would look like a working mechanism
-- to the next person reading the schema.
drop table if exists public.admin_allowlist;

-- ---------------------------------------------------------------------------
-- 5. AFTER APPLYING THIS FILE
-- ---------------------------------------------------------------------------
--
-- claim_superadmin() and superadmin_setup_available() are new, so reload the
-- Data API schema cache or /admin/setup will get a 404 for both:
--
--     mcp: update_data_api(project_id, branch_id, database_name, db_schemas)
--     or:  Neon console -> Data API -> save settings
--
-- Then re-run db/checks.sql, and mint the code:
--
--     select public.create_superadmin_setup_code();
