import { describe, expect, it } from "vitest";
import { leftoverFromDinner } from "@/lib/optimizer/meals";
import { materializeFromMenu, type OptimizationInput, type OptimizationResult, type PlannedMeal, type Recipe } from "@/lib/optimizer";
import { replaceMeal, replaceMealWithLlmIdea } from "./alternatives";

const dinnerRecipe: Recipe = {
  id: "dinner_a",
  name: "Курица с рисом",
  cuisine: "home",
  meal_type: "dinner",
  cooking_time: 30,
  difficulty: "easy",
  servings: 2,
  ingredients: [
    { product_id: "chicken_breast", grams: 300 },
    { product_id: "rice", grams: 200 },
  ],
  instructions: ["Приготовить курицу", "Отварить рис", "Подать"],
  calories: 600,
  protein: 50,
  fat: 10,
  carbs: 60,
  fiber: 2,
  iron: 2,
  protein_source: "chicken",
  tags: [],
};

const otherDinner: Recipe = {
  ...dinnerRecipe,
  id: "dinner_b",
  name: "Рыба с гречкой",
  ingredients: [
    { product_id: "tomato", grams: 400 },
    { product_id: "rice", grams: 180 },
  ],
};

const product = {
  id: "chicken_breast",
  canonical_name: "Курица",
  category: "protein" as const,
  calories_per_100g: 110,
  protein_per_100g: 23,
  fat_per_100g: 2,
  carbs_per_100g: 0,
  fiber_per_100g: 0,
  iron_per_100g: 0.4,
  package_weight: 900,
  unit: "g" as const,
  tags: [] as string[],
};

const rice = {
  ...product,
  id: "rice",
  canonical_name: "Рис",
  category: "grain" as const,
  calories_per_100g: 130,
  protein_per_100g: 2.7,
  fat_per_100g: 0.3,
  carbs_per_100g: 28,
};

const tomato = {
  ...product,
  id: "tomato",
  canonical_name: "Помидоры",
  category: "vegetable" as const,
  calories_per_100g: 18,
  protein_per_100g: 0.9,
  fat_per_100g: 0.2,
  carbs_per_100g: 3.9,
  package_weight: 500,
};

function meal(partial: Partial<PlannedMeal> & Pick<PlannedMeal, "dayIndex" | "mealType" | "recipeId" | "recipeName">): PlannedMeal {
  return {
    servings: 2,
    cookingSession: 0,
    eatingOut: false,
    calories: 600,
    protein: 50,
    fat: 10,
    carbs: 60,
    fiber: 2,
    iron: 2,
    ingredients: [
      { product_id: "chicken_breast", grams: 300 },
      { product_id: "rice", grams: 200 },
    ],
    instructions: ["Шаг 1", "Шаг 2", "Шаг 3"],
    ...partial,
  };
}

function input(): OptimizationInput {
  return {
    people: [
      {
        id: "a",
        name: "A",
        calorieTarget: 1800,
        proteinTarget: 120,
        fatTarget: 55,
        carbsTarget: 180,
        fiberTarget: 25,
        ironTarget: 18,
      },
    ],
    days: 2,
    calorieTargets: 1800,
    macroTargets: { protein: 120, fat: 55, carbs: 180, fiber: 25, iron: 18 },
    budget: 8000,
    products: [product, rice, tomato],
    prices: [
      {
        id: "m_chicken",
        canonical_product_id: "chicken_breast",
        store_id: "magnit",
        external_id: "1",
        name: "Курица",
        brand: "",
        package_weight: 900,
        price: 300,
        available: true,
        url: "",
        updated_at: "2026-01-01",
      },
      {
        id: "m_rice",
        canonical_product_id: "rice",
        store_id: "magnit",
        external_id: "2",
        name: "Рис",
        brand: "",
        package_weight: 900,
        price: 100,
        available: true,
        url: "",
        updated_at: "2026-01-01",
      },
      {
        id: "m_tomato",
        canonical_product_id: "tomato",
        store_id: "magnit",
        external_id: "3",
        name: "Помидоры",
        brand: "",
        package_weight: 500,
        price: 150,
        available: true,
        url: "",
        updated_at: "2026-01-01",
      },
    ],
    recipes: [dinnerRecipe, otherDinner],
    fridge: [],
    cashback: [{ store_id: "magnit", percent: 0 }],
    constraints: {
      maxCookingTime: 40,
      maxCookingSessions: 3,
      mealsPerDay: 3,
      snacks: false,
      excludedProductIds: [],
      allergies: [],
      dietType: "omnivore",
      preferredStoreIds: ["magnit"],
      maxStores: 1,
      varietyPreference: "medium",
    },
  };
}

function result(menu: PlannedMeal[]): OptimizationResult {
  return {
    menu,
    cart: [],
    totalCost: 0,
    cashback: 0,
    effectiveCost: 0,
    grossCost: 0,
    fridgeDiscount: 0,
    nutritionSummary: {
      caloriesPerDay: 0,
      proteinPerDay: 0,
      fatPerDay: 0,
      carbsPerDay: 0,
      fiberPerDay: 0,
      ironPerDay: 0,
      calorieTarget: 1800,
      proteinTarget: 120,
      fiberTarget: 25,
      ironTarget: 18,
    },
    varietyScore: 50,
    wasteScore: 50,
    cookingPlan: [],
    feasible: true,
    warnings: [],
  };
}

