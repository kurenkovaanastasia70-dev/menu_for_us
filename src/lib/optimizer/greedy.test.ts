import { describe, expect, it } from "vitest";
import { GreedyOptimizationEngine, type OptimizationInput, type Product, type Recipe, type StoreProduct } from "./index";

const chicken: Product = {
  id: "chicken_breast",
  canonical_name: "Курица",
  category: "protein",
  calories_per_100g: 110,
  protein_per_100g: 23,
  fat_per_100g: 2,
  carbs_per_100g: 0,
  package_weight: 900,
  unit: "g",
  tags: ["chicken"],
};

const rice: Product = {
  id: "rice",
  canonical_name: "Рис",
  category: "grain",
  calories_per_100g: 130,
  protein_per_100g: 2.7,
  fat_per_100g: 0.3,
  carbs_per_100g: 28,
  package_weight: 900,
  unit: "g",
  tags: ["grain"],
};

const oats: Product = {
  id: "oats",
  canonical_name: "Овсянка",
  category: "grain",
  calories_per_100g: 379,
  protein_per_100g: 13,
  fat_per_100g: 6,
  carbs_per_100g: 65,
  package_weight: 500,
  unit: "g",
  tags: ["grain"],
};

const milk: Product = {
  id: "milk",
  canonical_name: "Молоко",
  category: "dairy",
  calories_per_100g: 52,
  protein_per_100g: 3,
  fat_per_100g: 2.5,
  carbs_per_100g: 4.8,
  package_weight: 900,
  unit: "ml",
  tags: ["dairy"],
};

const tomato: Product = {
  id: "tomato",
  canonical_name: "Помидоры",
  category: "vegetable",
  calories_per_100g: 18,
  protein_per_100g: 0.9,
  fat_per_100g: 0.2,
  carbs_per_100g: 3.9,
  package_weight: 500,
  unit: "g",
  tags: ["vegetable"],
};

const products = [chicken, rice, oats, milk, tomato];

function offer(productId: string, storeId: string, price: number, pack = 900): StoreProduct {
  return {
    id: `${storeId}_${productId}`,
    canonical_product_id: productId,
    store_id: storeId,
    external_id: productId,
    name: productId,
    brand: "Test",
    package_weight: pack,
    price,
    available: true,
    url: "",
    updated_at: "2026-08-01T00:00:00.000Z",
  };
}

const prices: StoreProduct[] = [
  offer("chicken_breast", "pyaterochka", 399, 900),
  offer("chicken_breast", "magnit", 420, 900),
  offer("rice", "pyaterochka", 90, 900),
  offer("rice", "magnit", 95, 900),
  offer("oats", "pyaterochka", 70, 500),
  offer("milk", "pyaterochka", 80, 900),
  offer("tomato", "pyaterochka", 100, 500),
];

function recipe(partial: Partial<Recipe> & Pick<Recipe, "id" | "name" | "meal_type" | "ingredients">): Recipe {
  return {
    cuisine: "test",
    cooking_time: 20,
    difficulty: "easy",
    servings: 1,
    instructions: ["cook"],
    calories: 400,
    protein: 30,
    fat: 10,
    carbs: 40,
    protein_source: "chicken",
    tags: ["vegetables"],
    ...partial,
  };
}

