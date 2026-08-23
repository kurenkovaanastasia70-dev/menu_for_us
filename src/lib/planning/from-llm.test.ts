import { describe, expect, it } from "vitest";
import type { OptimizationInput, PlannedMeal, Product } from "@/lib/optimizer";
import { splitMealIngredients } from "@/lib/optimizer/meals";
import { mealsFromLlmMenu, scaleMenuToMacroTargets } from "./from-llm";

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

function product(id: string, name: string, category: Product["category"] = "protein"): Product {
  return {
    id,
    canonical_name: name,
    category,
    calories_per_100g: 100,
    protein_per_100g: 10,
    fat_per_100g: 5,
    carbs_per_100g: 10,
    fiber_per_100g: 1,
    iron_per_100g: 1,
    package_weight: 400,
    unit: "g",
    tags: [],
  };
}

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

describe("mealsFromLlmMenu", () => {
  it("resolves Russian names and compact ingredient fields", () => {
    const products = [
      product("chicken_breast", "Куриная грудка"),
      product("rice", "Рис", "grain"),
      product("cucumber", "Огурцы", "vegetable"),
      product("tomato", "Помидоры", "vegetable"),
    ];
    const input = {
      people: [
        {
          id: "a",
          name: "A",
          calorieTarget: 2000,
          proteinTarget: 120,
          fatTarget: 70,
          carbsTarget: 200,
          fiberTarget: 25,
          ironTarget: 18,
        },
      ],
      days: 1,
      products,
      recipes: [],
      constraints: { excludedProductIds: [], eatingOutSlots: [] },
    } as OptimizationInput;
    const menu = mealsFromLlmMenu(
      {
        days: [
          {
            day: 1,
            meals: [
              {
                name: "Курица с рисом",
                meal_type: "dinner",
                ingredients: [
                  { n: "Курица", g: 250 },
                  { product_id: "Рис", grams: "80" },
                  { n: "Огурцы", g: 100 },
                  { n: "Помидоры", g: 80 },
                ],
                side_salad: {
                  name: "Овощной",
                  ingredients: [
                    { n: "Огурцы", g: 100 },
                    { n: "Помидоры", g: 80 },
                  ],
                },
                steps: [
                  { order: 1, title: "A", text: "Подготовить.", minutes: 3 },
                  { order: 2, title: "B", text: "Пожарить.", minutes: 10 },
                  { order: 3, title: "C", text: "Подать.", minutes: 2 },
                ],
              },
            ],
          },
        ],
      },
      input,
      [],
    );
    expect(menu).toHaveLength(1);
    expect(menu[0].ingredients).toEqual(
      expect.arrayContaining([
        { product_id: "chicken_breast", grams: 250 },
        { product_id: "rice", grams: 80 },
        { product_id: "cucumber", grams: 100 },
        { product_id: "tomato", grams: 80 },
      ]),
    );
    expect(menu[0].ingredients.filter((ing) => ing.product_id === "cucumber")).toHaveLength(1);
    expect(menu[0].sideSalad?.name).toBe("Овощной");
    expect(menu[0].sideSalad?.ingredients.map((ing) => ing.product_id).sort()).toEqual(["cucumber", "tomato"]);
    const { dish } = splitMealIngredients(menu[0]);
    expect(dish.map((ing) => ing.product_id).sort()).toEqual(["chicken_breast", "rice"]);
  });
});
