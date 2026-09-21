-- 003_superadmin.sql — a superadmin tier above admin
--
-- 002 gave every admin identical power, which left two holes:
--
--   * any admin could demote any other admin, including the allowlist-seeded
--     owner. ensure_profile() deliberately never re-derives role on later
--     sign-ins, so that demotion was permanent and only raw SQL could undo it.
--   * any admin could wipe every learner's progress in one call.
--
-- This file adds a third role, 'superadmin', and reserves those two powers for
-- it. The shape of 002 is kept: privilege still lives in SECURITY DEFINER
-- functions with a pinned search_path, never in a table a client can PATCH.
--
-- ROUTE MAPPING (authorised here, applied in the client)
--   /        learners        role = 'user'
--   /admin   administrators  role in ('admin', 'superadmin')
--
-- The route is convenience. What actually stops a learner reading the account
-- list is that admin_list_accounts() calls is_admin() and raises.

-- ---------------------------------------------------------------------------
-- 1. The role itself
-- ---------------------------------------------------------------------------

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('user', 'admin', 'superadmin'));

-- ---------------------------------------------------------------------------
-- 2. Predicates
-- ---------------------------------------------------------------------------
--
-- is_admin() now answers "may this caller use the admin console", which both
-- tiers may. Every admin_* function in 002 keeps working for a superadmin
-- unchanged because of this one line.

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
      and role in ('admin', 'superadmin')
      and status = 'approved'
  );
$$;

create or replace function public.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1 from public.profiles
    where user_id = auth.user_id()
      and role = 'superadmin'
      and status = 'approved'
  );
$$;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_superadmin() to authenticated;

-- Counts approved superadmins other than one given account. Used to refuse the
-- change that would leave nobody able to appoint a superadmin again.
create or replace function public.other_superadmins(except_user text)
returns bigint
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select count(*)
  from public.profiles
  where role = 'superadmin'
    and status = 'approved'
    and user_id is distinct from except_user;
$$;

-- Internal helper only: the client never calls this.
revoke all on function public.other_superadmins(text) from authenticated, anonymous;

-- ---------------------------------------------------------------------------
-- 3. Role changes
-- ---------------------------------------------------------------------------

create or replace function public.admin_set_role(target_user text, new_role text)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  target_role text;
begin
  if not public.is_admin() then
    raise exception 'admin privileges required';
  end if;
  if new_role not in ('user', 'admin', 'superadmin') then
    raise exception 'invalid role: %', new_role;
  end if;
  if target_user = auth.user_id() then
    raise exception 'you cannot change your own role';
  end if;

  select role into target_role from public.profiles where user_id = target_user;
  if target_role is null then
    raise exception 'no such account';
  end if;

  -- Granting or revoking the top tier is itself a superadmin power. Without
  -- this an ordinary admin could promote themselves a deputy, or strip the
  -- owner, and the tier would mean nothing.
  if (new_role = 'superadmin' or target_role = 'superadmin') and not public.is_superadmin() then
    raise exception 'only a superadmin can change superadmin membership';
  end if;

  -- Losing the last superadmin is unrecoverable from inside the app: the
  -- allowlist only applies when a profile is first created, so nobody could
  -- ever be appointed again.
  if target_role = 'superadmin' and new_role <> 'superadmin'
     and public.other_superadmins(target_user) = 0 then
    raise exception 'cannot demote the last superadmin';
  end if;

  update public.profiles set role = new_role where user_id = target_user;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Status changes
-- ---------------------------------------------------------------------------
--
-- Suspending a superadmin is demotion by another name — a suspended account
-- fails is_admin() — so it needs the same guard.

