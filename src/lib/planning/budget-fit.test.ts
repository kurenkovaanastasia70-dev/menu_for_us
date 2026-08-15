import { describe, expect, it } from "vitest";
import type { OptimizationInput, PlannedMeal, Product, StoreProduct } from "@/lib/optimizer";
import { fitMenuToBudget } from "./budget-fit";

const salmon: Product = {
  id: "salmon",
  canonical_name: "Лосось",
  category: "protein",
  calories_per_100g: 208,
  protein_per_100g: 20,
  fat_per_100g: 13,
  carbs_per_100g: 0,
  fiber_per_100g: 0,
  iron_per_100g: 0.8,
  package_weight: 400,
  unit: "g",
  tags: ["fish"],
};

const pollock: Product = {
  id: "pollock",
  canonical_name: "Минтай",
  category: "protein",
  calories_per_100g: 72,
  protein_per_100g: 16,
  fat_per_100g: 0.9,
  carbs_per_100g: 0,
  fiber_per_100g: 0,
  iron_per_100g: 0.3,
  package_weight: 700,
  unit: "g",
  tags: ["fish"],
};

const rice: Product = {
  id: "rice",
  canonical_name: "Рис",
  category: "grain",
  calories_per_100g: 130,
  protein_per_100g: 2.7,
  fat_per_100g: 0.3,
  carbs_per_100g: 28,
  fiber_per_100g: 0.4,
  iron_per_100g: 0.2,
  package_weight: 900,
  unit: "g",
  tags: ["grain"],
};

function offer(id: string, price: number, pack: number): StoreProduct {
  return {
    id: `magnit_${id}`,
    canonical_product_id: id,
    store_id: "magnit",
    external_id: id,
    name: id,
    brand: "x",
    package_weight: pack,
    price,
    available: true,
    url: "",
    updated_at: "2026-08-01T00:00:00.000Z",
  };
}

function meal(productId: string, grams: number): PlannedMeal {
  return {
    dayIndex: 0,
    mealType: "dinner",
    recipeId: "d",
    recipeName: "Ужин",
    cookingSession: 0,
    servings: 2,
    ingredients: [
      { product_id: productId, grams },
      { product_id: "rice", grams: 140 },
    ],
    calories: 500,
    protein: 40,
    fat: 10,
    carbs: 40,
    fiber: 2,
    iron: 1,
    instructions: [],
  };
}

function input(budget: number): OptimizationInput {
  return {
    people: [{ id: "1", name: "A", calorieTarget: 1800, proteinTarget: 120, fatTarget: 60, carbsTarget: 180, fiberTarget: 25, ironTarget: 18 }],
    days: 1,
    calorieTargets: 1800,
    macroTargets: { protein: 120, fat: 60, carbs: 180, fiber: 25, iron: 18 },
    budget,
    products: [salmon, pollock, rice],
    prices: [offer("salmon", 700, 400), offer("pollock", 220, 700), offer("rice", 90, 900)],
    recipes: [],
    cashback: [],
    fridge: [],
    constraints: {
      maxCookingTime: 40,
      maxCookingSessions: 3,
      mealsPerDay: 3,
      snacks: true,
      excludedProductIds: [],
      allergies: [],
      dietType: "omnivore",
      preferredStoreIds: ["magnit"],
      maxStores: 2,
      varietyPreference: "medium",
    },
  };
}

describe("budget fit", () => {
  it("swaps expensive salmon for cheaper pollock instead of shrinking everything", () => {
    const menu = [meal("salmon", 280)];
    const fitted = fitMenuToBudget(menu, input(350));
    const ids = fitted.flatMap((item) => item.ingredients.map((ing) => ing.product_id));
    expect(ids).toContain("pollock");
    expect(ids).not.toContain("salmon");
    const riceGrams = fitted[0].ingredients.find((ing) => ing.product_id === "rice")?.grams;
    expect(riceGrams).toBe(140);
  });
});