describe("replaceMeal leftover sync", () => {
  it("updates next-day leftover lunch when dinner is replaced", () => {
    const dinner = meal({
      dayIndex: 0,
      mealType: "dinner",
      recipeId: dinnerRecipe.id,
      recipeName: dinnerRecipe.name,
    });
    const leftover = leftoverFromDinner(dinner, 1, false);
    const next = replaceMeal(result([dinner, leftover]), dinner, otherDinner, input());

    const nextDinner = next.menu.find((item) => item.dayIndex === 0 && item.mealType === "dinner");
    const nextLunch = next.menu.find((item) => item.dayIndex === 1 && item.mealType === "lunch");

    expect(nextDinner?.recipeId).toBe(otherDinner.id);
    expect(nextLunch?.leftover).toBe(true);
    expect(nextLunch?.recipeId).toBe(otherDinner.id);
    expect(nextLunch?.recipeName).toMatch(/^Остатки:/);
    expect(nextLunch?.leftoverFrom).toContain(otherDinner.name);
  });

  it("updates leftover lunch when dinner is replaced with an LLM idea", () => {
    const dinner = meal({
      dayIndex: 0,
      mealType: "dinner",
      recipeId: dinnerRecipe.id,
      recipeName: dinnerRecipe.name,
    });
    const leftover = leftoverFromDinner(dinner, 1, false);
    const next = replaceMealWithLlmIdea(
      result([dinner, leftover]),
      dinner,
      {
        recipeId: "llm_new_dinner",
        name: "Индейка с киноа",
        ingredients: [
          { product_id: "chicken_breast", grams: 320 },
          { product_id: "rice", grams: 160 },
        ],
        steps: [
          { order: 1, title: "A", text: "a", minutes: 5 },
          { order: 2, title: "B", text: "b", minutes: 10 },
          { order: 3, title: "C", text: "c", minutes: 2 },
        ],
      },
      input(),
    );

    const nextLunch = next.menu.find((item) => item.dayIndex === 1 && item.mealType === "lunch");
    expect(nextLunch?.leftover).toBe(true);
    expect(nextLunch?.recipeId).toBe("llm_new_dinner");
    expect(nextLunch?.leftoverFrom).toBe("Индейка с киноа");
    expect(nextLunch?.recipeName).toBe("Остатки: Индейка с киноа");
  });

  it("does not rewrite a normal lunch when dinner changes", () => {
    const dinner = meal({
      dayIndex: 0,
      mealType: "dinner",
      recipeId: dinnerRecipe.id,
      recipeName: dinnerRecipe.name,
    });
    const lunch = meal({
      dayIndex: 1,
      mealType: "lunch",
      recipeId: "quick_lunch",
      recipeName: "Быстрый обед",
      leftover: false,
    });
    const next = replaceMeal(result([dinner, lunch]), dinner, otherDinner, input());
    const nextLunch = next.menu.find((item) => item.dayIndex === 1 && item.mealType === "lunch");
    expect(nextLunch?.recipeId).toBe("quick_lunch");
    expect(nextLunch?.leftover).toBeFalsy();
  });

  it("prices dinner swap using dinner + leftover together", () => {
    const dinner = meal({
      dayIndex: 0,
      mealType: "dinner",
      recipeId: dinnerRecipe.id,
      recipeName: dinnerRecipe.name,
      fullIngredients: [
        { product_id: "chicken_breast", grams: 300 },
        { product_id: "rice", grams: 200 },
      ],
    });
    const leftover = {
      ...leftoverFromDinner(dinner, 1, false),
      fullIngredients: [
        { product_id: "chicken_breast", grams: 300 },
        { product_id: "rice", grams: 200 },
      ],
      ingredients: [
        { product_id: "chicken_breast", grams: 300 },
        { product_id: "rice", grams: 200 },
      ],
    };
    const base = result([dinner, leftover]);
    // Seed base cost so deltas are meaningful after materialize.
    const materializedBase = materializeFromMenu(base.menu, input());
    const withSync = replaceMeal(materializedBase, dinner, otherDinner, input());

    const dinnerOnlyMenu = materializedBase.menu.map((item) =>
      item.dayIndex === 0 && item.mealType === "dinner"
        ? {
            ...item,
            recipeId: otherDinner.id,
            recipeName: otherDinner.name,
            ingredients: otherDinner.ingredients.map((ing) => ({ ...ing })),
            fullIngredients: otherDinner.ingredients.map((ing) => ({ ...ing })),
          }
        : item,
    );
    const dinnerOnly = materializeFromMenu(dinnerOnlyMenu, input());

    expect(withSync.cart.some((line) => line.productId === "chicken_breast")).toBe(false);
    expect(dinnerOnly.cart.some((line) => line.productId === "chicken_breast")).toBe(true);
    expect(withSync.effectiveCost).not.toBe(dinnerOnly.effectiveCost);
    expect(withSync.effectiveCost - materializedBase.effectiveCost).not.toBe(
      dinnerOnly.effectiveCost - materializedBase.effectiveCost,
    );
  });
});
