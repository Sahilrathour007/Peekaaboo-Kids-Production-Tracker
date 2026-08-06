-- Run this once in Supabase SQL Editor against the live project.
-- It removes anonymous write/RPC access and makes the atomic replace RPC obey
-- the caller's grants and RLS policies instead of bypassing them as postgres.

begin;

grant usage on schema public to authenticated;
revoke usage on schema public from anon;

revoke all on table public.production_tracker_state from anon;
revoke all on table public.fabrics from anon;
revoke all on table public.cuttings from anon;
revoke all on table public.cutting_fabric_components from anon;
revoke all on table public.cutting_stage_movements from anon;
revoke all on table public.outsourcing from anon;
revoke all on table public.outsourcing_sizes from anon;
revoke all on table public.outsourcing_accessories from anon;
revoke all on table public.outsourcing_receipts from anon;
revoke all on table public.accessory_stock from anon;

grant select, insert, update, delete on table public.production_tracker_state to authenticated;
grant select, insert, update, delete on table public.fabrics to authenticated;
grant select, insert, update, delete on table public.cuttings to authenticated;
grant select, insert, update, delete on table public.cutting_fabric_components to authenticated;
grant select, insert, update, delete on table public.cutting_stage_movements to authenticated;
grant select, insert, update, delete on table public.outsourcing to authenticated;
grant select, insert, update, delete on table public.outsourcing_sizes to authenticated;
grant select, insert, update, delete on table public.outsourcing_accessories to authenticated;
grant select, insert, update, delete on table public.outsourcing_receipts to authenticated;
grant select, insert, update, delete on table public.accessory_stock to authenticated;

alter function if exists public.replace_relational_data(jsonb) security invoker;
revoke execute on function public.replace_relational_data(jsonb) from anon;
grant execute on function public.replace_relational_data(jsonb) to authenticated;

drop policy if exists "production tracker public read" on public.production_tracker_state;
create policy "production tracker public read"
  on public.production_tracker_state
  for select
  to authenticated
  using (auth.uid() is not null);

drop policy if exists "production tracker public write" on public.production_tracker_state;
create policy "production tracker public write"
  on public.production_tracker_state
  for insert
  to authenticated
  with check (auth.uid() is not null);

drop policy if exists "production tracker public update" on public.production_tracker_state;
create policy "production tracker public update"
  on public.production_tracker_state
  for update
  to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

drop policy if exists "production tracker fabrics read" on public.fabrics;
create policy "production tracker fabrics read" on public.fabrics for select to authenticated using (auth.uid() is not null);
drop policy if exists "production tracker fabrics insert" on public.fabrics;
create policy "production tracker fabrics insert" on public.fabrics for insert to authenticated with check (auth.uid() is not null);
drop policy if exists "production tracker fabrics update" on public.fabrics;
create policy "production tracker fabrics update" on public.fabrics for update to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop policy if exists "production tracker fabrics delete" on public.fabrics;
create policy "production tracker fabrics delete" on public.fabrics for delete to authenticated using (auth.uid() is not null);

drop policy if exists "production tracker cuttings read" on public.cuttings;
create policy "production tracker cuttings read" on public.cuttings for select to authenticated using (auth.uid() is not null);
drop policy if exists "production tracker cuttings insert" on public.cuttings;
create policy "production tracker cuttings insert" on public.cuttings for insert to authenticated with check (auth.uid() is not null);
drop policy if exists "production tracker cuttings update" on public.cuttings;
create policy "production tracker cuttings update" on public.cuttings for update to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop policy if exists "production tracker cuttings delete" on public.cuttings;
create policy "production tracker cuttings delete" on public.cuttings for delete to authenticated using (auth.uid() is not null);

drop policy if exists "production tracker cutting components read" on public.cutting_fabric_components;
create policy "production tracker cutting components read" on public.cutting_fabric_components for select to authenticated using (auth.uid() is not null);
drop policy if exists "production tracker cutting components insert" on public.cutting_fabric_components;
create policy "production tracker cutting components insert" on public.cutting_fabric_components for insert to authenticated with check (auth.uid() is not null);
drop policy if exists "production tracker cutting components update" on public.cutting_fabric_components;
create policy "production tracker cutting components update" on public.cutting_fabric_components for update to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop policy if exists "production tracker cutting components delete" on public.cutting_fabric_components;
create policy "production tracker cutting components delete" on public.cutting_fabric_components for delete to authenticated using (auth.uid() is not null);

