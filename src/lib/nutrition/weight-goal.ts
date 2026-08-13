import type { Gender, Goal } from "./calculator";

/** Примерно столько килокалорий в 1 кг жира. */
export const KCAL_PER_KG = 7700;
export const MAX_WEEKLY_LOSS_KG = 0.75;
export const MIN_WEEKLY_LOSS_KG = 0.25;
export const MAX_WEEKLY_GAIN_KG = 0.4;

const FLOOR: Record<Gender, number> = { female: 1200, male: 1500 };

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export interface WeightPlan {
  currentKg: number;
  targetKg: number;
  deltaKg: number;
  direction: Goal;
  dailyDeltaKcal: number;
  weeklyKg: number;
  weeksToGoal: number | null;
  goalWeeks: number | null;
  safe: boolean;
  menuDaysNote: string;
  summary: string;
}

export function fiberTargetFor(gender: Gender): number {
  return gender === "male" ? 30 : 25;
}

export function ironTargetFor(gender: Gender, ageYears: number): number {
  if (gender === "male") return 8;
  return ageYears >= 51 ? 8 : 18;
}

export function calculateWeightPlan(input: {
  currentKg: number;
  targetKg: number;
  tdee: number;
  calorieTarget: number;
  goal: Goal;
  goalWeeks?: number;
  menuDays: number;
}): WeightPlan {
  const deltaKg = round1(input.targetKg - input.currentKg);
  const direction: Goal =
    Math.abs(deltaKg) < 0.3 ? "maintain" : deltaKg < 0 ? "lose" : "gain";
  const dailyDeltaKcal = Math.round(input.calorieTarget - input.tdee);
  const weeklyKg = round1((dailyDeltaKcal * 7) / KCAL_PER_KG);
  const needed = Math.abs(deltaKg);
  const weeklyAbs = Math.abs(weeklyKg);
  let weeksToGoal: number | null = null;
  if (direction !== "maintain" && weeklyAbs >= 0.05) {
    const sameDirection = (direction === "lose" && weeklyKg < 0) || (direction === "gain" && weeklyKg > 0);
    weeksToGoal = sameDirection ? Math.max(1, Math.ceil(needed / weeklyAbs)) : null;
  }
  const safe =
    direction === "maintain" ||
    (direction === "lose" && weeklyAbs <= MAX_WEEKLY_LOSS_KG && weeklyAbs >= MIN_WEEKLY_LOSS_KG) ||
    (direction === "gain" && weeklyAbs <= MAX_WEEKLY_GAIN_KG);

  let summary = "Вес планируется поддерживать.";
  if (direction === "lose") {
    summary = `Нужно снизить ${needed} кг. При текущем дефиците около ${weeklyAbs} кг в неделю это займёт примерно ${weeksToGoal ?? "—"} нед.`;
  } else if (direction === "gain") {
    summary = `Нужно набрать ${needed} кг. При текущем профиците около ${weeklyAbs} кг в неделю это займёт примерно ${weeksToGoal ?? "—"} нед.`;
  }

  return {
    currentKg: input.currentKg,
    targetKg: input.targetKg,
    deltaKg,
    direction,
    dailyDeltaKcal,
    weeklyKg,
    weeksToGoal,
    goalWeeks: input.goalWeeks ?? weeksToGoal,
    safe,
    menuDaysNote: `Корзина и меню считаются на ${input.menuDays} дн. Срок цели по весу — отдельный горизонт, не длина меню.`,
    summary,
  };
}

export function calorieTargetForWeeks(input: {
  tdee: number;
  currentKg: number;
  targetKg: number;
  weeks: number;
  gender: Gender;
}): number {
  const deltaKg = input.targetKg - input.currentKg;
  const weeks = Math.max(1, input.weeks);
  let weeklyKg = deltaKg / weeks;
  if (weeklyKg < 0) {
    weeklyKg = Math.max(-MAX_WEEKLY_LOSS_KG, Math.min(-MIN_WEEKLY_LOSS_KG, weeklyKg));
  } else if (weeklyKg > 0) {
    weeklyKg = Math.min(MAX_WEEKLY_GAIN_KG, weeklyKg);
  }
  const daily = input.tdee + (weeklyKg * KCAL_PER_KG) / 7;
  return Math.max(FLOOR[input.gender], Math.round(daily));
}

export function suggestedWeeks(currentKg: number, targetKg: number): number {
  const needed = Math.abs(targetKg - currentKg);
  if (needed < 0.3) return 0;
  return Math.max(6, Math.ceil(needed / 0.5));
}
