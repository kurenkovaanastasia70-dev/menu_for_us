create table if not exists public.weight_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  logged_at date not null default current_date,
  weight_kg numeric not null,
  created_at timestamptz not null default now(),
  unique (user_id, logged_at)
);

alter table public.weight_logs enable row level security;

create policy weight_logs_all on public.weight_logs
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

create table if not exists public.training_plans (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  plan_json jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id)
);

alter table public.training_plans enable row level security;

create policy training_plans_all on public.training_plans
  for all using (household_id = public.user_household_id())
  with check (household_id = public.user_household_id());

create trigger training_plans_updated_at before update on public.training_plans
for each row execute function public.set_updated_at();
