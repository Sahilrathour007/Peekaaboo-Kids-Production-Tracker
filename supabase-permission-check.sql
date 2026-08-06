select
  schemaname,
  tablename,
  policyname,
  cmd,
  roles
from pg_policies
where schemaname = 'public'
  and tablename in (
    'production_tracker_state',
    'fabrics',
    'cuttings',
    'cutting_fabric_components',
    'cutting_stage_movements',
    'outsourcing',
    'outsourcing_sizes',
    'outsourcing_accessories',
    'outsourcing_receipts',
    'accessory_stock'
  )
order by tablename, cmd, policyname;

select
  table_schema,
  table_name,
  privilege_type,
  grantee
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
  and table_name in (
    'production_tracker_state',
    'fabrics',
    'cuttings',
    'cutting_fabric_components',
    'cutting_stage_movements',
    'outsourcing',
    'outsourcing_sizes',
    'outsourcing_accessories',
    'outsourcing_receipts',
    'accessory_stock'
  )
order by table_name, grantee, privilege_type;

select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  p.prosecdef as security_definer,
  r.rolname as grantee,
  has_function_privilege(r.rolname, p.oid, 'execute') as can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join (values ('anon'), ('authenticated')) as r(rolname)
where n.nspname = 'public'
  and p.proname = 'replace_relational_data'
order by r.rolname;
