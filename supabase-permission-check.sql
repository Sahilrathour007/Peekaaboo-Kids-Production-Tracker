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
