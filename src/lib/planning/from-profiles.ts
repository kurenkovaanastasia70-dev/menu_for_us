import type { OptimizationInput } from "@/lib/optimizer";
import type { CashbackRuleRow, FridgeItem, Household, Profile } from "@/lib/supabase/types";
import { catalog } from "@/lib/catalog/repository";
import { ageFromBirthDate } from "@/lib/nutrition/calculator";
import { fiberTargetFor, ironTargetFor } from "@/lib/nutrition/weight-goal";

export function peopleFromProfiles(profiles: Profile[]) {
  return profiles.map((profile) => {
    const age = ageFromBirthDate(profile.birth_date);
    return {
      id: profile.id,
      name: profile.name,
      calorieTarget: profile.calorie_target,
      proteinTarget: Number(profile.protein_target),
      fatTarget: Number(profile.fat_target),
      carbsTarget: Number(profile.carbs_target),
      fiberTarget: Number(profile.fiber_target) || fiberTargetFor(profile.gender),
      ironTarget: Number(profile.iron_target) || ironTargetFor(profile.gender, age),
    };
  });
}

/** Всегда два человека для меню пары: реальные профили + черновик партнёра, если второй ещё не подключился. */
export function couplePeopleForPlan(
  profiles: Profile[],
  draft?: { id?: string; name: string; calorieTarget: number; proteinTarget?: number },
) {
  const people = peopleFromProfiles(profiles);
  if (people.length >= 2) return people.slice(0, 2);
  const primary = people[0];
  const partner = {
    id: draft?.id ?? "partner-draft",
    name: draft?.name?.trim() || "Партнёр",
    calorieTarget: Math.max(1200, Number(draft?.calorieTarget) || primary?.calorieTarget || 2000),
    proteinTarget: Math.max(60, Number(draft?.proteinTarget) || Math.round((draft?.calorieTarget || primary?.calorieTarget || 2000) * 0.08)),
    fatTarget: primary?.fatTarget ?? 70,
    carbsTarget: primary?.carbsTarget ?? 200,
    fiberTarget: primary?.fiberTarget ?? 25,
    ironTarget: primary?.ironTarget ?? 12,
  };
  if (primary) return [primary, partner];
  return [partner];
}

export function couplePlannerSlots(
  profiles: Profile[],
  draft?: { id?: string; name: string; calorieTarget: number },
): Array<{ id: string; name: string; isDraft: boolean }> {
  if (profiles.length >= 2) {
    return profiles.slice(0, 2).map((profile) => ({ id: profile.id, name: profile.name, isDraft: false }));
  }
  const first = profiles[0];
  return [
    { id: first?.id ?? "solo", name: first?.name ?? "Я", isDraft: false },
    {
      id: draft?.id ?? "partner-draft",
      name: draft?.name?.trim() || "Партнёр",
      isDraft: true,
    },
  ];
}

export function constraintsFromProfiles(profiles: Profile[], household: Household): OptimizationInput["constraints"] {
  const primary = profiles[0];
  const excluded = [...new Set(profiles.flatMap((profile) => profile.excluded_products))];
  const allergies = [...new Set(profiles.flatMap((profile) => profile.allergies))];
  return {
    maxCookingTime: Math.min(...profiles.map((profile) => profile.max_cooking_time)),
    maxCookingSessions: primary?.cooking_sessions ?? 3,
    mealsPerDay: primary?.meals_per_day ?? 3,
    snacks: profiles.some((profile) => profile.snacks),
    excludedProductIds: excluded,
    allergies,
    dietType: profiles.some((profile) => profile.diet_type === "vegetarian") ? "vegetarian" : "omnivore",
    preferredStoreIds: household.preferred_stores,
    maxStores: household.max_stores,
    varietyPreference: "medium",
  };
}

export function cashbackInput(rows: CashbackRuleRow[]) {
  return rows.map((row) => ({ store_id: row.store_id, percent: Number(row.percent) }));
}

export function makeOptimizationInput(args: {
  profiles: Profile[];
  household: Household;
  cashback: CashbackRuleRow[];
  days: number;
  budget: number;
  fridge?: FridgeItem[];
}): OptimizationInput {
  const people = peopleFromProfiles(args.profiles);
  return {
    people,
    days: args.days,
    calorieTargets: people.reduce((sum, person) => sum + person.calorieTarget, 0),
    macroTargets: {
      protein: people.reduce((sum, person) => sum + person.proteinTarget, 0),
      fat: people.reduce((sum, person) => sum + person.fatTarget, 0),
      carbs: people.reduce((sum, person) => sum + person.carbsTarget, 0),
      fiber: people.reduce((sum, person) => sum + person.fiberTarget, 0),
      iron: people.reduce((sum, person) => sum + person.ironTarget, 0),
    },
    budget: args.budget,
    products: catalog.getProducts(),
    prices: catalog.getStoreProducts(),
    recipes: catalog.getRecipes(),
    cashback: cashbackInput(args.cashback),
    fridge: (args.fridge ?? []).map((item) => ({ productId: item.product_id, grams: item.grams })),
    constraints: constraintsFromProfiles(args.profiles, args.household),
  };
}
