import type { OptimizationResult } from "@/lib/optimizer";
import { supabase } from "./client";
import type { CashbackRuleRow, FridgeItem, Household, MealPlanRow, Profile } from "./types";

function requireClient() {
  if (!supabase) throw new Error("Supabase не настроен");
  return supabase;
}

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await requireClient().from("profiles").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data as Profile | null;
}

export async function upsertProfile(profile: Omit<Profile, "id"> & { id?: string }): Promise<Profile> {
  const { data, error } = await requireClient().from("profiles").upsert(profile).select("*").single();
  if (error) {
    const { fiber_target, iron_target, goal_weeks, ...rest } = profile;
    const retry = await requireClient().from("profiles").upsert(rest).select("*").single();
    if (retry.error) throw retry.error;
    return retry.data as Profile;
  }
  return data as Profile;
}

export async function fetchHousehold(id: string): Promise<Household | null> {
  const { data, error } = await requireClient().from("households").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as Household | null;
}

export async function createHousehold(name: string): Promise<string> {
  const { data, error } = await requireClient().rpc("create_household", { household_name: name });
  if (error) throw error;
  return data as string;
}

export async function joinHousehold(code: string): Promise<string> {
  const { data, error } = await requireClient().rpc("join_household", { code });
  if (error) throw error;
  return data as string;
}

export async function fetchHouseholdProfiles(householdId: string): Promise<Profile[]> {
  const { data, error } = await requireClient().from("profiles").select("*").eq("household_id", householdId);
  if (error) throw error;
  return (data ?? []) as Profile[];
}

export async function fetchCashback(householdId: string): Promise<CashbackRuleRow[]> {
  const { data, error } = await requireClient().from("cashback_rules").select("*").eq("household_id", householdId);
  if (error) throw error;
  return (data ?? []) as CashbackRuleRow[];
}

export async function saveCashback(householdId: string, storeId: string, percent: number) {
  const { error } = await requireClient()
    .from("cashback_rules")
    .upsert({ household_id: householdId, store_id: storeId, percent }, { onConflict: "household_id,store_id" });
  if (error) throw error;
}

export async function updateHousehold(id: string, patch: Partial<Household>) {
  const { error } = await requireClient().from("households").update(patch).eq("id", id);
  if (error) throw error;
}

