import type {
  EatingOutSlot,
  MealPersonPortion,
  OptimizationConstraints,
  PersonTargets,
  PlannedMeal,
  RecipeIngredient,
} from "@/lib/optimizer/types";

export function calorieShares(people: PersonTargets[]): Map<string, number> {
  const total = people.reduce((sum, person) => sum + Math.max(0, person.calorieTarget), 0);
  const map = new Map<string, number>();
  if (people.length === 0) return map;
  if (total <= 0) {
    const equal = 1 / people.length;
    for (const person of people) map.set(person.id, equal);
    return map;
  }
  for (const person of people) {
    map.set(person.id, Math.max(0, person.calorieTarget) / total);
  }
  return map;
}

export function peopleEatingHome(
  people: PersonTargets[],
  constraints: OptimizationConstraints,
  dayIndex: number,
  mealType: string,
): PersonTargets[] {
  const slots = constraints.eatingOutSlots ?? [];
  const out = new Set(
    slots
      .filter((slot) => slot.dayIndex === dayIndex && slot.mealType === mealType && slot.personId)
      .map((slot) => slot.personId),
  );
  const legacyEveryone = slots.some(
    (slot) =>
      slot.dayIndex === dayIndex &&
      slot.mealType === mealType &&
      !(slot as { personId?: string }).personId,
  );
  if (legacyEveryone) return [];
  return people.filter((person) => !out.has(person.id));
}

export function homeScaleFactor(
  people: PersonTargets[],
  constraints: OptimizationConstraints,
  dayIndex: number,
  mealType: string,
): number {
  if (!people?.length) return 1;
  const home = peopleEatingHome(people, constraints, dayIndex, mealType);
  if (home.length === 0) return 0;
  if (home.length === people.length) return 1;
  const shares = calorieShares(people);
  return home.reduce((sum, person) => sum + (shares.get(person.id) ?? 0), 0);
}

export function isEveryoneEatingOut(
  people: PersonTargets[],
  constraints: OptimizationConstraints,
  dayIndex: number,
  mealType: string,
): boolean {
  return peopleEatingHome(people, constraints, dayIndex, mealType).length === 0;
}

export function eatingOutPersonIds(
  people: PersonTargets[],
  constraints: OptimizationConstraints,
  dayIndex: number,
  mealType: string,
): string[] {
  const homeIds = new Set(peopleEatingHome(people, constraints, dayIndex, mealType).map((person) => person.id));
  return people.filter((person) => !homeIds.has(person.id)).map((person) => person.id);
}

export function scaleIngredientList(ingredients: RecipeIngredient[], factor: number): RecipeIngredient[] {
  return ingredients.map((ing) => ({
    product_id: ing.product_id,
    grams: Math.max(0, Math.round(ing.grams * factor)),
  }));
}

export function attachPortions(
  meal: PlannedMeal,
  people: PersonTargets[],
  constraints: OptimizationConstraints,
): PlannedMeal {
  if (people.length === 0) return meal;
  const shares = calorieShares(people);
  const outIds = new Set(
    meal.eatingOutPersonIds ?? eatingOutPersonIds(people, constraints, meal.dayIndex, meal.mealType),
  );
  const home = people.filter((person) => !outIds.has(person.id));
  const homeShareTotal = home.reduce((sum, person) => sum + (shares.get(person.id) ?? 0), 0) || 1;

  const portions: MealPersonPortion[] = people.map((person) => {
    const eatingOut = outIds.has(person.id);
    const rawShare = shares.get(person.id) ?? 0;
    const shareOfHome = eatingOut || homeShareTotal <= 0 ? 0 : rawShare / homeShareTotal;
    const ingredients = eatingOut ? [] : scaleIngredientList(meal.ingredients, shareOfHome);
    return {
      personId: person.id,
      name: person.name,
      share: Math.round(rawShare * 1000) / 1000,
      eatingOut,
      calories: Math.round(meal.calories * shareOfHome * 10) / 10,
      protein: Math.round(meal.protein * shareOfHome * 10) / 10,
      fat: Math.round(meal.fat * shareOfHome * 10) / 10,
      carbs: Math.round(meal.carbs * shareOfHome * 10) / 10,
      ingredients,
    };
  });

  return {
    ...meal,
    eatingOut: home.length === 0,
    eatingOutPersonIds: [...outIds],
    portions,
  };
}

/**
 * `meal` must describe the full household plate (macros + ingredients).
 * Scales cart grams to who eats at home and attaches per-person portions.
 */
export function withHomePresence(
  meal: PlannedMeal,
  people: PersonTargets[],
  constraints: OptimizationConstraints,
): PlannedMeal {
  if (!people?.length) return meal;
  const full = (meal.fullIngredients ?? meal.ingredients).map((ing) => ({ ...ing }));
  const factor = homeScaleFactor(people, constraints, meal.dayIndex, meal.mealType);
  const outIds = eatingOutPersonIds(people, constraints, meal.dayIndex, meal.mealType);
  const homeCount = Math.max(0, people.length - outIds.length);
  const scaled: PlannedMeal = {
    ...meal,
    fullIngredients: full,
    ingredients: scaleIngredientList(full, factor),
    calories: Math.round(meal.calories * factor * 10) / 10,
    protein: Math.round(meal.protein * factor * 10) / 10,
    fat: Math.round(meal.fat * factor * 10) / 10,
    carbs: Math.round(meal.carbs * factor * 10) / 10,
    fiber: Math.round((meal.fiber ?? 0) * factor * 10) / 10,
    iron: Math.round((meal.iron ?? 0) * factor * 10) / 10,
    eatingOut: factor <= 0,
    eatingOutPersonIds: outIds,
    servings: homeCount > 0 ? homeCount : Math.max(1, people.length),
  };
  return attachPortions(scaled, people, constraints);
}

export function togglePersonOutSlot(
  slots: EatingOutSlot[] | undefined,
  personId: string,
  dayIndex: number,
  mealType: EatingOutSlot["mealType"],
): EatingOutSlot[] {
  const current = slots ?? [];
  const exists = current.some(
    (slot) => slot.personId === personId && slot.dayIndex === dayIndex && slot.mealType === mealType,
  );
  if (exists) {
    return current.filter(
      (slot) => !(slot.personId === personId && slot.dayIndex === dayIndex && slot.mealType === mealType),
    );
  }
  return [...current, { personId, dayIndex, mealType }];
}
