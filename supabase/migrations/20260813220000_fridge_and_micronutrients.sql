create table if not exists public.fridge_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  product_id text not null,
  grams numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, product_id)
);

alter table public.fridge_items enable row level security;

create policy fridge_items_all on public.fridge_items
  for all using (household_id = public.user_household_id())
  with check (household_id = public.user_household_id());

alter table public.profiles
  add column if not exists fiber_target numeric,
  add column if not exists iron_target numeric,
  add column if not exists goal_weeks integer;

create trigger fridge_items_updated_at before update on public.fridge_items
for each row execute function public.set_updated_at();
