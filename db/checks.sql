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
  and c.relname in ('profiles', 'srs_cards', 'review_log', 'admin_allowlist')
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

-- 7. every admin function must actually check is_admin() in its body.
--    A SECURITY DEFINER function without this check is a full table handout.
select
  case when count(*) = 0 then 'PASS' else 'FAIL' end,
  'admin functions all call is_admin()',
  coalesce(string_agg(proname, ','), '(none)')
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname like 'admin\_%'
  and pg_get_functiondef(p.oid) not like '%is_admin()%';
