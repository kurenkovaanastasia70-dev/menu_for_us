import { catalog } from "@/lib/catalog/repository";
import { requestWorker } from "@/lib/llm/client";
import { materializeFromMenu, type OptimizationInput, type OptimizationResult, type PlannedMeal, type Recipe } from "@/lib/optimizer";
import {
  attachSideSalad,
  attachSnackFruit,
  fallbackGuide,
  isSideSalad,
  nutritionFromIngredients,
  pickSideSalad,
  pickSnackFruit,
  plannedMealFromRecipe,
} from "@/lib/optimizer/meals";
import { pricedCatalogForLlm } from "./generate-week";
import { withHomePresence } from "./portions";
import { recipeUsesCart } from "./recipe-score";

export type MealAlternative =
  | { kind: "catalog"; recipe: Recipe; extraCost: number; reason: string }
  | {
      kind: "llm";
      recipeId: string;
      name: string;
      reason: string;
      ingredients: Array<{ product_id: string; grams: number }>;
      steps: Array<{ order: number; title: string; text: string; minutes?: number }>;
      extraCost: number;
    };

export function suggestMealAlternatives(
  meal: PlannedMeal,
  result: OptimizationResult,
  input: OptimizationInput,
  limit = 3,
): Array<{ recipe: Recipe; extraCost: number; reason: string }> {
  const cartIds = new Set(result.cart.map((line) => line.productId));
  const candidates = input.recipes.filter(
    (recipe) =>
      recipe.meal_type === meal.mealType &&
      recipe.id !== meal.recipeId &&
      !recipe.tags.includes("side") &&
      recipe.cooking_time <= input.constraints.maxCookingTime,
  );

  const scored = candidates.map((recipe) => {
    const nextMenu = result.menu.map((item) =>
      item === meal ? mealFromRecipe(recipe, item, input) : item,
    );
    const next = materializeFromMenu(nextMenu, input);
    const extraCost = next.effectiveCost - result.effectiveCost;
    const overlap = recipeUsesCart(recipe, cartIds);
    const calorieDelta = Math.abs(recipe.calories * input.people.length - meal.calories);
    const reason = overlap
      ? "Продукты уже есть в корзине"
      : extraCost <= 0
        ? "Без доплаты или дешевле"
        : "Близко по калориям и БЖУ";
    return {
      recipe,
      extraCost,
      calorieDelta,
      overlap: overlap ? 1 : 0,
      proteinDelta: Math.abs(recipe.protein * input.people.length - meal.protein),
      reason,
      next,
    };
  });

  scored.sort((a, b) => {
    if (b.overlap !== a.overlap) return b.overlap - a.overlap;
    if (a.extraCost !== b.extraCost) return a.extraCost - b.extraCost;
    if (a.calorieDelta !== b.calorieDelta) return a.calorieDelta - b.calorieDelta;
    return a.proteinDelta - b.proteinDelta;
  });

  return scored.slice(0, limit).map(({ recipe, extraCost, reason }) => ({ recipe, extraCost, reason }));
}

