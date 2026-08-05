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
