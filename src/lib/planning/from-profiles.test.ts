import { describe, expect, it } from "vitest";
import type { Profile } from "@/lib/supabase/types";
import { couplePeopleForPlan, couplePlannerSlots } from "./from-profiles";

function profile(partial: Partial<Profile> & Pick<Profile, "id" | "name">): Profile {
  return {
    user_id: "u",
    household_id: "h",
    gender: "female",
    birth_date: "1995-01-01",
    height_cm: 165,
    weight_kg: 60,
    activity_level: "moderate",
    goal: "maintain",
    target_weight_kg: 60,
    calorie_target: 1800,
    protein_target: 100,
    fat_target: 60,
    carbs_target: 180,
    meals_per_day: 3,
    snacks: true,
    preferences: [],
    excluded_products: [],
    allergies: [],
    diet_type: "omnivore",
    max_cooking_time: 40,
    cooking_sessions: 3,
    batch_meals: true,
    ...partial,
  };
}

describe("couple planners", () => {
  it("always exposes two eating-out slots", () => {
    const slots = couplePlannerSlots([profile({ id: "a", name: "Анна" })], {
      id: "partner-draft",
      name: "Боря",
      calorieTarget: 2200,
    });
    expect(slots).toHaveLength(2);
    expect(slots[0].name).toBe("Анна");
    expect(slots[1].isDraft).toBe(true);
  });

  it("builds two people for generation when partner is a draft", () => {
    const people = couplePeopleForPlan([profile({ id: "a", name: "Анна", calorie_target: 1800 })], {
      name: "Боря",
      calorieTarget: 2200,
    });
    expect(people).toHaveLength(2);
    expect(people[1].name).toBe("Боря");
    expect(people[1].calorieTarget).toBe(2200);
  });
});
