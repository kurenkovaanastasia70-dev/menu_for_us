import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const TABLES = [
  "households",
  "household_members",
  "profiles",
  "stores",
  "products",
  "store_products",
  "cashback_rules",
  "recipes",
  "recipe_ingredients",
  "meal_plans",
  "meal_plan_days",
  "meals",
  "meal_ingredients",
  "carts",
  "cart_items",
  "fridge_items",
  "weight_logs",
  "training_plans",
];

describe("supabase RLS", () => {
  const sql =
    readFileSync(resolve(process.cwd(), "supabase/migrations/20260813120000_init.sql"), "utf8") +
    readFileSync(resolve(process.cwd(), "supabase/migrations/20260813220000_fridge_and_micronutrients.sql"), "utf8") +
    readFileSync(resolve(process.cwd(), "supabase/migrations/20260813230000_weight_logs_and_training.sql"), "utf8");

  it("enables RLS on every table", () => {
    for (const table of TABLES) {
      expect(sql).toContain(`alter table public.${table} enable row level security`);
    }
  });

  it("scopes household data to the current member", () => {
    expect(sql).toContain("user_household_id()");
    expect(sql).toContain("auth.uid()");
    expect(sql).toContain("household_id = public.user_household_id()");
  });

  it("lets a user manage only their own profile", () => {
    expect(sql).toContain("profiles_select_own_or_household");
    expect(sql).toContain("profiles_update_own");
    expect(sql).toContain("user_id = auth.uid()");
  });
});
