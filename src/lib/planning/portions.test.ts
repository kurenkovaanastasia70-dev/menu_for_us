import { describe, expect, it } from "vitest";
import type { OptimizationConstraints, PersonTargets } from "@/lib/optimizer/types";
import { calorieShares, homeScaleFactor, withHomePresence } from "./portions";

const people: PersonTargets[] = [
  {
    id: "a",
    name: "Анна",
    calorieTarget: 2200,
    proteinTarget: 120,
    fatTarget: 70,
    carbsTarget: 220,
    fiberTarget: 25,
    ironTarget: 15,
  },
  {
    id: "b",
    name: "Боря",
    calorieTarget: 1800,
    proteinTarget: 100,
    fatTarget: 60,
    carbsTarget: 180,
    fiberTarget: 25,
    ironTarget: 12,
  },
];

const baseMeal = {
  dayIndex: 0,
  mealType: "lunch" as const,
  recipeId: "r1",
  recipeName: "Тест",
  cookingSession: 0,
  servings: 2,
  ingredients: [
    { product_id: "rice", grams: 200 },
    { product_id: "chicken_breast", grams: 300 },
  ],
  fullIngredients: [
    { product_id: "rice", grams: 200 },
    { product_id: "chicken_breast", grams: 300 },
  ],
  calories: 1000,
  protein: 80,
  fat: 20,
  carbs: 100,
  fiber: 4,
  iron: 2,
  instructions: [],
};

describe("portions", () => {
  it("splits grams by calorie share when both eat at home", () => {
    const constraints: OptimizationConstraints = {
      maxCookingTime: 40,
      maxCookingSessions: 3,
      mealsPerDay: 3,
      snacks: true,
      excludedProductIds: [],
      allergies: [],
      dietType: "omnivore",
      preferredStoreIds: [],
      maxStores: 2,
      varietyPreference: "medium",
      eatingOutSlots: [],
    };
    const meal = withHomePresence(baseMeal, people, constraints);
    expect(meal.portions).toHaveLength(2);
    const anna = meal.portions!.find((p) => p.personId === "a")!;
    const borya = meal.portions!.find((p) => p.personId === "b")!;
    expect(anna.calories).toBeGreaterThan(borya.calories);
    expect(anna.ingredients.find((i) => i.product_id === "chicken_breast")!.grams).toBeGreaterThan(
      borya.ingredients.find((i) => i.product_id === "chicken_breast")!.grams,
    );
    expect(calorieShares(people).get("a")).toBeCloseTo(0.55, 2);
  });

  it("scales cart when only one person eats out", () => {
    const constraints: OptimizationConstraints = {
      maxCookingTime: 40,
      maxCookingSessions: 3,
      mealsPerDay: 3,
      snacks: true,
      excludedProductIds: [],
      allergies: [],
      dietType: "omnivore",
      preferredStoreIds: [],
      maxStores: 2,
      varietyPreference: "medium",
      eatingOutSlots: [{ personId: "a", dayIndex: 0, mealType: "lunch" }],
    };
    expect(homeScaleFactor(people, constraints, 0, "lunch")).toBeCloseTo(0.45, 2);
    const meal = withHomePresence(baseMeal, people, constraints);
    expect(meal.eatingOut).toBe(false);
    expect(meal.eatingOutPersonIds).toEqual(["a"]);
    expect(meal.ingredients.find((i) => i.product_id === "chicken_breast")!.grams).toBe(135);
    expect(meal.portions!.find((p) => p.personId === "a")!.eatingOut).toBe(true);
    expect(meal.portions!.find((p) => p.personId === "b")!.eatingOut).toBe(false);
  });
});