export async function suggestLlmMealAlternatives(
  meal: PlannedMeal,
  result: OptimizationResult,
  input: OptimizationInput,
  options?: { refreshToken?: number },
): Promise<MealAlternative[]> {
  const NEED = 5;
  const products = pricedCatalogForLlm(input).filter(
    (item) => !(input.constraints.excludedProductIds ?? []).includes(item.id),
  );
  const productIds = new Set(products.map((item) => item.id));
  const avoidNames = new Set([meal.recipeName.trim().toLowerCase()].filter(Boolean));
  const out: MealAlternative[] = [];

  for (let attempt = 0; attempt < 3 && out.length < NEED; attempt += 1) {
    const worker = await requestWorker<{
      ok?: boolean;
      incomplete?: boolean;
      alternatives?: Array<{
        name: string;
        recipe_id?: string;
        reason?: string;
        meal_type?: string;
        ingredients?: Array<{ product_id: string; grams: number }>;
        steps?: Array<{ order?: number; title: string; text: string; minutes?: number }>;
      }>;
      error?: string;
    }>("/api/generate-alternatives", {
      currentName: meal.recipeName,
      mealType: meal.mealType,
      budget: input.budget,
      cartProductIds: result.cart.map((line) => line.productId).slice(0, 40),
      refreshToken: `${options?.refreshToken ?? 0}-${attempt}`,
      avoidNames: [...avoidNames],
      products,
    });

    if (!worker.ok || !worker.data.alternatives?.length) continue;

    for (const alt of worker.data.alternatives) {
      if (out.length >= NEED) break;
      const name = String(alt.name ?? "").trim();
      if (!name || avoidNames.has(name.toLowerCase())) continue;
      const ingredients = (alt.ingredients ?? [])
        .filter((ing) => productIds.has(ing.product_id) && ing.grams > 0)
        .map((ing) => ({ product_id: ing.product_id, grams: Math.round(ing.grams) }));
      if (ingredients.length === 0) continue;
      const steps = (alt.steps ?? []).map((step, stepIndex) => ({
        order: step.order || stepIndex + 1,
        title: step.title || `Шаг ${stepIndex + 1}`,
        text: step.text || "Приготовить по вкусу.",
        minutes: step.minutes,
      }));
      while (steps.length < 3) {
        steps.push({
          order: steps.length + 1,
          title: `Шаг ${steps.length + 1}`,
          text: "Приготовить по вкусу.",
          minutes: 5,
        });
      }
      const recipeId = alt.recipe_id || `llm_alt_${meal.dayIndex}_${meal.mealType}_${out.length}_${attempt}`;
      const draft = replaceMealWithLlmIdea(result, meal, { recipeId, name, ingredients, steps }, input);
      out.push({
        kind: "llm",
        recipeId,
        name,
        reason: alt.reason || "Вариант от модели",
        ingredients,
        steps,
        extraCost: draft.effectiveCost - result.effectiveCost,
      });
      avoidNames.add(name.toLowerCase());
    }
  }

  return out.slice(0, NEED);
}

export function replaceMeal(
  result: OptimizationResult,
  meal: PlannedMeal,
  recipe: Recipe,
  input: OptimizationInput,
): OptimizationResult {
  const nextMenu = result.menu.map((item) =>
    item.dayIndex === meal.dayIndex && item.mealType === meal.mealType
      ? mealFromRecipe(recipe, item, input)
      : item,
  );
  return materializeFromMenu(nextMenu, input, { trainingPlans: result.trainingPlans });
}

export function replaceMealWithLlmIdea(
  result: OptimizationResult,
  meal: PlannedMeal,
  idea: {
    recipeId: string;
    name: string;
    ingredients: Array<{ product_id: string; grams: number }>;
    steps: Array<{ order: number; title: string; text: string; minutes?: number }>;
  },
  input: OptimizationInput,
): OptimizationResult {
  const peopleCount = Math.max(1, input.people.length);
  const nutrition = nutritionFromIngredients(idea.ingredients, input.products);
  const steps =
    idea.steps.length >= 3
      ? idea.steps
      : [
          { order: 1, title: "Подготовка", text: "Подготовьте продукты.", minutes: 5 },
          { order: 2, title: "Готовка", text: "Приготовьте блюдо.", minutes: 15 },
          { order: 3, title: "Подача", text: "Подайте к столу.", minutes: 2 },
        ];
  let next: PlannedMeal = {
    ...meal,
    recipeId: idea.recipeId,
    recipeName: idea.name,
    ingredients: idea.ingredients.map((ing) => ({ ...ing })),
    fullIngredients: idea.ingredients.map((ing) => ({ ...ing })),
    calories: nutrition.calories,
    protein: nutrition.protein,
    fat: nutrition.fat,
    carbs: nutrition.carbs,
    fiber: nutrition.fiber,
    iron: nutrition.iron,
    instructions: steps.map((step) => step.text),
    fromLlm: true,
    leftover: false,
    leftoverFrom: undefined,
    guide: {
      recipe_id: idea.recipeId,
      title: idea.name,
      subtitle: "Рецепт от модели",
      time_minutes: Math.max(
        5,
        steps.reduce((sum, step) => sum + (step.minutes ?? 5), 0),
      ),
      servings: peopleCount,
      steps,
      tips: [],
      plating: "",
    },
  };
  if (meal.mealType === "dinner") {
    const salad =
      input.recipes.find((item) => item.id === meal.sideSalad?.recipeId && isSideSalad(item)) ??
      pickSideSalad(input.recipes, result.menu.filter((item) => item !== meal));
    if (salad) next = attachSideSalad(next, salad, peopleCount);
  }
  if (meal.mealType === "snack") {
    const fruit =
      catalog.getProducts().find((item) => item.id === meal.sideFruit?.productId) ??
      pickSnackFruit(catalog.getProducts(), []);
    if (fruit) next = attachSnackFruit(next, fruit, peopleCount);
  }
  next = {
    ...next,
    fullIngredients: next.ingredients.map((ing) => ({ ...ing })),
  };
  const constraints = {
    ...input.constraints,
    eatingOutSlots: [
      ...(input.constraints.eatingOutSlots ?? []).filter(
        (slot) => !(slot.dayIndex === meal.dayIndex && slot.mealType === meal.mealType),
      ),
      ...(meal.eatingOutPersonIds ?? []).map((personId) => ({
        personId,
        dayIndex: meal.dayIndex,
        mealType: meal.mealType,
      })),
    ],
  };
  next = withHomePresence(next, input.people, constraints);
  const nextMenu = result.menu.map((item) =>
    item.dayIndex === meal.dayIndex && item.mealType === meal.mealType ? next : item,
  );
  return materializeFromMenu(nextMenu, input, { trainingPlans: result.trainingPlans });
}

