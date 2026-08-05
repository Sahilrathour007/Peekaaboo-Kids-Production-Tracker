create table if not exists public.production_tracker_state (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamp with time zone not null default now()
);

alter table public.production_tracker_state enable row level security;

drop policy if exists "production tracker public read" on public.production_tracker_state;
create policy "production tracker public read"
  on public.production_tracker_state
  for select
  using (true);

drop policy if exists "production tracker public write" on public.production_tracker_state;
create policy "production tracker public write"
  on public.production_tracker_state
  for insert
  with check (true);

drop policy if exists "production tracker public update" on public.production_tracker_state;
create policy "production tracker public update"
  on public.production_tracker_state
  for update
  using (true)
  with check (true);

alter table public.fabrics enable row level security;

drop policy if exists "production tracker fabrics read" on public.fabrics;
create policy "production tracker fabrics read"
  on public.fabrics
  for select
  using (true);

drop policy if exists "production tracker fabrics insert" on public.fabrics;
create policy "production tracker fabrics insert"
  on public.fabrics
  for insert
  with check (true);

drop policy if exists "production tracker fabrics update" on public.fabrics;
create policy "production tracker fabrics update"
  on public.fabrics
  for update
  using (true)
  with check (true);

drop policy if exists "production tracker fabrics delete" on public.fabrics;
create policy "production tracker fabrics delete"
  on public.fabrics
  for delete
  using (true);

alter table public.cuttings enable row level security;
alter table public.cutting_fabric_components enable row level security;
alter table public.cutting_stage_movements enable row level security;
alter table public.outsourcing enable row level security;
alter table public.outsourcing_sizes enable row level security;
alter table public.outsourcing_accessories enable row level security;
alter table public.outsourcing_receipts enable row level security;
alter table public.accessory_stock enable row level security;

drop policy if exists "production tracker cuttings read" on public.cuttings;
create policy "production tracker cuttings read" on public.cuttings for select using (true);
drop policy if exists "production tracker cuttings insert" on public.cuttings;
create policy "production tracker cuttings insert" on public.cuttings for insert with check (true);
drop policy if exists "production tracker cuttings update" on public.cuttings;
create policy "production tracker cuttings update" on public.cuttings for update using (true) with check (true);
drop policy if exists "production tracker cuttings delete" on public.cuttings;
create policy "production tracker cuttings delete" on public.cuttings for delete using (true);

drop policy if exists "production tracker cutting components read" on public.cutting_fabric_components;
create policy "production tracker cutting components read" on public.cutting_fabric_components for select using (true);
drop policy if exists "production tracker cutting components insert" on public.cutting_fabric_components;
create policy "production tracker cutting components insert" on public.cutting_fabric_components for insert with check (true);
drop policy if exists "production tracker cutting components update" on public.cutting_fabric_components;
create policy "production tracker cutting components update" on public.cutting_fabric_components for update using (true) with check (true);
drop policy if exists "production tracker cutting components delete" on public.cutting_fabric_components;
create policy "production tracker cutting components delete" on public.cutting_fabric_components for delete using (true);

drop policy if exists "production tracker stage movements read" on public.cutting_stage_movements;
create policy "production tracker stage movements read" on public.cutting_stage_movements for select using (true);
drop policy if exists "production tracker stage movements insert" on public.cutting_stage_movements;
create policy "production tracker stage movements insert" on public.cutting_stage_movements for insert with check (true);
drop policy if exists "production tracker stage movements update" on public.cutting_stage_movements;
create policy "production tracker stage movements update" on public.cutting_stage_movements for update using (true) with check (true);
drop policy if exists "production tracker stage movements delete" on public.cutting_stage_movements;
create policy "production tracker stage movements delete" on public.cutting_stage_movements for delete using (true);

drop policy if exists "production tracker outsourcing read" on public.outsourcing;
create policy "production tracker outsourcing read" on public.outsourcing for select using (true);
drop policy if exists "production tracker outsourcing insert" on public.outsourcing;
create policy "production tracker outsourcing insert" on public.outsourcing for insert with check (true);
drop policy if exists "production tracker outsourcing update" on public.outsourcing;
create policy "production tracker outsourcing update" on public.outsourcing for update using (true) with check (true);
drop policy if exists "production tracker outsourcing delete" on public.outsourcing;
create policy "production tracker outsourcing delete" on public.outsourcing for delete using (true);

drop policy if exists "production tracker outsourcing sizes read" on public.outsourcing_sizes;
create policy "production tracker outsourcing sizes read" on public.outsourcing_sizes for select using (true);
drop policy if exists "production tracker outsourcing sizes insert" on public.outsourcing_sizes;
create policy "production tracker outsourcing sizes insert" on public.outsourcing_sizes for insert with check (true);
drop policy if exists "production tracker outsourcing sizes update" on public.outsourcing_sizes;
create policy "production tracker outsourcing sizes update" on public.outsourcing_sizes for update using (true) with check (true);
drop policy if exists "production tracker outsourcing sizes delete" on public.outsourcing_sizes;
create policy "production tracker outsourcing sizes delete" on public.outsourcing_sizes for delete using (true);

drop policy if exists "production tracker outsourcing accessories read" on public.outsourcing_accessories;
create policy "production tracker outsourcing accessories read" on public.outsourcing_accessories for select using (true);
drop policy if exists "production tracker outsourcing accessories insert" on public.outsourcing_accessories;
create policy "production tracker outsourcing accessories insert" on public.outsourcing_accessories for insert with check (true);
drop policy if exists "production tracker outsourcing accessories update" on public.outsourcing_accessories;
create policy "production tracker outsourcing accessories update" on public.outsourcing_accessories for update using (true) with check (true);
drop policy if exists "production tracker outsourcing accessories delete" on public.outsourcing_accessories;
create policy "production tracker outsourcing accessories delete" on public.outsourcing_accessories for delete using (true);

drop policy if exists "production tracker outsourcing receipts read" on public.outsourcing_receipts;
create policy "production tracker outsourcing receipts read" on public.outsourcing_receipts for select using (true);
drop policy if exists "production tracker outsourcing receipts insert" on public.outsourcing_receipts;
create policy "production tracker outsourcing receipts insert" on public.outsourcing_receipts for insert with check (true);
drop policy if exists "production tracker outsourcing receipts update" on public.outsourcing_receipts;
create policy "production tracker outsourcing receipts update" on public.outsourcing_receipts for update using (true) with check (true);
drop policy if exists "production tracker outsourcing receipts delete" on public.outsourcing_receipts;
create policy "production tracker outsourcing receipts delete" on public.outsourcing_receipts for delete using (true);

drop policy if exists "production tracker accessory stock read" on public.accessory_stock;
create policy "production tracker accessory stock read" on public.accessory_stock for select using (true);
drop policy if exists "production tracker accessory stock insert" on public.accessory_stock;
create policy "production tracker accessory stock insert" on public.accessory_stock for insert with check (true);
drop policy if exists "production tracker accessory stock update" on public.accessory_stock;
create policy "production tracker accessory stock update" on public.accessory_stock for update using (true) with check (true);
drop policy if exists "production tracker accessory stock delete" on public.accessory_stock;
create policy "production tracker accessory stock delete" on public.accessory_stock for delete using (true);
