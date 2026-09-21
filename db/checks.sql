-- Security checks for the accounts model. Run after any migration that touches
-- grants, policies or the admin functions. Every row returned should say PASS.
--
--   psql "$DATABASE_URL" -f db/checks.sql
--
-- These verify the database side only. The end-to-end checks that matter just
-- as much — that a signed-in user cannot escalate through the Data API — live
-- in README "Verifying the access rules", because they need a real JWT.

-- 1. role and status must NOT be writable by the authenticated role.
select
  case when count(*) = 0 then 'PASS' else 'FAIL' end as result,
  'authenticated cannot UPDATE profiles.role/status' as check,
  coalesce(string_agg(column_name, ','), '(none)') as detail
from information_schema.column_privileges
where table_schema = 'public'
  and table_name = 'profiles'
  and grantee = 'authenticated'
  and privilege_type = 'UPDATE'
  and column_name in ('role', 'status', 'approved_at', 'approved_by', 'user_id');

-- 2. authenticated must not be able to INSERT or DELETE profiles at all;
--    profiles are created only by ensure_profile().
select
  case when count(*) = 0 then 'PASS' else 'FAIL' end,
  'authenticated cannot INSERT/DELETE profiles',
  coalesce(string_agg(privilege_type, ','), '(none)')
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'profiles'
  and grantee = 'authenticated' and privilege_type in ('INSERT', 'DELETE');

-- 3. the signed-out role must reach nothing.
select
  case when count(*) = 0 then 'PASS' else 'FAIL' end,
  'anonymous has no table grants',
  coalesce(string_agg(table_name || ':' || privilege_type, ','), '(none)')
from information_schema.role_table_grants
where table_schema = 'public' and grantee = 'anonymous';

-- 4. RLS must be enabled AND forced on every data table.
select
  case when count(*) = 0 then 'PASS' else 'FAIL' end,
  'RLS enabled and forced on all data tables',
  coalesce(string_agg(relname, ','), '(none)')
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
  and c.relname in ('profiles', 'srs_cards', 'review_log', 'deleted_accounts', 'superadmin_setup')
  and not (c.relrowsecurity and c.relforcerowsecurity);

-- 5. study tables must be gated on approval, not merely on ownership.
select
  case when count(*) = 2 then 'PASS' else 'FAIL' end,
  'srs_cards and review_log policies require is_approved()',
  count(*)::text || ' of 2'
from pg_policy p join pg_class c on c.oid = p.polrelid
where c.relname in ('srs_cards', 'review_log')
  and pg_get_expr(p.polqual, p.polrelid) like '%is_approved%';

-- 6. every admin function must be SECURITY DEFINER with a pinned search_path.
select
  case when count(*) = 0 then 'PASS' else 'FAIL' end,
  'admin functions are SECURITY DEFINER with pinned search_path',
  coalesce(string_agg(proname, ','), '(none)')
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname like 'admin\_%'
  and (not p.prosecdef or p.proconfig is null);

-- 7. every admin function must actually check a tier in its body.
--    A SECURITY DEFINER function without this check is a full table handout.
--    is_superadmin() counts: it is strictly narrower than is_admin(), and the
--    superadmin-only functions from 004 call it instead.
select
  case when count(*) = 0 then 'PASS' else 'FAIL' end,
  'admin functions all call is_admin() or is_superadmin()',
  coalesce(string_agg(proname, ','), '(none)')
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname like 'admin\_%'
  and pg_get_functiondef(p.oid) not like '%is_admin()%'
  and pg_get_functiondef(p.oid) not like '%is_superadmin()%';

-- ---------------------------------------------------------------------------
-- Superadmin tier (migration 003)
-- ---------------------------------------------------------------------------

-- 8. the role column must accept exactly the three known roles.
select
  case when count(*) = 1 then 'PASS' else 'FAIL' end,
  'profiles.role check covers user/admin/superadmin',
  coalesce(string_agg(pg_get_constraintdef(oid), ' '), '(none)')
from pg_constraint
where conrelid = 'public.profiles'::regclass
  and contype = 'c'
  and pg_get_constraintdef(oid) like '%superadmin%';

-- 9. is_admin() must admit a superadmin, or the top tier locks itself out of
--    every admin_* function in 002.
select
  case when pg_get_functiondef(p.oid) like '%superadmin%' then 'PASS' else 'FAIL' end,
  'is_admin() admits superadmin',
  'checked'
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'is_admin';

-- 10. the reserved powers must actually consult is_superadmin(). Without this
--     the tier is decorative: an ordinary admin could still wipe everything.
select
  case when count(*) = 3 then 'PASS' else 'FAIL' end,
  'set_role, set_status and reset_progress check is_superadmin()',
  count(*)::text || ' of 3'
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('admin_set_role', 'admin_set_status', 'admin_reset_progress')
  and pg_get_functiondef(p.oid) like '%is_superadmin()%';

-- 11. somebody must be able to hold the top tier — either a superadmin exists
--     now, or the one-time setup path from 005 is installed so the database
--     owner can mint a code. Failing both, nobody can ever reach the tier:
--     admin_set_role() reserves it for an existing superadmin.
--
--     A fresh deployment legitimately has zero superadmins, which is why this
--     is not a plain count. "code outstanding" is informational.
select
  case when live > 0 or setup_installed then 'PASS' else 'FAIL' end,
  'a superadmin exists, or one can still be set up with a code',
  live::text || ' active, setup path ' || case when setup_installed then 'installed' else 'MISSING' end
    || ', code outstanding: ' || outstanding::text
