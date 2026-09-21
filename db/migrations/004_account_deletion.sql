-- 004_account_deletion.sql — superadmin-only account deletion and progress reset
--
-- Moves both destructive operations to the top tier:
--
--   * admin_delete_account(target)   new
--   * admin_reset_progress(target)   was any admin for one learner; now
--                                    superadmin only, for one learner or all
--
-- An ordinary admin is left with the moderation jobs — approve, suspend, and
-- moving accounts between learner and admin. Nothing an admin can do any more
-- destroys data.
--
-- WHAT "DELETE" MEANS HERE — read before relying on it.
--
-- An account lives in two systems. This app owns the Postgres half and can
-- erase it completely. The login identity lives in Stack Auth, and removing it
-- needs Stack's secret server key — which a static site with no backend of its
-- own (README, "no server of ours in the middle") has nowhere safe to keep.
--
-- So deletion here erases every row this app holds about the person and then
-- records a tombstone, so ensure_profile() refuses to recreate them. They can
-- still authenticate with Stack, but the app shows "account deleted" and the
-- database grants them nothing: is_approved() finds no profile, so RLS denies
-- every study table. Their email also stays registered in Stack, so the same
-- address cannot sign up again. Removing the Stack identity is a separate step
-- in the Neon console (Auth -> Users) until the app has a server of its own.

-- ---------------------------------------------------------------------------
-- 1. Tombstones
-- ---------------------------------------------------------------------------
--
-- user_id only. Keeping the email of someone whose account was deleted would
-- defeat the point of deleting it, and user_id is all the refusal needs.

create table if not exists public.deleted_accounts (
  user_id    text primary key,
  deleted_at timestamptz not null default now(),
  deleted_by text
);

-- Never reachable from the browser, like admin_allowlist.
revoke all on public.deleted_accounts from authenticated, anonymous;
alter table public.deleted_accounts enable row level security;
alter table public.deleted_accounts force row level security;

-- ---------------------------------------------------------------------------
-- 2. Deleting an account
-- ---------------------------------------------------------------------------
--
-- There are no foreign keys between profiles and the study tables (001 leaves
-- them out on purpose), so nothing cascades. Every table is cleared by hand,
-- and the profile goes last so a failure part-way leaves the account visible
-- in the console rather than orphaning its study rows.

create or replace function public.admin_delete_account(target_user text)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  target_role text;
begin
  if not public.is_superadmin() then
    raise exception 'superadmin privileges required';
  end if;
  if target_user = auth.user_id() then
    raise exception 'you cannot delete your own account';
  end if;

  select role into target_role from public.profiles where user_id = target_user;
  if target_role is null then
    raise exception 'no such account';
  end if;

  -- Unreachable while the self-check above holds — the caller is an approved
  -- superadmin who is not the target, so at least one always remains. Kept so
  -- that loosening the self-check later cannot silently empty the tier.
  if target_role = 'superadmin' and public.other_superadmins(target_user) = 0 then
    raise exception 'cannot delete the last superadmin';
  end if;

  delete from public.srs_cards  where user_id = target_user;
  delete from public.review_log where user_id = target_user;

  insert into public.deleted_accounts (user_id, deleted_by)
  values (target_user, auth.user_id())
  on conflict (user_id) do nothing;

  delete from public.profiles where user_id = target_user;
end;
$$;

grant execute on function public.admin_delete_account(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Resetting progress
-- ---------------------------------------------------------------------------
--
-- Same body as 003 with the tier check moved to the top. The per-row guard
-- 003 needed ("an admin may not reset a superadmin") disappears, because an
-- ordinary admin can no longer reset anyone.

create or replace function public.admin_reset_progress(target_user text default null)
returns bigint
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  removed bigint;
begin
  if not public.is_superadmin() then
    raise exception 'superadmin privileges required';
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

grant execute on function public.admin_reset_progress(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Refusing a deleted account
-- ---------------------------------------------------------------------------
--
-- ensure_profile() is the only way a profile comes into existence, so this is
-- the one place deletion has to be enforced. Without it the next sign-in would
-- quietly recreate the account as a fresh pending learner.
--
-- The tombstone is checked before the allowlist on purpose: a deleted owner
-- stays deleted, rather than being resurrected as a superadmin.
--
-- The message is matched by the client (src/lib/auth/useProfile.js) to show
-- the "account deleted" screen instead of a generic error. Change both
-- together.

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
  seeded boolean;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  if exists (select 1 from public.deleted_accounts d where d.user_id = uid) then
    raise exception 'account deleted';
  end if;

  select u.email into addr from neon_auth.users_sync u where u.id = uid;
  select exists (
    select 1 from public.admin_allowlist a where lower(a.email) = lower(coalesce(addr, ''))
  ) into seeded;

  insert into public.profiles as p (user_id, email, role, status, approved_at, approved_by)
  values (
    uid,
    addr,
    case when seeded then 'superadmin' else 'user' end,
    case when seeded then 'approved' else 'pending' end,
    case when seeded then now() else null end,
    case when seeded then 'allowlist' else null end
  )
  on conflict (user_id) do update
    set email = coalesce(excluded.email, p.email);

  return query
    select p.user_id, p.email, p.display_name, p.role, p.status, p.levels, p.furigana, p.theme
    from public.profiles p
    where p.user_id = uid;
end;
$$;

grant execute on function public.ensure_profile() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. AFTER APPLYING THIS FILE
-- ---------------------------------------------------------------------------
--
-- admin_delete_account() is new, so Neon's Data API schema cache is stale and
-- /rpc/admin_delete_account will answer 404 until it is reloaded:
--
--     mcp: update_data_api(project_id, branch_id, database_name, db_schemas)
--     or:  Neon console -> Data API -> save settings
--
-- Then re-run db/checks.sql.
