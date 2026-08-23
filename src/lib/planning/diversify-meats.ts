import type { OptimizationInput, PlannedMeal, Product } from "@/lib/optimizer";
import { nutritionFromIngredients } from "@/lib/optimizer/meals";
import { withHomePresence } from "./portions";
import { meatProductIds, type CompactMeal } from "./previous-menu";

function maxSameMeat(variety: OptimizationInput["constraints"]["varietyPreference"]): number {
  if (variety === "high") return 1;
  if (variety === "low") return 4;
  return 2;
}

function isMeatProduct(productId: string, meatIds: Set<string>): boolean {
  return meatIds.has(productId);
}

function rebuild(meal: PlannedMeal, ingredients: PlannedMeal["ingredients"], input: OptimizationInput): PlannedMeal {
  const full = ingredients.map((ing) => ({ ...ing }));
  const nutrition = nutritionFromIngredients(full, input.products);
  const base: PlannedMeal = {
    ...meal,
    ingredients: full,
    fullIngredients: full,
    calories: nutrition.calories,
    protein: nutrition.protein,
    fat: nutrition.fat,
    carbs: nutrition.carbs,
    fiber: nutrition.fiber,
    iron: nutrition.iron,
    portions: undefined,
  };
  if (!input.people?.length) return base;
  return withHomePresence(base, input.people, input.constraints);
}

function renameMeat(meal: PlannedMeal, fromId: string, toId: string, products: Product[]): PlannedMeal {
  const fromName = products.find((item) => item.id === fromId)?.canonical_name;
  const toName = products.find((item) => item.id === toId)?.canonical_name;
  if (!fromName || !toName) return meal;
  return {
    ...meal,
    recipeName: meal.recipeName.split(fromName).join(toName),
    guide: meal.guide ? { ...meal.guide, title: meal.guide.title.split(fromName).join(toName) } : meal.guide,
  };
}

function pickReplacement(
  currentId: string,
  pool: string[],
  used: Map<string, number>,
  limit: number,
): string | null {
  const ranked = pool
    .filter((id) => id !== currentId && (used.get(id) ?? 0) < limit)
    .sort((a, b) => (used.get(a) ?? 0) - (used.get(b) ?? 0) || (a === "chicken_thigh" ? 1 : 0) - (b === "chicken_thigh" ? 1 : 0));
  return ranked[0] ?? null;
}

/** Меняет повторяющееся мясо в ужинах, чтобы не выходила неделя одних бёдер. */
export function diversifyRepeatedMeats(
  menu: PlannedMeal[],
  input: OptimizationInput,
  previousMeals: CompactMeal[] = [],
): PlannedMeal[] {
  if (input.constraints.dietType === "vegetarian") return menu;
  const meatIds = new Set(meatProductIds(input.products));
  if (meatIds.size === 0) return menu;
  const excluded = new Set(input.constraints.excludedProductIds ?? []);
  const pool = [...meatIds].filter((id) => !excluded.has(id));
  const limit = maxSameMeat(input.constraints.varietyPreference);
  const used = new Map<string, number>();
  for (const meal of previousMeals) {
    if (meal.m !== "d") continue;
    for (const id of meal.p) {
      if (meatIds.has(id)) used.set(id, (used.get(id) ?? 0) + 1);
    }
  }

  const next = menu.map((meal) => ({ ...meal }));
  const mains = next
    .filter(
      (meal) =>
        !meal.eatingOut &&
        (meal.mealType === "dinner" || (meal.mealType === "lunch" && !meal.leftover)),
    )
    .sort((a, b) => a.dayIndex - b.dayIndex || (a.mealType === "lunch" ? -1 : 1));

  for (const dinner of mains) {
    const source = (dinner.fullIngredients ?? dinner.ingredients).map((ing) => ({ ...ing }));
    let changed = dinner;
    const ingredients = source.map((ing) => {
      if (!isMeatProduct(ing.product_id, meatIds)) return ing;
      const count = used.get(ing.product_id) ?? 0;
      if (count < limit) {
        used.set(ing.product_id, count + 1);
        return ing;
      }
      const replacement = pickReplacement(ing.product_id, pool, used, limit);
      if (!replacement) {
        used.set(ing.product_id, count + 1);
        return ing;
      }
      used.set(replacement, (used.get(replacement) ?? 0) + 1);
      changed = renameMeat(changed, ing.product_id, replacement, input.products);
      return { ...ing, product_id: replacement };
    });
    const rebuilt = rebuild(changed, ingredients, input);
    const index = next.findIndex((item) => item.dayIndex === dinner.dayIndex && item.mealType === dinner.mealType);
    if (index >= 0) next[index] = rebuilt;
  }

  return next.map((meal) => {
    if (meal.mealType !== "lunch" || !meal.leftover || meal.eatingOut) return meal;
    const dinner = next.find((item) => item.dayIndex === meal.dayIndex - 1 && item.mealType === "dinner");
    if (!dinner) return meal;
    const dinnerMeats = (dinner.fullIngredients ?? dinner.ingredients).filter((ing) =>
      isMeatProduct(ing.product_id, meatIds),
    );
    if (dinnerMeats.length === 0) return meal;
    let cursor = 0;
    let changed = meal;
    const ingredients = (meal.fullIngredients ?? meal.ingredients).map((ing) => {
      if (!isMeatProduct(ing.product_id, meatIds)) return ing;
      const replacement = dinnerMeats[cursor % dinnerMeats.length];
      cursor += 1;
      if (replacement.product_id === ing.product_id) return ing;
      changed = renameMeat(changed, ing.product_id, replacement.product_id, input.products);
      return { ...ing, product_id: replacement.product_id };
    });
    return rebuild(changed, ingredients, input);
  });
}

export function isMeatTagged(product: Product | undefined): boolean {
  return Boolean(product?.tags?.includes("meat"));
}
