import { describe, expect, it } from "vitest";
import type { PlannedMeal } from "@/lib/optimizer/types";
import type { MealPlanRow } from "@/lib/supabase/types";
import {
  compactLlmDays,
  compactPlannedMeals,
  meatProductIds,
  pickPreviousWeekPlan,
} from "./previous-menu";

function meal(patch: Partial<PlannedMeal>): PlannedMeal {
  return {
    dayIndex: 0,
    mealType: "dinner",
    recipeId: "d1",
    recipeName: "Куриные бёдра с рисом + салат",
    cookingSession: 1,
    servings: 2,
    ingredients: [{ product_id: "chicken_thigh", grams: 400 }],
    calories: 800,
    protein: 50,
    fat: 20,
    carbs: 70,
    fiber: 4,
    iron: 2,
    instructions: [],
    ...patch,
  };
}

function plan(patch: Partial<MealPlanRow>): MealPlanRow {
  return {
    id: "p1",
    household_id: "h",
    start_date: "2026-08-10",
    end_date: "2026-08-16",
    days: 7,
    budget: 6000,
    total_price: 0,
    total_cashback: 0,
    effective_price: 0,
    calories_per_day: 0,
    protein_per_day: 0,
    variety_score: 0,
    result_json: { menu: [meal({})] },
    created_at: "2026-08-10T10:00:00Z",
    ...patch,
  };
}

describe("previous menu compact", () => {
  it("keeps a short dish list with product ids", () => {
    const compact = compactPlannedMeals([meal({})]);
    expect(compact).toEqual([
      { d: 1, m: "d", n: "Куриные бёдра с рисом", p: ["chicken_thigh"] },
    ]);
  });

  it("skips leftover lunches from llm days", () => {
    expect(
      compactLlmDays([
        {
          day: 2,
          meals: [
            { meal_type: "lunch", name: "Остатки", leftover: true, ingredients: [{ product_id: "chicken_thigh" }] },
            { meal_type: "dinner", name: "Индейка", leftover: false, ingredients: [{ product_id: "turkey_fillet" }] },
          ],
        },
      ]),
    ).toEqual([{ d: 2, m: "d", n: "Индейка", p: ["turkey_fillet"] }]);
  });

  it("prefers the latest earlier week, else the current week plan", () => {
    const older = plan({ id: "old", start_date: "2026-08-03", created_at: "2026-08-03T10:00:00Z" });
    const prev = plan({ id: "prev", start_date: "2026-08-10", created_at: "2026-08-10T10:00:00Z" });
    const current = plan({ id: "cur", start_date: "2026-08-17", created_at: "2026-08-17T10:00:00Z" });
    expect(pickPreviousWeekPlan([current, prev, older], "2026-08-17")?.id).toBe("prev");
    expect(pickPreviousWeekPlan([current], "2026-08-17")?.id).toBe("cur");
    expect(pickPreviousWeekPlan([], "2026-08-17")).toBeNull();
  });

  it("picks meat-tagged products for dinner rules", () => {
    expect(
      meatProductIds([
        { id: "chicken_thigh", tags: ["chicken", "meat"] },
        { id: "salmon", tags: ["fish"] },
        { id: "tofu", tags: ["soy"] },
      ]),
    ).toEqual(["chicken_thigh"]);
  });
});
