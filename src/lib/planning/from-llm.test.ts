import { describe, expect, it } from "vitest";
import type { OptimizationInput, PlannedMeal, Product } from "@/lib/optimizer";
import { scaleMenuToMacroTargets } from "./from-llm";

const apple: Product = {
  id: "apple",
  canonical_name: "Яблоки",
  category: "fruit",
  calories_per_100g: 52,
  protein_per_100g: 0.3,
  fat_per_100g: 0.2,
  carbs_per_100g: 14,
  fiber_per_100g: 2.4,
  iron_per_100g: 0.1,
  package_weight: 1000,
  unit: "g",
  tags: ["fruit"],
};

function meal(calories: number): PlannedMeal {
  return {
    dayIndex: 0,
    mealType: "snack",
    recipeId: "x",
    recipeName: "Фрукт",
    cookingSession: 0,
    servings: 1,
    ingredients: [{ product_id: "apple", grams: 200 }],
    calories,
    protein: 1,
    fat: 0.4,
    carbs: 28,
    fiber: 5,
    iron: 0.2,
    instructions: [],
  };
}

describe("llm menu scaling", () => {
  it("scales portions toward the calorie target", () => {
    const input = {
      days: 1,
      calorieTargets: 200,
      products: [apple],
    } as OptimizationInput;
    const scaled = scaleMenuToMacroTargets([meal(100)], input);
    expect(scaled[0].ingredients[0].grams).toBeGreaterThan(200);
  });
});