export function replaceProduct(
  result: OptimizationResult,
  fromProductId: string,
  toProductId: string,
  input: OptimizationInput,
): OptimizationResult {
  const nextMenu = result.menu.map((meal) => ({
    ...meal,
    ingredients: meal.ingredients.map((ing) =>
      ing.product_id === fromProductId ? { ...ing, product_id: toProductId } : ing,
    ),
    fullIngredients: (meal.fullIngredients ?? meal.ingredients).map((ing) =>
      ing.product_id === fromProductId ? { ...ing, product_id: toProductId } : ing,
    ),
  }));
  const products = catalog.getProducts();
  const recalculated = nextMenu.map((meal) => {
    const nutrition = meal.ingredients.reduce(
      (acc, ing) => {
        const product = products.find((item) => item.id === ing.product_id);
        if (!product) return acc;
        const k = ing.grams / 100;
        return {
          calories: acc.calories + product.calories_per_100g * k,
          protein: acc.protein + product.protein_per_100g * k,
          fat: acc.fat + product.fat_per_100g * k,
          carbs: acc.carbs + product.carbs_per_100g * k,
          fiber: acc.fiber + product.fiber_per_100g * k,
          iron: acc.iron + product.iron_per_100g * k,
        };
      },
      { calories: 0, protein: 0, fat: 0, carbs: 0, fiber: 0, iron: 0 },
    );
    return {
      ...meal,
      calories: Math.round(nutrition.calories * 10) / 10,
      protein: Math.round(nutrition.protein * 10) / 10,
      fat: Math.round(nutrition.fat * 10) / 10,
      carbs: Math.round(nutrition.carbs * 10) / 10,
      fiber: Math.round(nutrition.fiber * 10) / 10,
      iron: Math.round(nutrition.iron * 10) / 10,
    };
  });
  return materializeFromMenu(recalculated, input, { trainingPlans: result.trainingPlans });
}

function mealFromRecipe(recipe: Recipe, meal: PlannedMeal, input: OptimizationInput): PlannedMeal {
  const peopleCount = Math.max(1, input.people.length);
  let next = plannedMealFromRecipe(recipe, meal, peopleCount);
  if (meal.mealType === "dinner" && !isSideSalad(recipe)) {
    const salad =
      input.recipes.find((item) => item.id === meal.sideSalad?.recipeId && isSideSalad(item)) ??
      pickSideSalad(input.recipes, []);
    if (salad) next = attachSideSalad(next, salad, peopleCount);
  }
  if (meal.mealType === "snack") {
    const products = catalog.getProducts();
    const fruit =
      products.find((item) => item.id === meal.sideFruit?.productId) ?? pickSnackFruit(products, []);
    if (fruit) next = attachSnackFruit(next, fruit, peopleCount);
  }
  next = {
    ...next,
    fromLlm: false,
    fullIngredients: next.ingredients.map((ing) => ({ ...ing })),
    eatingOutPersonIds: meal.eatingOutPersonIds,
    guide: fallbackGuide(recipe, next),
  };
  const constraints = {
    ...input.constraints,
    eatingOutSlots: [
      ...(input.constraints.eatingOutSlots ?? []).filter(
        (slot) => !(slot.dayIndex === meal.dayIndex && slot.mealType === meal.mealType),
      ),
      ...(meal.eatingOutPersonIds ?? []).map((personId) => ({
        personId,
        dayIndex: meal.dayIndex,
        mealType: meal.mealType,
      })),
    ],
  };
  return withHomePresence(next, input.people, constraints);
}
