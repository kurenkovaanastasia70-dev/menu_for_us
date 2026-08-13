create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text unique not null,
  default_budget numeric not null default 6000,
  default_days integer not null default 7,
  preferred_stores text[] not null default array['pyaterochka','magnit','perekrestok','dixy'],
  max_stores integer not null default 2,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  household_id uuid references public.households(id) on delete set null,
  name text not null,
  gender text not null check (gender in ('female', 'male')),
  birth_date date not null,
  height_cm numeric not null,
  weight_kg numeric not null,
  activity_level text not null,
  goal text not null,
  target_weight_kg numeric,
  calorie_target integer not null,
  protein_target numeric not null,
  fat_target numeric not null,
  carbs_target numeric not null,
  meals_per_day integer not null default 3,
  snacks boolean not null default false,
  preferences text[] not null default '{}',
  excluded_products text[] not null default '{}',
  allergies text[] not null default '{}',
  diet_type text not null default 'omnivore',
  max_cooking_time integer not null default 40,
  cooking_sessions integer not null default 3,
  batch_meals boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.stores (
  id text primary key,
  name text not null,
  slug text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.products (
  id text primary key,
  canonical_name text not null,
  category text not null,
  calories_per_100g numeric not null,
  protein_per_100g numeric not null,
  fat_per_100g numeric not null,
  carbs_per_100g numeric not null,
  package_weight numeric not null,
  unit text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.store_products (
  id text primary key,
  canonical_product_id text not null references public.products(id) on delete cascade,
  store_id text not null references public.stores(id) on delete cascade,
  external_id text,
  name text not null,
  brand text,
  package_weight numeric not null,
  price numeric not null,
  available boolean not null default true,
  url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.cashback_rules (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  store_id text not null,
  percent numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, store_id)
);

create table public.recipes (
  id text primary key,
  household_id uuid references public.households(id) on delete cascade,
  name text not null,
  cuisine text,
  meal_type text not null,
  cooking_time integer not null,
  difficulty text,
  servings integer not null default 1,
  instructions text[] not null default '{}',
  calories numeric not null default 0,
  protein numeric not null default 0,
  fat numeric not null default 0,
  carbs numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id text not null references public.recipes(id) on delete cascade,
  product_id text not null,
  grams numeric not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.meal_plans (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  days integer not null,
  budget numeric not null,
  total_price numeric not null default 0,
  total_cashback numeric not null default 0,
  effective_price numeric not null default 0,
  calories_per_day numeric not null default 0,
  protein_per_day numeric not null default 0,
  variety_score numeric not null default 0,
  result_json jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.meal_plan_days (
  id uuid primary key default gen_random_uuid(),
  meal_plan_id uuid not null references public.meal_plans(id) on delete cascade,
  day_index integer not null,
  plan_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.meals (
  id uuid primary key default gen_random_uuid(),
  meal_plan_id uuid not null references public.meal_plans(id) on delete cascade,
  meal_plan_day_id uuid references public.meal_plan_days(id) on delete cascade,
  day_index integer not null,
  meal_type text not null,
  recipe_id text,
  name text not null,
  calories numeric not null default 0,
  protein numeric not null default 0,
  fat numeric not null default 0,
  carbs numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.meal_ingredients (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null references public.meals(id) on delete cascade,
  product_id text not null,
  grams numeric not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.carts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  meal_plan_id uuid not null references public.meal_plans(id) on delete cascade,
  planning_period text,
  total_price numeric not null default 0,
  total_cashback numeric not null default 0,
  effective_price numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts(id) on delete cascade,
  product_id text not null,
  store_id text not null,
  quantity numeric not null,
  package_count integer not null,
  package_weight numeric not null,
  price numeric not null,
  cashback numeric not null default 0,
  purchased boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.user_household_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select household_id
  from public.household_members
  where user_id = auth.uid()
  limit 1
$$;

create or replace function public.is_household_member(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.household_members
    where user_id = auth.uid()
      and household_id = target
  )
$$;

create trigger households_updated_at before update on public.households
for each row execute function public.set_updated_at();
create trigger household_members_updated_at before update on public.household_members
for each row execute function public.set_updated_at();
create trigger profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger cashback_rules_updated_at before update on public.cashback_rules
for each row execute function public.set_updated_at();
create trigger meal_plans_updated_at before update on public.meal_plans
for each row execute function public.set_updated_at();
create trigger carts_updated_at before update on public.carts
for each row execute function public.set_updated_at();
create trigger cart_items_updated_at before update on public.cart_items
for each row execute function public.set_updated_at();

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.profiles enable row level security;
alter table public.stores enable row level security;
alter table public.products enable row level security;
alter table public.store_products enable row level security;
alter table public.cashback_rules enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.meal_plans enable row level security;
alter table public.meal_plan_days enable row level security;
alter table public.meals enable row level security;
alter table public.meal_ingredients enable row level security;
alter table public.carts enable row level security;
alter table public.cart_items enable row level security;

create policy households_select_member on public.households
  for select using (id = public.user_household_id());
create policy households_update_member on public.households
  for update using (id = public.user_household_id());
create policy households_insert_authenticated on public.households
  for insert with check (auth.uid() is not null);

create policy household_members_select on public.household_members
  for select using (household_id = public.user_household_id() or user_id = auth.uid());
create policy household_members_insert on public.household_members
  for insert with check (user_id = auth.uid());
create policy household_members_delete on public.household_members
  for delete using (user_id = auth.uid());

create policy profiles_select_own_or_household on public.profiles
  for select using (user_id = auth.uid() or household_id = public.user_household_id());
create policy profiles_insert_own on public.profiles
  for insert with check (user_id = auth.uid());
create policy profiles_update_own on public.profiles
  for update using (user_id = auth.uid());

create policy stores_select_auth on public.stores
  for select using (auth.uid() is not null);
create policy products_select_auth on public.products
  for select using (auth.uid() is not null);
create policy store_products_select_auth on public.store_products
  for select using (auth.uid() is not null);

create policy cashback_select on public.cashback_rules
  for select using (household_id = public.user_household_id());
create policy cashback_write on public.cashback_rules
  for all using (household_id = public.user_household_id())
  with check (household_id = public.user_household_id());

create policy recipes_select on public.recipes
  for select using (household_id is null or household_id = public.user_household_id());
create policy recipes_write on public.recipes
  for all using (household_id = public.user_household_id())
  with check (household_id = public.user_household_id());

create policy recipe_ingredients_select on public.recipe_ingredients
  for select using (
    exists (
      select 1 from public.recipes r
      where r.id = recipe_id
        and (r.household_id is null or r.household_id = public.user_household_id())
    )
  );

create policy meal_plans_all on public.meal_plans
  for all using (household_id = public.user_household_id())
  with check (household_id = public.user_household_id());

create policy meal_plan_days_all on public.meal_plan_days
  for all using (
    exists (select 1 from public.meal_plans p where p.id = meal_plan_id and p.household_id = public.user_household_id())
  )
  with check (
    exists (select 1 from public.meal_plans p where p.id = meal_plan_id and p.household_id = public.user_household_id())
  );

create policy meals_all on public.meals
  for all using (
    exists (select 1 from public.meal_plans p where p.id = meal_plan_id and p.household_id = public.user_household_id())
  )
  with check (
    exists (select 1 from public.meal_plans p where p.id = meal_plan_id and p.household_id = public.user_household_id())
  );

create policy meal_ingredients_all on public.meal_ingredients
  for all using (
    exists (
      select 1 from public.meals m
      join public.meal_plans p on p.id = m.meal_plan_id
      where m.id = meal_id and p.household_id = public.user_household_id()
    )
  )
  with check (
    exists (
      select 1 from public.meals m
      join public.meal_plans p on p.id = m.meal_plan_id
      where m.id = meal_id and p.household_id = public.user_household_id()
    )
  );

create policy carts_all on public.carts
  for all using (household_id = public.user_household_id())
  with check (household_id = public.user_household_id());

create policy cart_items_all on public.cart_items
  for all using (
    exists (select 1 from public.carts c where c.id = cart_id and c.household_id = public.user_household_id())
  )
  with check (
    exists (select 1 from public.carts c where c.id = cart_id and c.household_id = public.user_household_id())
  );

create or replace function public.create_household(household_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  hid uuid;
  code text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if public.user_household_id() is not null then
    raise exception 'already in a household';
  end if;

  code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  insert into public.households (name, invite_code)
  values (household_name, code)
  returning id into hid;

  insert into public.household_members (household_id, user_id, role)
  values (hid, auth.uid(), 'owner');

  update public.profiles
  set household_id = hid
  where user_id = auth.uid();

  insert into public.cashback_rules (household_id, store_id, percent)
  values
    (hid, 'pyaterochka', 5),
    (hid, 'magnit', 3),
    (hid, 'perekrestok', 7),
    (hid, 'dixy', 4);

  return hid;
end;
$$;

create or replace function public.join_household(code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  hid uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if public.user_household_id() is not null then
    raise exception 'already in a household';
  end if;

  select id into hid
  from public.households
  where invite_code = upper(trim(code));

  if hid is null then
    raise exception 'household not found';
  end if;

  insert into public.household_members (household_id, user_id, role)
  values (hid, auth.uid(), 'member');

  update public.profiles
  set household_id = hid
  where user_id = auth.uid();

  return hid;
end;
$$;

grant execute on function public.create_household(text) to authenticated;
grant execute on function public.join_household(text) to authenticated;