drop policy if exists "production tracker stage movements read" on public.cutting_stage_movements;
create policy "production tracker stage movements read" on public.cutting_stage_movements for select to authenticated using (auth.uid() is not null);
drop policy if exists "production tracker stage movements insert" on public.cutting_stage_movements;
create policy "production tracker stage movements insert" on public.cutting_stage_movements for insert to authenticated with check (auth.uid() is not null);
drop policy if exists "production tracker stage movements update" on public.cutting_stage_movements;
create policy "production tracker stage movements update" on public.cutting_stage_movements for update to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop policy if exists "production tracker stage movements delete" on public.cutting_stage_movements;
create policy "production tracker stage movements delete" on public.cutting_stage_movements for delete to authenticated using (auth.uid() is not null);

drop policy if exists "production tracker outsourcing read" on public.outsourcing;
create policy "production tracker outsourcing read" on public.outsourcing for select to authenticated using (auth.uid() is not null);
drop policy if exists "production tracker outsourcing insert" on public.outsourcing;
create policy "production tracker outsourcing insert" on public.outsourcing for insert to authenticated with check (auth.uid() is not null);
drop policy if exists "production tracker outsourcing update" on public.outsourcing;
create policy "production tracker outsourcing update" on public.outsourcing for update to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop policy if exists "production tracker outsourcing delete" on public.outsourcing;
create policy "production tracker outsourcing delete" on public.outsourcing for delete to authenticated using (auth.uid() is not null);

drop policy if exists "production tracker outsourcing sizes read" on public.outsourcing_sizes;
create policy "production tracker outsourcing sizes read" on public.outsourcing_sizes for select to authenticated using (auth.uid() is not null);
drop policy if exists "production tracker outsourcing sizes insert" on public.outsourcing_sizes;
create policy "production tracker outsourcing sizes insert" on public.outsourcing_sizes for insert to authenticated with check (auth.uid() is not null);
drop policy if exists "production tracker outsourcing sizes update" on public.outsourcing_sizes;
create policy "production tracker outsourcing sizes update" on public.outsourcing_sizes for update to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop policy if exists "production tracker outsourcing sizes delete" on public.outsourcing_sizes;
create policy "production tracker outsourcing sizes delete" on public.outsourcing_sizes for delete to authenticated using (auth.uid() is not null);

drop policy if exists "production tracker outsourcing accessories read" on public.outsourcing_accessories;
create policy "production tracker outsourcing accessories read" on public.outsourcing_accessories for select to authenticated using (auth.uid() is not null);
drop policy if exists "production tracker outsourcing accessories insert" on public.outsourcing_accessories;
create policy "production tracker outsourcing accessories insert" on public.outsourcing_accessories for insert to authenticated with check (auth.uid() is not null);
drop policy if exists "production tracker outsourcing accessories update" on public.outsourcing_accessories;
create policy "production tracker outsourcing accessories update" on public.outsourcing_accessories for update to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop policy if exists "production tracker outsourcing accessories delete" on public.outsourcing_accessories;
create policy "production tracker outsourcing accessories delete" on public.outsourcing_accessories for delete to authenticated using (auth.uid() is not null);

drop policy if exists "production tracker outsourcing receipts read" on public.outsourcing_receipts;
create policy "production tracker outsourcing receipts read" on public.outsourcing_receipts for select to authenticated using (auth.uid() is not null);
drop policy if exists "production tracker outsourcing receipts insert" on public.outsourcing_receipts;
create policy "production tracker outsourcing receipts insert" on public.outsourcing_receipts for insert to authenticated with check (auth.uid() is not null);
drop policy if exists "production tracker outsourcing receipts update" on public.outsourcing_receipts;
create policy "production tracker outsourcing receipts update" on public.outsourcing_receipts for update to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop policy if exists "production tracker outsourcing receipts delete" on public.outsourcing_receipts;
create policy "production tracker outsourcing receipts delete" on public.outsourcing_receipts for delete to authenticated using (auth.uid() is not null);

drop policy if exists "production tracker accessory stock read" on public.accessory_stock;
create policy "production tracker accessory stock read" on public.accessory_stock for select to authenticated using (auth.uid() is not null);
drop policy if exists "production tracker accessory stock insert" on public.accessory_stock;
create policy "production tracker accessory stock insert" on public.accessory_stock for insert to authenticated with check (auth.uid() is not null);
drop policy if exists "production tracker accessory stock update" on public.accessory_stock;
create policy "production tracker accessory stock update" on public.accessory_stock for update to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop policy if exists "production tracker accessory stock delete" on public.accessory_stock;
create policy "production tracker accessory stock delete" on public.accessory_stock for delete to authenticated using (auth.uid() is not null);

commit;
