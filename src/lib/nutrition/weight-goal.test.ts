import { describe, expect, it } from "vitest";
import { calorieTargetForWeeks, calculateWeightPlan, fiberTargetFor, ironTargetFor, suggestedWeeks } from "./weight-goal";

describe("weight goal", () => {
  it("estimates weeks to lose weight from a calorie deficit", () => {
    const plan = calculateWeightPlan({
      currentKg: 70,
      targetKg: 64,
      tdee: 2000,
      calorieTarget: 1500,
      goal: "lose",
      menuDays: 7,
    });
    expect(plan.deltaKg).toBe(-6);
    expect(plan.weeklyKg).toBeLessThan(0);
    expect(plan.weeksToGoal).toBeGreaterThanOrEqual(8);
    expect(plan.menuDaysNote).toContain("7 дн");
  });

  it("calculates calories for a chosen timeline", () => {
    const calories = calorieTargetForWeeks({
      tdee: 2000,
      currentKg: 70,
      targetKg: 64,
      weeks: 12,
      gender: "female",
    });
    expect(calories).toBeLessThan(2000);
    expect(calories).toBeGreaterThanOrEqual(1200);
  });

  it("suggests at least 6 weeks for a multi-kilo goal", () => {
    expect(suggestedWeeks(80, 74)).toBeGreaterThanOrEqual(6);
  });
});

describe("micronutrient targets", () => {
  it("sets fiber and iron per person", () => {
    expect(fiberTargetFor("female")).toBe(25);
    expect(fiberTargetFor("male")).toBe(30);
    expect(ironTargetFor("female", 28)).toBe(18);
    expect(ironTargetFor("female", 55)).toBe(8);
    expect(ironTargetFor("male", 30)).toBe(8);
  });
});
