alter table public.households
  add column if not exists settings jsonb not null default '{}'::jsonb;

do $$
begin
  begin
    alter publication supabase_realtime add table public.fridge_items;
  exception
    when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.meal_plans;
  exception
    when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.households;
  exception
    when duplicate_object then null;
  end;
end $$;
