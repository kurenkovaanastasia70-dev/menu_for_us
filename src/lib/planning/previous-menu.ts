import type { PlannedMeal } from "@/lib/optimizer/types";
import type { MealPlanRow } from "@/lib/supabase/types";

const MEAL_SHORT: Record<string, string> = {
  breakfast: "b",
  lunch: "l",
  dinner: "d",
  snack: "s",
};

export interface CompactMeal {
  d: number;
  m: string;
  n: string;
  p: string[];
}

export function compactPlannedMeals(menu: PlannedMeal[]): CompactMeal[] {
  return menu
    .filter((meal) => !meal.eatingOut && meal.recipeName)
    .map((meal) => ({
      d: meal.dayIndex + 1,
      m: MEAL_SHORT[meal.mealType] ?? meal.mealType.slice(0, 1),
      n: meal.recipeName.replace(/\s+\+.+$/, "").slice(0, 42),
      p: (meal.fullIngredients ?? meal.ingredients)
        .map((ing) => ing.product_id)
        .filter(Boolean)
        .slice(0, 5),
    }))
    .slice(0, 32);
}

export function compactLlmDays(
  days: Array<{
    day?: number;
    meals?: Array<{
      meal_type?: string;
      name?: string;
      leftover?: boolean;
      ingredients?: Array<{ product_id?: string }>;
    }>;
  }>,
): CompactMeal[] {
  const out: CompactMeal[] = [];
  for (const day of days) {
    const dayNum = Number(day.day) || 0;
    for (const meal of day.meals ?? []) {
      if (meal.leftover) continue;
      const name = String(meal.name ?? "").trim();
      if (!name) continue;
      out.push({
        d: dayNum,
        m: MEAL_SHORT[String(meal.meal_type)] ?? String(meal.meal_type ?? "").slice(0, 1),
        n: name.replace(/\s+\+.+$/, "").slice(0, 42),
        p: (meal.ingredients ?? []).map((ing) => String(ing.product_id ?? "")).filter(Boolean).slice(0, 5),
      });
    }
  }
  return out.slice(0, 32);
}

export function pickPreviousWeekPlan(plans: MealPlanRow[], currentStartDate: string): MealPlanRow | null {
  const earlier = plans
    .filter((plan) => plan.start_date < currentStartDate)
    .sort(
      (a, b) =>
        b.start_date.localeCompare(a.start_date) || String(b.created_at).localeCompare(String(a.created_at)),
    );
  if (earlier[0]) return earlier[0];
  const sameWeek = plans
    .filter((plan) => plan.start_date === currentStartDate)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return sameWeek[0] ?? null;
}

export function compactPlanResult(plan: MealPlanRow | null | undefined): CompactMeal[] {
  if (!plan) return [];
  const raw = plan.result_json as { menu?: PlannedMeal[] } | null;
  if (!raw?.menu?.length) return [];
  return compactPlannedMeals(raw.menu);
}

export function meatProductIds(products: Array<{ id: string; tags?: string[] }>): string[] {
  return products.filter((product) => (product.tags ?? []).includes("meat")).map((product) => product.id);
}
