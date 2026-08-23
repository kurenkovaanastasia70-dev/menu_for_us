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
  if (!fromName || !toName || fromName === toName) return meal;
  const swap = (text: string) => text.split(fromName).join(toName);
  return {
    ...meal,
    recipeName: swap(meal.recipeName),
    instructions: meal.instructions.map(swap),
    guide: meal.guide
      ? {
          ...meal.guide,
          title: swap(meal.guide.title),
          subtitle: swap(meal.guide.subtitle),
          plating: swap(meal.guide.plating),
          tips: meal.guide.tips.map(swap),
          steps: meal.guide.steps.map((step) => ({
            ...step,
            title: swap(step.title),
            text: swap(step.text),
          })),
        }
      : meal.guide,
  };
}

function meatFamily(productId: string, products: Product[]): string {
  const tags = products.find((item) => item.id === productId)?.tags ?? [];
  if (tags.includes("turkey") || productId.includes("turkey")) return "turkey";
  if (tags.includes("chicken") || productId.includes("chicken")) return "chicken";
  if (tags.includes("beef") || productId.includes("beef")) return "beef";
  if (tags.includes("pork") || productId.includes("pork")) return "pork";
  if (tags.includes("lamb") || productId.includes("lamb")) return "lamb";
  return productId;
}

function replacementRank(
  currentId: string,
  candidateId: string,
  products: Product[],
): number {
  const currentFamily = meatFamily(currentId, products);
  const family = meatFamily(candidateId, products);
  let rank = 0;
  if (family === currentFamily) rank += 40;
  if (family === "chicken" && currentFamily !== "chicken") rank += 30;
  if (candidateId === "chicken_thigh") rank += 10;
  return rank;
}

function pickReplacement(
  currentId: string,
  pool: string[],
  used: Map<string, number>,
  limit: number,
  products: Product[],
): string | null {
  const ranked = pool
    .filter((id) => id !== currentId && (used.get(id) ?? 0) < limit)
    .sort(
      (a, b) =>
        (used.get(a) ?? 0) - (used.get(b) ?? 0) ||
        replacementRank(currentId, a, products) - replacementRank(currentId, b, products) ||
        a.localeCompare(b),
    );
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
      const replacement = pickReplacement(ing.product_id, pool, used, limit, input.products);
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
