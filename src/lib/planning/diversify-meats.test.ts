import { describe, expect, it } from "vitest";
import type { OptimizationInput, PlannedMeal, Product } from "@/lib/optimizer";
import { diversifyRepeatedMeats } from "./diversify-meats";

function meat(id: string, name: string, extraTags: string[] = []): Product {
  return {
    id,
    canonical_name: name,
    category: "protein",
    calories_per_100g: 150,
    protein_per_100g: 20,
    fat_per_100g: 8,
    carbs_per_100g: 0,
    fiber_per_100g: 0,
    iron_per_100g: 1,
    package_weight: 500,
    unit: "g",
    tags: ["meat", ...extraTags],
  };
}

function dinner(dayIndex: number, productId: string, name: string): PlannedMeal {
  return {
    dayIndex,
    mealType: "dinner",
    recipeId: `d${dayIndex}`,
    recipeName: name,
    cookingSession: 1,
    servings: 2,
    ingredients: [{ product_id: productId, grams: 300 }],
    fullIngredients: [{ product_id: productId, grams: 300 }],
    calories: 500,
    protein: 60,
    fat: 20,
    carbs: 10,
    fiber: 0,
    iron: 1,
    instructions: ["Обжарьте Куриное бедро."],
    guide: {
      recipe_id: `d${dayIndex}`,
      title: name,
      subtitle: "",
      time_minutes: 25,
      servings: 2,
      steps: [{ order: 1, title: "Жарка", text: "Куриное бедро на сковороде.", minutes: 10 }],
      tips: [],
      plating: "",
    },
  };
}

function leftover(dayIndex: number, productId: string): PlannedMeal {
  return {
    ...dinner(dayIndex, productId, `Остатки: ${productId}`),
    mealType: "lunch",
    leftover: true,
    leftoverFrom: "вчерашний ужин",
  };
}

function input(): OptimizationInput {
  return {
    products: [
      meat("chicken_thigh", "Куриное бедро"),
      meat("turkey_fillet", "Филе индейки"),
      meat("pork_tenderloin", "Свиная вырезка"),
      meat("beef", "Говядина"),
    ],
    prices: [],
    people: [{ id: "a", name: "A", calorieTarget: 1800, proteinTarget: 110, fatTarget: 60, carbsTarget: 180, fiberTarget: 25, ironTarget: 12 }],
    days: 4,
    budget: 6000,
    cashback: [],
    fridge: [],
    recipes: [],
    calorieTargets: 1800,
    macroTargets: { protein: 110, fat: 60, carbs: 180, fiber: 25, iron: 12 },
    constraints: {
      preferredStoreIds: ["magnit"],
      varietyPreference: "high",
      maxCookingTime: 40,
      maxCookingSessions: 3,
      mealsPerDay: 3,
      snacks: true,
      excludedProductIds: [],
      allergies: [],
      dietType: "omnivore",
      maxStores: 2,
    },
  };
}

describe("diversifyRepeatedMeats", () => {
  it("breaks a streak of chicken thighs on dinners", () => {
    const menu = [0, 1, 2, 3].map((day) => dinner(day, "chicken_thigh", "Куриное бедро с рисом"));
    const next = diversifyRepeatedMeats(menu, input());
    const meats = next.map((meal) => meal.ingredients[0]?.product_id);
    expect(new Set(meats).size).toBeGreaterThan(1);
    expect(meats.filter((id) => id === "chicken_thigh").length).toBe(1);
    const swapped = next.find((item) => item.ingredients[0]?.product_id !== "chicken_thigh");
    expect(swapped?.guide?.steps[0]?.text).not.toContain("Куриное бедро");
  });

  it("keeps leftover lunch on the same meat as the previous dinner", () => {
    const menu = [
      dinner(0, "chicken_thigh", "Куриное бедро"),
      leftover(1, "chicken_thigh"),
      dinner(1, "chicken_thigh", "Куриное бедро ещё"),
      leftover(2, "chicken_thigh"),
    ];
    const next = diversifyRepeatedMeats(menu, input());
    const day1Dinner = next.find((item) => item.dayIndex === 1 && item.mealType === "dinner");
    const lunchAfter = next.find((item) => item.dayIndex === 2 && item.mealType === "lunch");
    expect(day1Dinner?.ingredients[0]?.product_id).not.toBe("chicken_thigh");
    expect(lunchAfter?.ingredients[0]?.product_id).toBe(day1Dinner?.ingredients[0]?.product_id);
  });

  it("does not replace turkey dinners with chicken", () => {
    const turkeyInput: OptimizationInput = {
      ...input(),
      products: [
        meat("chicken_breast", "Куриная грудка", ["chicken"]),
        meat("chicken_thigh", "Куриное бедро", ["chicken"]),
        meat("turkey_fillet", "Филе индейки", ["turkey"]),
        meat("pork_tenderloin", "Свиная вырезка", ["pork"]),
        meat("beef", "Говядина", ["beef"]),
      ],
    };
    const menu = [0, 1, 2].map((day) => dinner(day, "turkey_fillet", "Филе индейки с рисом"));
    const next = diversifyRepeatedMeats(menu, turkeyInput);
    const meats = next.map((meal) => meal.ingredients[0]?.product_id);
    expect(meats[0]).toBe("turkey_fillet");
    expect(meats.some((id) => id === "chicken_breast" || id === "chicken_thigh")).toBe(false);
    expect(new Set(meats).size).toBeGreaterThan(1);
  });
});