const recipes: Recipe[] = [
  recipe({
    id: "breakfast_oats",
    name: "Овсянка",
    meal_type: "breakfast",
    protein_source: "oats",
    ingredients: [
      { product_id: "oats", grams: 60 },
      { product_id: "milk", grams: 200 },
    ],
    calories: 330,
    protein: 14,
    carbs: 50,
  }),
  recipe({
    id: "lunch_chicken",
    name: "Курица с рисом",
    meal_type: "lunch",
    ingredients: [
      { product_id: "chicken_breast", grams: 180 },
      { product_id: "rice", grams: 70 },
      { product_id: "tomato", grams: 80 },
    ],
    calories: 420,
    protein: 45,
  }),
  recipe({
    id: "dinner_chicken",
    name: "Курица с томатами",
    meal_type: "dinner",
    cuisine: "mediterranean",
    ingredients: [
      { product_id: "chicken_breast", grams: 160 },
      { product_id: "tomato", grams: 120 },
    ],
    calories: 250,
    protein: 38,
  }),
  recipe({
    id: "lunch_rice_bowl",
    name: "Рисовый боул",
    meal_type: "lunch",
    cuisine: "asian",
    ingredients: [
      { product_id: "chicken_breast", grams: 140 },
      { product_id: "rice", grams: 80 },
    ],
    calories: 380,
    protein: 35,
  }),
];

function input(overrides: Partial<OptimizationInput> = {}): OptimizationInput {
  return {
    people: [
      { id: "a", name: "A", calorieTarget: 1800, proteinTarget: 120, fatTarget: 55, carbsTarget: 180 },
      { id: "b", name: "B", calorieTarget: 2200, proteinTarget: 140, fatTarget: 70, carbsTarget: 220 },
    ],
    days: 3,
    calorieTargets: 4000,
    macroTargets: { protein: 260, fat: 125, carbs: 400 },
    budget: 6000,
    products,
    prices,
    recipes,
    cashback: [
      { store_id: "pyaterochka", percent: 5 },
      { store_id: "magnit", percent: 3 },
    ],
    constraints: {
      maxCookingTime: 40,
      maxCookingSessions: 2,
      mealsPerDay: 3,
      snacks: false,
      excludedProductIds: [],
      allergies: [],
      dietType: "omnivore",
      preferredStoreIds: ["pyaterochka", "magnit"],
      maxStores: 2,
      varietyPreference: "medium",
    },
    ...overrides,
  };
}

describe("optimizer", () => {
  const engine = new GreedyOptimizationEngine();

  it("stays within budget when possible", () => {
    const result = engine.optimize(input());
    expect(result.effectiveCost).toBeLessThanOrEqual(6000);
    expect(result.cart.length).toBeGreaterThan(0);
  });

  it("covers calorie and protein constraints approximately", () => {
    const result = engine.optimize(input());
    expect(result.nutritionSummary.caloriesPerDay).toBeGreaterThan(0);
    expect(result.nutritionSummary.proteinPerDay).toBeGreaterThan(50);
  });

  it("buys full packages instead of exact grams", () => {
    const result = engine.optimize(input());
    const chickenLine = result.cart.find((line) => line.productId === "chicken_breast");
    expect(chickenLine).toBeTruthy();
    expect(chickenLine!.packageWeight).toBe(900);
    expect(chickenLine!.packageCount).toBeGreaterThanOrEqual(1);
    expect(chickenLine!.packageCount * chickenLine!.packageWeight).toBeGreaterThanOrEqual(chickenLine!.quantityGrams);
  });

  it("reuses chicken across several meals", () => {
    const result = engine.optimize(input({ days: 4 }));
    const chickenMeals = result.menu.filter((meal) =>
      meal.ingredients.some((ing) => ing.product_id === "chicken_breast"),
    );
    expect(chickenMeals.length).toBeGreaterThan(1);
    const chickenLine = result.cart.find((line) => line.productId === "chicken_breast");
    expect(chickenLine?.leftoverGrams).toBeGreaterThanOrEqual(0);
  });

  it("warns when budget is too small", () => {
    const result = engine.optimize(input({ budget: 50 }));
    expect(result.warnings.some((warning) => warning.includes("бюджет"))).toBe(true);
  });

  it("uses cashback for effective price", () => {
    const result = engine.optimize(input());
    const line = result.cart.find((item) => item.storeId === "pyaterochka");
    if (line) {
      expect(line.effectivePrice).toBeLessThan(line.price);
      expect(line.cashbackPercent).toBe(5);
    }
  });
});
