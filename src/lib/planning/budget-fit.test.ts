import { describe, expect, it } from "vitest";
import { materializeFromMenu, type OptimizationInput, type PlannedMeal, type Product, type StoreProduct } from "@/lib/optimizer";
import { fitMenuToBudget } from "./budget-fit";

const chicken: Product = {
  id: "chicken_breast",
  canonical_name: "Курица",
  category: "protein",
  calories_per_100g: 110,
  protein_per_100g: 23,
  fat_per_100g: 2,
  carbs_per_100g: 0,
  fiber_per_100g: 0,
  iron_per_100g: 0.4,
  package_weight: 900,
  unit: "g",
  tags: [],
};
const salmon: Product = {
  id: "salmon",
  canonical_name: "Лосось",
  category: "protein",
  calories_per_100g: 208,
  protein_per_100g: 20,
  fat_per_100g: 13,
  carbs_per_100g: 0,
  fiber_per_100g: 0,
  iron_per_100g: 0.3,
  package_weight: 400,
  unit: "g",
  tags: [],
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
  tags: [],
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
  tags: [],
};

function offer(id: string, price: number, pack: number): StoreProduct {
  return {
    id: `m_${id}`,
    canonical_product_id: id,
    store_id: "magnit",
    external_id: id,
    name: id,
    brand: "",
    package_weight: pack,
    price,
    available: true,
    url: "",
    updated_at: "",
  };
}

function meal(ingredients: PlannedMeal["ingredients"]): PlannedMeal {
  return {
    dayIndex: 0,
    mealType: "dinner",
    recipeId: "x",
    recipeName: "Ужин",
    cookingSession: 0,
    servings: 2,
    ingredients,
    calories: 800,
    protein: 50,
    fat: 20,
    carbs: 60,
    fiber: 4,
    iron: 2,
    instructions: [],
  };
}