create or replace function public.admin_set_status(target_user text, new_status text)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  target_role text;
begin
  if not public.is_admin() then
    raise exception 'admin privileges required';
  end if;
  if new_status not in ('pending', 'approved', 'suspended') then
    raise exception 'invalid status: %', new_status;
  end if;
  if target_user = auth.user_id() then
    raise exception 'you cannot change your own status';
  end if;

  select role into target_role from public.profiles where user_id = target_user;
  if target_role is null then
    raise exception 'no such account';
  end if;

  if target_role = 'superadmin' and not public.is_superadmin() then
    raise exception 'only a superadmin can change a superadmin account';
  end if;

  if target_role = 'superadmin' and new_status <> 'approved'
     and public.other_superadmins(target_user) = 0 then
    raise exception 'cannot suspend the last superadmin';
  end if;

  update public.profiles
  set status = new_status,
      approved_at = case when new_status = 'approved' then now() else approved_at end,
      approved_by = case when new_status = 'approved' then auth.user_id() else approved_by end
  where user_id = target_user;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Destructive operations
-- ---------------------------------------------------------------------------
--
-- Clearing one learner stays an ordinary admin job: it affects one person, who
-- can start again. Clearing EVERY account does not, so it moves up a tier.

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
    if not public.is_superadmin() then
      raise exception 'only a superadmin can reset every account';
    end if;
    delete from public.srs_cards;
    get diagnostics removed = row_count;
    delete from public.review_log;
  else
    -- Keeps "a superadmin row is untouchable for an ordinary admin" true for
    -- every action, not just role and status. A superadmin holds no study
    -- data in practice, so this costs nothing and removes a special case.
    if not public.is_superadmin()
       and exists (
         select 1 from public.profiles
         where user_id = target_user and role = 'superadmin'
       ) then
      raise exception 'only a superadmin can change a superadmin account';
    end if;

    delete from public.srs_cards where user_id = target_user;
    get diagnostics removed = row_count;
    delete from public.review_log where user_id = target_user;
  end if;

  return removed;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Bootstrap
-- ---------------------------------------------------------------------------
--
-- The allowlist now seeds the top tier. Everything else about ensure_profile
-- is unchanged from 002, including the deliberate refusal to re-derive role or
-- status on later sign-ins.

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

-- Owner accounts created as 'admin' by 002 are lifted here, or the deployment
-- ends up with a superadmin tier nobody occupies.
update public.profiles p
set role = 'superadmin'
where p.role = 'admin'
  and exists (
    select 1 from public.admin_allowlist a
    where lower(a.email) = lower(coalesce(p.email, ''))
  );

-- ---------------------------------------------------------------------------
-- 7. Stats
-- ---------------------------------------------------------------------------
--
-- RETURNS TABLE is part of the signature, so adding a column needs a drop.
-- `admins` counts everyone who can reach the console, superadmins included.

drop function if exists public.admin_stats();

create function public.admin_stats()
returns table (
  total bigint, pending bigint, approved bigint, suspended bigint,
  admins bigint, superadmins bigint, cards bigint
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
      count(*)::bigint,
      count(*) filter (where status = 'pending')::bigint,
      count(*) filter (where status = 'approved')::bigint,
      count(*) filter (where status = 'suspended')::bigint,
      count(*) filter (where role in ('admin', 'superadmin'))::bigint,
      count(*) filter (where role = 'superadmin')::bigint,
      (select count(*) from public.srs_cards)::bigint
    from public.profiles;
end;
$$;

grant execute on function public.admin_stats() to authenticated;
grant execute on function public.admin_set_role(text, text) to authenticated;
grant execute on function public.admin_set_status(text, text) to authenticated;
grant execute on function public.admin_reset_progress(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. AFTER APPLYING THIS FILE
-- ---------------------------------------------------------------------------
--
-- This migration drops and recreates admin_stats() and adds is_superadmin(),
-- so Neon's Data API schema cache is now stale and every /rpc/ call will
-- answer 404 "Could not find the function ... in the schema cache" until it is
-- reloaded. NOTIFY pgrst does not reach it, and neither does restarting the
-- compute endpoint. Touch the Data API configuration instead:
--
--     mcp: update_data_api(project_id, branch_id, database_name, db_schemas)
--     or:  Neon console -> Data API -> save settings
--
-- Then re-run db/checks.sql.