from (
  select
    (select count(*) from public.profiles
      where role = 'superadmin' and status = 'approved') as live,
    to_regprocedure('public.create_superadmin_setup_code(interval)') is not null as setup_installed,
    (select count(*) from public.superadmin_setup where expires_at > now()) as outstanding
) s;

-- 12. internal functions must not be callable from the browser.
--
--     Tested with has_function_privilege(), NOT by listing grantees. A new
--     function here is callable through two grants at once: Postgres gives
--     EXECUTE to PUBLIC, which every role inherits, and Neon's default
--     privileges give it to authenticated explicitly. Revoking either alone
--     leaves the other. An earlier version of this check read
--     information_schema.routine_privileges for the names 'authenticated' and
--     'anonymous', never saw the PUBLIC grant, and passed while
--     other_superadmins() was callable by anyone.
--
--     create_superadmin_setup_code() is the one that matters most. If a browser
--     could call it, any signed-in user could mint a code and claim the top
--     tier on a deployment that has no superadmin yet.
select
  case when count(*) = 0 then 'PASS' else 'FAIL' end,
  'internal functions are not executable by authenticated or anonymous',
  coalesce(string_agg(fn || ' by ' || r, ', '), '(none)')
from (values
  ('public.other_superadmins(text)'),
  ('public.create_superadmin_setup_code(interval)'),
  ('public.claim_superadmin_as(text,text)'),
  ('public.superadmin_code_hash(text)')
) f(fn)
cross join (values ('authenticated'), ('anonymous')) g(r)
where to_regprocedure(fn) is not null
  and has_function_privilege(r, fn, 'execute');

-- ---------------------------------------------------------------------------
-- Destructive operations (migration 004)
-- ---------------------------------------------------------------------------

-- 13. deleting accounts and resetting progress are superadmin-only. Both must
--     gate on is_superadmin() itself — an is_admin() check alone would hand
--     them back to every ordinary admin.
select
  case when count(*) = 2 then 'PASS' else 'FAIL' end,
  'delete_account and reset_progress require is_superadmin()',
  count(*)::text || ' of 2'
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('admin_delete_account', 'admin_reset_progress')
  and pg_get_functiondef(p.oid) like '%if not public.is_superadmin() then%';

-- 14. tombstones hold who was deleted and by whom. The browser has no business
--     reading or writing them.
select
  case when count(*) = 0 then 'PASS' else 'FAIL' end,
  'deleted_accounts has no grants to authenticated/anonymous',
  coalesce(string_agg(grantee || ':' || privilege_type, ','), '(none)')
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'deleted_accounts'
  and grantee in ('authenticated', 'anonymous');

-- 15. ensure_profile() is the only door back in. If it stops consulting the
--     tombstones, the next sign-in silently recreates every deleted account.
select
  case when pg_get_functiondef(p.oid) like '%deleted_accounts%' then 'PASS' else 'FAIL' end,
  'ensure_profile() refuses deleted accounts',
  'checked'
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'ensure_profile';

-- ---------------------------------------------------------------------------
-- One-time superadmin setup (migration 005)
-- ---------------------------------------------------------------------------

-- 16. no account may be given a role because of its email. Stack Auth here
--     does not verify email ownership, so an address proves nothing.
select
  case when def not like '%admin_allowlist%' and def not like '%''superadmin''%' and def not like '%''admin''%'
       then 'PASS' else 'FAIL' end,
  'ensure_profile() derives no role from an email address',
  'checked'
from (
  select pg_get_functiondef(p.oid) as def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'ensure_profile'
) s;

-- 17. the setup code's hash is not for the browser to read or overwrite.
select
  case when count(*) = 0 then 'PASS' else 'FAIL' end,
  'superadmin_setup is not readable or writable by authenticated/anonymous',
  coalesce(string_agg(r || ':' || priv, ','), '(none)')
from (values ('authenticated'), ('anonymous')) g(r)
cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) p(priv)
where to_regclass('public.superadmin_setup') is not null
  and has_table_privilege(r, 'public.superadmin_setup', priv);

-- 18. the two functions the setup page calls must be reachable, or /admin/setup
--     fails with a refusal that looks like a bug rather than a guard.
select
  case when count(*) = 2 then 'PASS' else 'FAIL' end,
  'claim_superadmin() and superadmin_setup_available() are callable when signed in',
  count(*)::text || ' of 2'
from (values
  ('public.claim_superadmin(text)'),
  ('public.superadmin_setup_available()')
) f(fn)
where to_regprocedure(fn) is not null
  and has_function_privilege('authenticated', fn, 'execute');

-- 19. the claim must close the door behind it: refuse once a superadmin exists,
--     and destroy the code on success. Either missing turns "one-time" into
--     "any number of times".
select
  case when def like '%setup already completed%' and def like '%delete from public.superadmin_setup%'
       then 'PASS' else 'FAIL' end,
  'claim refuses after setup and consumes the code',
  'checked'
from (
  select pg_get_functiondef(p.oid) as def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'claim_superadmin_as'
) s;

-- 20. the setup functions touch profiles and the code table with the owner's
--     rights, so like the admin_* functions they must be SECURITY DEFINER with
--     a pinned search_path.
select
  case when count(*) = 4 then 'PASS' else 'FAIL' end,
  'setup functions are SECURITY DEFINER with pinned search_path',
  count(*)::text || ' of 4'
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('create_superadmin_setup_code', 'claim_superadmin_as', 'claim_superadmin', 'superadmin_setup_available')
  and p.prosecdef
  and p.proconfig is not null;