describe("fitMenuToBudget", () => {
  it("brings an expensive salmon week down near a tight budget", () => {
    const input = {
      products: [chicken, salmon, rice, pollock],
      prices: [
        offer("chicken_breast", 289, 900),
        offer("salmon", 649, 400),
        offer("rice", 79, 900),
        offer("pollock", 199, 700),
      ],
      people: [{ id: "a", name: "A", calorieTarget: 2000, proteinTarget: 100, fatTarget: 70, carbsTarget: 200, fiberTarget: 25, ironTarget: 12 }],
      days: 1,
      budget: 400,
      cashback: [],
      fridge: [],
      recipes: [],
      calorieTargets: 2000,
      macroTargets: { protein: 100, fat: 70, carbs: 200, fiber: 25, iron: 12 },
      constraints: {
        preferredStoreIds: ["magnit"],
        varietyPreference: "medium",
        maxCookingTime: 40,
        maxCookingSessions: 3,
        mealsPerDay: 3,
        snacks: true,
        excludedProductIds: [],
        allergies: [],
        dietType: "omnivore",
        maxStores: 2,
      },
    } as OptimizationInput;

    const menu = [
      meal([
        { product_id: "salmon", grams: 400 },
        { product_id: "rice", grams: 300 },
      ]),
      meal([
        { product_id: "salmon", grams: 400 },
        { product_id: "rice", grams: 300 },
      ]),
      meal([
        { product_id: "salmon", grams: 400 },
        { product_id: "rice", grams: 300 },
      ]),
    ];

    const fitted = fitMenuToBudget(menu, input);
    const cost = materializeFromMenu(fitted, input).effectiveCost;
    expect(cost).toBeLessThanOrEqual(input.budget * 1.05);
    expect(fitted.some((item) => item.ingredients.some((ing) => ing.product_id === "pollock" || ing.product_id === "chicken_breast" || ing.grams < 400))).toBe(true);
  });

  it("keeps turkey_steak in the cart when the week fits the budget", () => {
    const turkey: Product = {
      ...chicken,
      id: "turkey_steak",
      canonical_name: "Стейк индейки",
      package_weight: 500,
    };
    const input = {
      products: [chicken, turkey, rice],
      prices: [offer("chicken_breast", 280, 900), offer("turkey_steak", 275, 500), offer("rice", 79, 900)],
      people: [
        { id: "a", name: "A", calorieTarget: 2000, proteinTarget: 100, fatTarget: 70, carbsTarget: 200, fiberTarget: 25, ironTarget: 12 },
      ],
      days: 1,
      budget: 5000,
      cashback: [],
      fridge: [],
      recipes: [],
      calorieTargets: 2000,
      macroTargets: { protein: 100, fat: 70, carbs: 200, fiber: 25, iron: 12 },
      constraints: {
        preferredStoreIds: ["magnit"],
        varietyPreference: "medium",
        maxCookingTime: 40,
        maxCookingSessions: 3,
        mealsPerDay: 3,
        snacks: true,
        excludedProductIds: [],
        allergies: [],
        dietType: "omnivore",
        maxStores: 2,
      },
    } as OptimizationInput;

    const menu = [
      {
        ...meal([
          { product_id: "turkey_steak", grams: 400 },
          { product_id: "rice", grams: 200 },
        ]),
        recipeName: "Стейк индейки с рисом",
        fullIngredients: [
          { product_id: "turkey_steak", grams: 400 },
          { product_id: "rice", grams: 200 },
        ],
      },
    ];
    const fitted = fitMenuToBudget(menu, input);
    const cart = materializeFromMenu(fitted, input).cart;
    expect(cart.some((line) => line.productId === "turkey_steak")).toBe(true);
    expect(fitted[0].ingredients.some((ing) => ing.product_id === "turkey_steak")).toBe(true);
  });

  it("renames the meal and syncs portions when salmon is swapped for budget", () => {
    const input = {
      products: [chicken, salmon, rice, pollock],
      prices: [
        offer("chicken_breast", 280, 900),
        offer("salmon", 649, 400),
        offer("rice", 79, 900),
        offer("pollock", 199, 700),
      ],
      people: [
        { id: "a", name: "A", calorieTarget: 2000, proteinTarget: 100, fatTarget: 70, carbsTarget: 200, fiberTarget: 25, ironTarget: 12 },
      ],
      days: 1,
      budget: 200,
      cashback: [],
      fridge: [],
      recipes: [],
      calorieTargets: 2000,
      macroTargets: { protein: 100, fat: 70, carbs: 200, fiber: 25, iron: 12 },
      constraints: {
        preferredStoreIds: ["magnit"],
        varietyPreference: "medium",
        maxCookingTime: 40,
        maxCookingSessions: 3,
        mealsPerDay: 3,
        snacks: true,
        excludedProductIds: [],
        allergies: [],
        dietType: "omnivore",
        maxStores: 2,
      },
    } as OptimizationInput;

    const menu = [
      {
        ...meal([
          { product_id: "salmon", grams: 400 },
          { product_id: "rice", grams: 300 },
        ]),
        recipeName: "Лосось с рисом",
        fullIngredients: [
          { product_id: "salmon", grams: 400 },
          { product_id: "rice", grams: 300 },
        ],
        portions: [
          {
            personId: "a",
            name: "A",
            share: 1,
            eatingOut: false,
            calories: 800,
            protein: 50,
            fat: 20,
            carbs: 60,
            ingredients: [{ product_id: "salmon", grams: 400 }],
          },
        ],
      },
    ];

    const fitted = fitMenuToBudget(menu, input);
    const cart = materializeFromMenu(fitted, input).cart;
    expect(fitted[0].ingredients.some((ing) => ing.product_id === "salmon")).toBe(false);
    expect(fitted[0].recipeName.includes("Лосось")).toBe(false);
    expect(fitted[0].portions?.some((p) => p.ingredients.some((ing) => ing.product_id === "salmon"))).toBeFalsy();
    expect(cart.some((line) => line.productId === "salmon")).toBe(false);
  });
});
