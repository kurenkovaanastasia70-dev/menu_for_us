import { describe, expect, it } from "vitest";
import {
  ageFromBirthDate,
  calculateBmr,
  calculateCalorieTarget,
  calculateMacros,
  calculateNutritionTargets,
  calculateTdee,
  macrosFromGrams,
} from "./calculator";

describe("nutrition calculator", () => {
  it("calculates male BMR with Mifflin–St Jeor", () => {
    const bmr = calculateBmr({
      gender: "male",
      weightKg: 80,
      heightCm: 180,
      ageYears: 30,
    });
    expect(bmr).toBe(1780);
  });

  it("calculates female BMR with Mifflin–St Jeor", () => {
    const bmr = calculateBmr({
      gender: "female",
      weightKg: 60,
      heightCm: 165,
      ageYears: 28,
    });
    expect(bmr).toBe(1330.3);
  });

  it("calculates TDEE from activity multiplier", () => {
    expect(calculateTdee(1600, "sedentary")).toBe(1920);
    expect(calculateTdee(1600, "moderate")).toBe(2480);
  });

  it("applies deficit, maintenance and surplus", () => {
    expect(calculateCalorieTarget(2000, "maintain", "female")).toBe(2000);
    expect(calculateCalorieTarget(2000, "lose", "female")).toBe(1640);
    expect(calculateCalorieTarget(2000, "gain", "male")).toBe(2250);
  });

  it("never goes below calorie floor", () => {
    expect(calculateCalorieTarget(1300, "lose", "female")).toBe(1200);
    expect(calculateCalorieTarget(1600, "lose", "male")).toBe(1500);
  });

  it("calculates macros from calories and body weight", () => {
    const macros = calculateMacros(1800, 70, "lose");
    expect(macros.proteinTarget).toBe(140);
    expect(macros.fatTarget).toBe(56);
    expect(macros.carbsTarget).toBe(184);
  });

  it("uses a lean-bulk surplus and higher protein for mass gain", () => {
    const macros = calculateMacros(2500, 80, "gain");
    expect(macros.proteinTarget).toBe(160);
    expect(macros.fatTarget).toBe(69.4);
    expect(macros.carbsTarget).toBeGreaterThan(250);
    expect(calculateCalorieTarget(2400, "gain", "male")).toBeGreaterThanOrEqual(2650);
  });

  it("keeps maintenance calories at TDEE even if weeks are set", () => {
    const result = calculateNutritionTargets({
      gender: "female",
      ageYears: 30,
      heightCm: 168,
      weightKg: 62,
      activityLevel: "light",
      goal: "maintain",
      targetWeightKg: 58,
      goalWeeks: 8,
    });
    expect(result.calorieTarget).toBe(Math.round(result.tdee));
  });

  it("returns a full nutrition profile", () => {
    const result = calculateNutritionTargets({
      gender: "female",
      ageYears: 27,
      heightCm: 168,
      weightKg: 62,
      activityLevel: "light",
      goal: "lose",
    });
    expect(result.bmr).toBeGreaterThan(1200);
    expect(result.calorieTarget).toBeLessThan(result.tdee);
    expect(result.proteinTarget).toBeGreaterThan(100);
    expect(result.fiberTarget).toBe(25);
    expect(result.ironTarget).toBe(18);
    expect(result.fatTarget).toBeGreaterThan(0);
    expect(result.carbsTarget).toBeGreaterThan(0);
  });

  it("calculates age from birth date", () => {
    expect(ageFromBirthDate("2000-01-01", new Date("2026-08-13"))).toBe(26);
    expect(ageFromBirthDate("2000-12-01", new Date("2026-08-13"))).toBe(25);
  });

  it("scales macros from per-100g values", () => {
    const macros = macrosFromGrams({
      grams: 150,
      caloriesPer100g: 110,
      proteinPer100g: 23,
      fatPer100g: 1.2,
      carbsPer100g: 0,
    });
    expect(macros.calories).toBe(165);
    expect(macros.protein).toBe(34.5);
    expect(macros.fat).toBe(1.8);
  });
});
