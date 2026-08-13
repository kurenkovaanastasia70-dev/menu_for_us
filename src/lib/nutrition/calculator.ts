export type Gender = "female" | "male";
export type ActivityLevel =
  | "sedentary"
  | "light"
  | "moderate"
  | "active"
  | "very_active";
export type Goal = "lose" | "maintain" | "gain";

export interface NutritionPersonInput {
  gender: Gender;
  ageYears: number;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  goal: Goal;
  targetWeightKg?: number;
}

export interface NutritionTargets {
  bmr: number;
  tdee: number;
  calorieTarget: number;
  proteinTarget: number;
  fatTarget: number;
  carbsTarget: number;
}

export const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

const CALORIE_FLOOR: Record<Gender, number> = {
  female: 1200,
  male: 1500,
};

/** Mifflin–St Jeor. */
export function calculateBmr(input: {
  gender: Gender;
  weightKg: number;
  heightCm: number;
  ageYears: number;
}): number {
  const base = 10 * input.weightKg + 6.25 * input.heightCm - 5 * input.ageYears;
  const bmr = input.gender === "male" ? base + 5 : base - 161;
  return round1(bmr);
}

export function calculateTdee(bmr: number, activityLevel: ActivityLevel): number {
  return round1(bmr * ACTIVITY_MULTIPLIERS[activityLevel]);
}

export function calculateCalorieTarget(
  tdee: number,
  goal: Goal,
  gender: Gender,
): number {
  let target = tdee;
  if (goal === "lose") {
    target = tdee - Math.min(500, tdee * 0.18);
  } else if (goal === "gain") {
    target = tdee + Math.min(300, tdee * 0.12);
  }
  return Math.max(CALORIE_FLOOR[gender], Math.round(target));
}

export function calculateMacros(
  calorieTarget: number,
  weightKg: number,
  goal: Goal,
): { proteinTarget: number; fatTarget: number; carbsTarget: number } {
  const proteinPerKg = goal === "lose" ? 2.0 : goal === "gain" ? 1.8 : 1.6;
  const proteinTarget = round1(proteinPerKg * weightKg);
  const proteinKcal = proteinTarget * 4;
  const fatKcal = calorieTarget * (goal === "lose" ? 0.28 : 0.3);
  const fatTarget = round1(fatKcal / 9);
  const carbsKcal = Math.max(0, calorieTarget - proteinKcal - fatKcal);
  const carbsTarget = round1(carbsKcal / 4);
  return { proteinTarget, fatTarget, carbsTarget };
}

export function calculateNutritionTargets(
  input: NutritionPersonInput,
): NutritionTargets {
  const bmr = calculateBmr(input);
  const tdee = calculateTdee(bmr, input.activityLevel);
  const calorieTarget = calculateCalorieTarget(tdee, input.goal, input.gender);
  const macros = calculateMacros(calorieTarget, input.weightKg, input.goal);
  return { bmr, tdee, calorieTarget, ...macros };
}

export function ageFromBirthDate(birthDate: string, now = new Date()): number {
  const birth = new Date(birthDate);
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age;
}

export function macrosFromGrams(input: {
  grams: number;
  caloriesPer100g: number;
  proteinPer100g: number;
  fatPer100g: number;
  carbsPer100g: number;
}): { calories: number; protein: number; fat: number; carbs: number } {
  const factor = input.grams / 100;
  return {
    calories: round1(input.caloriesPer100g * factor),
    protein: round1(input.proteinPer100g * factor),
    fat: round1(input.fatPer100g * factor),
    carbs: round1(input.carbsPer100g * factor),
  };
}

export function sumNutrition(
  items: Array<{ calories: number; protein: number; fat: number; carbs: number }>,
): { calories: number; protein: number; fat: number; carbs: number } {
  return items.reduce(
    (acc, item) => ({
      calories: round1(acc.calories + item.calories),
      protein: round1(acc.protein + item.protein),
      fat: round1(acc.fat + item.fat),
      carbs: round1(acc.carbs + item.carbs),
    }),
    { calories: 0, protein: 0, fat: 0, carbs: 0 },
  );
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
