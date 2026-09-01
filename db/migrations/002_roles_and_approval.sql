-- 002_roles_and_approval.sql — admin/user roles and account approval
--
-- Adds two things to the model in 001:
--   1. Every account has a role ('user' | 'admin') and a status
--      ('pending' | 'approved' | 'suspended'). New signups start pending and
--      cannot study until an admin approves them.
--   2. An admin console that manages accounts and can wipe learning progress.
--
-- THREAT MODEL — read before changing any grant below.
--
-- The browser talks straight to Postgres through PostgREST. There is no server
-- of ours in between, so anything the `authenticated` role is allowed to do,
-- a user can do by hand with curl and their own JWT. In particular, a policy
-- of `for all using (user_id = auth.user_id())` would let anyone PATCH their
-- own row with {"role":"admin","status":"approved"} and approve themselves,
-- which would make admin approval decorative.
--
-- So privilege lives in two places and neither is reachable from the table:
--   * role and status are REVOKED at column level from `authenticated`.
--     No policy can grant back what the column grant withholds.
--   * every privileged action is a SECURITY DEFINER function that re-checks
--     admin membership itself, with a pinned search_path.

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists role   text not null default 'user'
    check (role in ('user', 'admin')),
  add column if not exists status text not null default 'pending'
    check (status in ('pending', 'approved', 'suspended')),
  add column if not exists email  text,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by text;

create index if not exists profiles_status_idx on public.profiles (status);

-- Bootstrap. An account whose email is listed here becomes an approved admin
-- the first time it signs in — otherwise the very first admin could only be
-- created by hand in SQL, and a fresh deployment would have nobody able to
-- approve anyone.
create table if not exists public.admin_allowlist (
  email      text primary key,
  note       text,
  created_at timestamptz not null default now()
);

insert into public.admin_allowlist (email, note)
values ('sumaykudesign@gmail.com', 'Project owner — seeded by migration 002')
on conflict (email) do nothing;

-- Never reachable from the browser: no grants to authenticated or anonymous.
revoke all on public.admin_allowlist from authenticated, anonymous;
alter table public.admin_allowlist enable row level security;
alter table public.admin_allowlist force row level security;

-- ---------------------------------------------------------------------------
-- 2. Predicates
-- ---------------------------------------------------------------------------
--
-- SECURITY DEFINER so they can read profiles without the caller needing rights
-- on it, and STABLE so the planner may cache them within a statement.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1 from public.profiles
    where user_id = auth.user_id()
      and role = 'admin'
      and status = 'approved'
  );
$$;

create or replace function public.is_approved()
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1 from public.profiles
    where user_id = auth.user_id()
      and status = 'approved'
  );
$$;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_approved() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Profile bootstrap
-- ---------------------------------------------------------------------------
--
-- Called by the client on every sign-in. Creates the profile on first contact,
-- consults the allowlist, and returns the caller's own row. Insert privilege on
-- profiles is NOT granted to authenticated — this function is the only way a
-- profile comes into existence, which is what stops a user choosing their own
-- role at creation time.

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
-- The RETURNS TABLE columns (user_id, email, role...) shadow the real columns
-- inside this body, which makes `on conflict (user_id)` ambiguous. Resolving
-- conflicts to the column is what we want everywhere here; the only true
-- variables below (uid, addr, seeded) have names that cannot collide.
#variable_conflict use_column
declare
  uid text := auth.user_id();
  addr text;
  seeded boolean;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  select u.email into addr from neon_auth.users_sync u where u.id = uid;
  select exists (
    select 1 from public.admin_allowlist a where lower(a.email) = lower(coalesce(addr, ''))
  ) into seeded;

  insert into public.profiles as p (user_id, email, role, status, approved_at, approved_by)
  values (
    uid,
    addr,
    case when seeded then 'admin' else 'user' end,
    case when seeded then 'approved' else 'pending' end,
    case when seeded then now() else null end,
    case when seeded then 'allowlist' else null end
  )
  on conflict (user_id) do update
    -- Keep the email fresh, but never re-derive role or status here: an
    -- admin's later decision must not be undone by the next sign-in.
    set email = coalesce(excluded.email, p.email);

  return query
    select p.user_id, p.email, p.display_name, p.role, p.status, p.levels, p.furigana, p.theme
    from public.profiles p
    where p.user_id = uid;
end;
$$;

grant execute on function public.ensure_profile() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Admin operations
-- ---------------------------------------------------------------------------
--
-- Each one re-checks is_admin() itself. A SECURITY DEFINER function runs with
-- the owner's rights, so forgetting that check in any one of them would hand
-- the whole table to any signed-in user.