export async function fetchMealPlans(householdId: string): Promise<MealPlanRow[]> {
  const { data, error } = await requireClient()
    .from("meal_plans")
    .select("*")
    .eq("household_id", householdId)
    .order("start_date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as MealPlanRow[];
}

export async function fetchMealPlan(id: string): Promise<MealPlanRow | null> {
  const { data, error } = await requireClient().from("meal_plans").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as MealPlanRow | null;
}

export async function saveMealPlan(args: {
  householdId: string;
  startDate: string;
  endDate: string;
  days: number;
  budget: number;
  result: OptimizationResult;
}): Promise<string> {
  const client = requireClient();
  const { data: plan, error } = await client
    .from("meal_plans")
    .insert({
      household_id: args.householdId,
      start_date: args.startDate,
      end_date: args.endDate,
      days: args.days,
      budget: args.budget,
      total_price: args.result.totalCost,
      total_cashback: args.result.cashback,
      effective_price: args.result.effectiveCost,
      calories_per_day: args.result.nutritionSummary.caloriesPerDay,
      protein_per_day: args.result.nutritionSummary.proteinPerDay,
      variety_score: args.result.varietyScore,
      result_json: args.result,
    })
    .select("id")
    .single();
  if (error) throw error;

  const planId = plan.id as string;
  const dayRows = Array.from({ length: args.days }, (_, dayIndex) => ({
    meal_plan_id: planId,
    day_index: dayIndex,
  }));
  const { data: days, error: daysError } = await client.from("meal_plan_days").insert(dayRows).select("id, day_index");
  if (daysError) throw daysError;
  const dayId = new Map((days ?? []).map((row) => [row.day_index as number, row.id as string]));

  for (const meal of args.result.menu) {
    const { data: mealRow, error: mealError } = await client
      .from("meals")
      .insert({
        meal_plan_id: planId,
        meal_plan_day_id: dayId.get(meal.dayIndex) ?? null,
        day_index: meal.dayIndex,
        meal_type: meal.mealType,
        recipe_id: meal.recipeId,
        name: meal.recipeName,
        calories: meal.calories,
        protein: meal.protein,
        fat: meal.fat,
        carbs: meal.carbs,
      })
      .select("id")
      .single();
    if (mealError) throw mealError;
    if (meal.ingredients.length > 0) {
      const { error: ingError } = await client.from("meal_ingredients").insert(
        meal.ingredients.map((ing) => ({
          meal_id: mealRow.id,
          product_id: ing.product_id,
          grams: ing.grams,
        })),
      );
      if (ingError) throw ingError;
    }
  }

  const { data: cart, error: cartError } = await client
    .from("carts")
    .insert({
      household_id: args.householdId,
      meal_plan_id: planId,
      planning_period: `${args.startDate}:${args.endDate}`,
      total_price: args.result.totalCost,
      total_cashback: args.result.cashback,
      effective_price: args.result.effectiveCost,
    })
    .select("id")
    .single();
  if (cartError) throw cartError;

  if (args.result.cart.length > 0) {
    const { error: itemsError } = await client.from("cart_items").insert(
      args.result.cart.map((line) => ({
        cart_id: cart.id,
        product_id: line.productId,
        store_id: line.storeId,
        quantity: line.quantityGrams,
        package_count: line.packageCount,
        package_weight: line.packageWeight,
        price: line.price,
        cashback: line.cashback,
        purchased: false,
      })),
    );
    if (itemsError) throw itemsError;
  }

  return planId;
}

export async function updateMealPlanResult(id: string, result: OptimizationResult) {
  const { error } = await requireClient()
    .from("meal_plans")
    .update({
      total_price: result.totalCost,
      total_cashback: result.cashback,
      effective_price: result.effectiveCost,
      calories_per_day: result.nutritionSummary.caloriesPerDay,
      protein_per_day: result.nutritionSummary.proteinPerDay,
      variety_score: result.varietyScore,
      result_json: result,
    })
    .eq("id", id);
  if (error) throw error;
}

export async function fetchCartItems(planId: string) {
  const client = requireClient();
  const { data: cart, error } = await client.from("carts").select("id").eq("meal_plan_id", planId).maybeSingle();
  if (error) throw error;
  if (!cart) return [];
  const { data, error: itemsError } = await client.from("cart_items").select("*").eq("cart_id", cart.id);
  if (itemsError) throw itemsError;
  return data ?? [];
}

export async function togglePurchased(itemId: string, purchased: boolean) {
  const { error } = await requireClient().from("cart_items").update({ purchased }).eq("id", itemId);
  if (error) throw error;
}

export async function replaceCartItems(planId: string, householdId: string, result: OptimizationResult) {
  const client = requireClient();
  const { data: existing } = await client.from("carts").select("id").eq("meal_plan_id", planId).maybeSingle();
  if (existing?.id) {
    await client.from("cart_items").delete().eq("cart_id", existing.id);
    await client.from("carts").delete().eq("id", existing.id);
  }
  const { data: cart, error } = await client
    .from("carts")
    .insert({
      household_id: householdId,
      meal_plan_id: planId,
      total_price: result.totalCost,
      total_cashback: result.cashback,
      effective_price: result.effectiveCost,
    })
    .select("id")
    .single();
  if (error) throw error;
  if (result.cart.length > 0) {
    const { error: itemsError } = await client.from("cart_items").insert(
      result.cart.map((line) => ({
        cart_id: cart.id,
        product_id: line.productId,
        store_id: line.storeId,
        quantity: line.quantityGrams,
        package_count: line.packageCount,
        package_weight: line.packageWeight,
        price: line.price,
        cashback: line.cashback,
        purchased: false,
      })),
    );
    if (itemsError) throw itemsError;
  }
}

const FRIDGE_KEY = (id: string) => `menu-for-us-fridge-${id}`;

function readLocalFridge(householdId: string): FridgeItem[] {
  try {
    const raw = localStorage.getItem(FRIDGE_KEY(householdId));
    return raw ? (JSON.parse(raw) as FridgeItem[]) : [];
  } catch {
    return [];
  }
}

function writeLocalFridge(householdId: string, items: FridgeItem[]) {
  localStorage.setItem(FRIDGE_KEY(householdId), JSON.stringify(items));
}

export async function fetchFridge(householdId: string): Promise<FridgeItem[]> {
  const local = readLocalFridge(householdId);
  try {
    const { data, error } = await requireClient().from("fridge_items").select("*").eq("household_id", householdId);
    if (error) return local;
    const rows = (data ?? []) as FridgeItem[];
    writeLocalFridge(householdId, rows);
    return rows;
  } catch {
    return local;
  }
}

export async function upsertFridgeItem(item: FridgeItem): Promise<FridgeItem[]> {
  const current = await fetchFridge(item.household_id);
  const next = [...current.filter((row) => row.product_id !== item.product_id), item];
  writeLocalFridge(item.household_id, next);
  try {
    const { error } = await requireClient()
      .from("fridge_items")
      .upsert(
        { household_id: item.household_id, product_id: item.product_id, grams: item.grams },
        { onConflict: "household_id,product_id" },
      );
    if (error) return next;
    return fetchFridge(item.household_id);
  } catch {
    return next;
  }
}

export async function deleteFridgeItem(householdId: string, productId: string): Promise<FridgeItem[]> {
  const next = (await fetchFridge(householdId)).filter((row) => row.product_id !== productId);
  writeLocalFridge(householdId, next);
  try {
    await requireClient().from("fridge_items").delete().eq("household_id", householdId).eq("product_id", productId);
  } catch {
    // local copy is enough until SQL is applied
  }
  return next;
}