create or replace function public.admin_list_accounts()
returns table (
  user_id text,
  email text,
  role text,
  status text,
  created_at timestamptz,
  approved_at timestamptz,
  cards bigint,
  reviews bigint,
  last_active timestamptz
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if not public.is_admin() then
    raise exception 'admin privileges required';
  end if;

  return query
    select
      p.user_id, p.email, p.role, p.status, p.created_at, p.approved_at,
      coalesce(c.n, 0)   as cards,
      coalesce(l.n, 0)   as reviews,
      c.last_seen        as last_active
    from public.profiles p
    left join (
      select s.user_id, count(*) as n, max(s.updated_at) as last_seen
      from public.srs_cards s group by s.user_id
    ) c on c.user_id = p.user_id
    left join (
      select r.user_id, sum(r.reviews) as n
      from public.review_log r group by r.user_id
    ) l on l.user_id = p.user_id
    order by
      case p.status when 'pending' then 0 when 'approved' then 1 else 2 end,
      p.created_at desc;
end;
$$;

create or replace function public.admin_set_status(target_user text, new_status text)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if not public.is_admin() then
    raise exception 'admin privileges required';
  end if;
  if new_status not in ('pending', 'approved', 'suspended') then
    raise exception 'invalid status: %', new_status;
  end if;
  -- An admin locking themselves out would leave nobody able to unlock them,
  -- since only an admin can change status.
  if target_user = auth.user_id() then
    raise exception 'you cannot change your own status';
  end if;

  update public.profiles
  set status = new_status,
      approved_at = case when new_status = 'approved' then now() else approved_at end,
      approved_by = case when new_status = 'approved' then auth.user_id() else approved_by end
  where user_id = target_user;
end;
$$;

create or replace function public.admin_set_role(target_user text, new_role text)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if not public.is_admin() then
    raise exception 'admin privileges required';
  end if;
  if new_role not in ('user', 'admin') then
    raise exception 'invalid role: %', new_role;
  end if;
  if target_user = auth.user_id() then
    raise exception 'you cannot change your own role';
  end if;

  update public.profiles set role = new_role where user_id = target_user;
end;
$$;

-- Wipes learning progress. target_user null means every account, which is the
-- "reset all progress" button in the admin console. Profiles and accounts are
-- untouched — this clears study history, it does not delete people.
create or replace function public.admin_reset_progress(target_user text default null)
returns bigint
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  removed bigint;
begin
  if not public.is_admin() then
    raise exception 'admin privileges required';
  end if;

  if target_user is null then
    delete from public.srs_cards;
    get diagnostics removed = row_count;
    delete from public.review_log;
  else
    delete from public.srs_cards where user_id = target_user;
    get diagnostics removed = row_count;
    delete from public.review_log where user_id = target_user;
  end if;

  return removed;
end;
$$;

create or replace function public.admin_stats()
returns table (total bigint, pending bigint, approved bigint, suspended bigint, admins bigint, cards bigint)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if not public.is_admin() then
    raise exception 'admin privileges required';
  end if;

  return query
    select
      count(*)::bigint,
      count(*) filter (where status = 'pending')::bigint,
      count(*) filter (where status = 'approved')::bigint,
      count(*) filter (where status = 'suspended')::bigint,
      count(*) filter (where role = 'admin')::bigint,
      (select count(*) from public.srs_cards)::bigint
    from public.profiles;
end;
$$;

grant execute on function public.admin_list_accounts()                    to authenticated;
grant execute on function public.admin_set_status(text, text)             to authenticated;
grant execute on function public.admin_set_role(text, text)               to authenticated;
grant execute on function public.admin_reset_progress(text)               to authenticated;
grant execute on function public.admin_stats()                            to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Lock down the profiles table
-- ---------------------------------------------------------------------------
--
-- This is the part that makes approval mean something. Column-level grants sit
-- underneath RLS: a policy can only permit what a grant already allows, so
-- withholding UPDATE on role and status here closes the escalation path no
-- matter what a future policy says.

revoke insert, update, delete on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, levels, furigana, theme) on public.profiles to authenticated;

drop policy if exists profiles_own on public.profiles;

create policy profiles_read_own on public.profiles
  for select to authenticated
  using (user_id = auth.user_id());

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (user_id = auth.user_id())
  with check (user_id = auth.user_id());

-- ---------------------------------------------------------------------------
-- 6. Gate study data behind approval
-- ---------------------------------------------------------------------------

drop policy if exists srs_cards_own  on public.srs_cards;
drop policy if exists review_log_own on public.review_log;

create policy srs_cards_own on public.srs_cards
  for all to authenticated
  using (user_id = auth.user_id() and public.is_approved())
  with check (user_id = auth.user_id() and public.is_approved());

create policy review_log_own on public.review_log
  for all to authenticated
  using (user_id = auth.user_id() and public.is_approved())
  with check (user_id = auth.user_id() and public.is_approved());

-- ---------------------------------------------------------------------------
-- 7. AFTER APPLYING THIS FILE
-- ---------------------------------------------------------------------------
--
-- Neon's Data API caches the Postgres schema and does NOT pick up new
-- functions on its own. Until it is reloaded, every /rpc/ call answers
--
--     404  "Could not find the function ... in the schema cache"
--
-- which looks exactly like a permissions failure but is not. `NOTIFY pgrst,
-- 'reload schema'` does not reach it, and restarting the compute endpoint does
-- not either. What works is touching the Data API configuration:
--
--     mcp: update_data_api(project_id, branch_id, database_name, db_schemas)
--     or:  Neon console -> Data API -> save settings
--
-- Do this after every migration that adds or changes a function, then re-run
-- the checks in db/checks.sql. A 404 from /rpc/ means a stale cache; a 400
-- carrying "admin privileges required" means the guard is genuinely working.
