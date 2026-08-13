import {
  cashbackAmount,
  effectivePrice,
  leftoverGrams,
  packagesNeeded,
  purchasedGrams,
} from "../money/cashback";
import { macrosFromGrams, sumNutrition } from "../nutrition/calculator";
import type { Store } from "./types";
import {
  OPTIMIZER_WEIGHTS,
  type CartLine,
  type CookingSession,
  type OptimizationEngine,
  type OptimizationInput,
  type OptimizationResult,
  type PlannedMeal,
  type Recipe,
} from "./types";
import { calculateVarietyScore } from "./variety";

const STORES: Store[] = [
  { id: "pyaterochka", name: "Пятёрочка", slug: "pyaterochka" },
  { id: "perekrestok", name: "Перекрёсток", slug: "perekrestok" },
  { id: "magnit", name: "Магнит", slug: "magnit" },
  { id: "dixy", name: "Дикси", slug: "dixy" },
];

const MEAL_SEQUENCE: Array<Recipe["meal_type"]> = ["breakfast", "lunch", "dinner"];

export class GreedyOptimizationEngine implements OptimizationEngine {
  optimize(input: OptimizationInput): OptimizationResult {
    const warnings: string[] = [];
    const peopleCount = Math.max(1, input.people.length);
    const mealsPerDay = Math.min(4, Math.max(2, input.constraints.mealsPerDay));
    const days = Math.max(1, input.days);

    const recipes = filterRecipes(input);
    if (recipes.length < 6) {
      warnings.push("Слишком мало подходящих рецептов. Ослабьте исключения или время готовки.");
    }

    const sessions = buildCookingSessions(days, input.constraints.maxCookingSessions);
    const usedInSession = new Map<number, string[]>();
    const selected: PlannedMeal[] = [];
    const selectedProductIds = new Set<string>();

    for (let dayIndex = 0; dayIndex < days; dayIndex += 1) {
      const session = sessions[dayIndex] ?? 0;
      const mealTypes = mealTypesForDay(mealsPerDay, input.constraints.snacks);

      for (const mealType of mealTypes) {
        const candidate = pickRecipe({
          recipes,
          mealType,
          session,
          usedInSession,
          selected,
          selectedProductIds,
          input,
          peopleCount,
        });

        if (!candidate) {
          warnings.push(`Не удалось подобрать блюдо: день ${dayIndex + 1}, ${mealType}`);
          continue;
        }

        const servings = peopleCount / candidate.servings;
        const ingredients = candidate.ingredients.map((ing) => ({
          product_id: ing.product_id,
          grams: Math.round(ing.grams * servings),
        }));

        selected.push({
          dayIndex,
          mealType,
          recipeId: candidate.id,
          recipeName: candidate.name,
          cookingSession: session,
          servings: peopleCount,
          ingredients,
          calories: round(candidate.calories * servings),
          protein: round(candidate.protein * servings),
          fat: round(candidate.fat * servings),
          carbs: round(candidate.carbs * servings),
          instructions: candidate.instructions,
        });

        const list = usedInSession.get(session) ?? [];
        if (!list.includes(candidate.id)) list.push(candidate.id);
        usedInSession.set(session, list);
        for (const ing of candidate.ingredients) selectedProductIds.add(ing.product_id);
      }
    }

    let cart = buildCart(selected, input);
    cart = limitStores(cart, input);

    let totalCost = roundMoney(cart.reduce((sum, line) => sum + line.price, 0));
    let cashback = roundMoney(cart.reduce((sum, line) => sum + line.cashback, 0));
    let effectiveCost = roundMoney(cart.reduce((sum, line) => sum + line.effectivePrice, 0));

    if (effectiveCost > input.budget) {
      const cheaper = tryCheaperMenu(selected, recipes, input, peopleCount, sessions);
      if (cheaper) {
        selected.splice(0, selected.length, ...cheaper);
        cart = limitStores(buildCart(selected, input), input);
        totalCost = roundMoney(cart.reduce((sum, line) => sum + line.price, 0));
        cashback = roundMoney(cart.reduce((sum, line) => sum + line.cashback, 0));
        effectiveCost = roundMoney(cart.reduce((sum, line) => sum + line.effectivePrice, 0));
      }
    }

    const nutrition = summarizeNutrition(selected, input, days);
    const leftoverValue = cart.reduce(
      (sum, line) => sum + (line.leftoverGrams / line.packageWeight) * line.effectivePrice,
      0,
    );
    const wasteScore = totalCost <= 0 ? 100 : Math.max(0, Math.round(100 - (leftoverValue / totalCost) * 100));
    const varietyScore = calculateVarietyScore(selected, input.recipes);

    const feasible =
      effectiveCost <= input.budget &&
      nutrition.caloriesPerDay >= input.calorieTargets * 0.85 &&
      nutrition.proteinPerDay >= input.macroTargets.protein * 0.9;

    if (effectiveCost > input.budget) {
      warnings.push("При текущих ограничениях бюджет недостаточен.");
      warnings.push("Попробуйте увеличить бюджет, изменить продукты, снизить требования или увеличить срок.");
    }
    if (nutrition.caloriesPerDay < input.calorieTargets * 0.85) {
      warnings.push("Калорийность получилась ниже цели. Добавьте перекус или увеличьте число приёмов пищи.");
    }

    return {
      menu: selected,
      cart,
      totalCost,
      cashback,
      effectiveCost,
      nutritionSummary: nutrition,
      varietyScore,
      wasteScore,
      cookingPlan: toCookingPlan(sessions, selected),
      feasible,
      warnings,
    };
  }
}

function mealTypesForDay(
  mealsPerDay: number,
  snacks: boolean,
): Array<Recipe["meal_type"]> {
  const types = MEAL_SEQUENCE.slice(0, Math.min(3, mealsPerDay));
  if (snacks || mealsPerDay >= 4) types.push("snack");
  return types;
}

function filterRecipes(input: OptimizationInput): Recipe[] {
  const excluded = new Set(input.constraints.excludedProductIds);
  const allergies = input.constraints.allergies.map((item) => item.toLowerCase());
  const diet = input.constraints.dietType;

  return input.recipes.filter((recipe) => {
    if (recipe.cooking_time > input.constraints.maxCookingTime) return false;
    if (recipe.ingredients.some((ing) => excluded.has(ing.product_id))) return false;
    if (allergies.length > 0) {
      const haystack = `${recipe.name} ${recipe.tags.join(" ")} ${recipe.protein_source}`.toLowerCase();
      if (allergies.some((allergy) => haystack.includes(allergy))) return false;
      const productNames = recipe.ingredients
        .map((ing) => input.products.find((p) => p.id === ing.product_id)?.canonical_name.toLowerCase() ?? "")
        .join(" ");
      if (allergies.some((allergy) => productNames.includes(allergy))) return false;
    }
    if (diet === "vegetarian" && ["chicken", "beef", "pork", "fish", "turkey"].includes(recipe.protein_source)) {
      return false;
    }
    return true;
  });
}

function pickRecipe(args: {
  recipes: Recipe[];
  mealType: Recipe["meal_type"];
  session: number;
  usedInSession: Map<number, string[]>;
  selected: PlannedMeal[];
  selectedProductIds: Set<string>;
  input: OptimizationInput;
  peopleCount: number;
}): Recipe | null {
  const { recipes, mealType, session, usedInSession, selected, selectedProductIds, input } = args;
  const pool = recipes.filter((recipe) => recipe.meal_type === mealType);
  if (pool.length === 0) return recipes[0] ?? null;

  const sessionRecipes = usedInSession.get(session) ?? [];
  const usedGlobal = selected.map((meal) => meal.recipeId);
  const variety = input.constraints.varietyPreference;
  const repetitionLimit = variety === "high" ? 1 : variety === "low" ? 4 : 2;

  let best: Recipe | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const recipe of pool) {
    const usedCount = usedGlobal.filter((id) => id === recipe.id).length;
    const sameMealTypeStreak = trailingSameRecipe(selected, recipe.id, mealType);
    if (sameMealTypeStreak >= repetitionLimit && variety !== "low") continue;

    const cost = recipeCost(recipe, input, args.peopleCount);
    const newProducts = recipe.ingredients.filter((ing) => !selectedProductIds.has(ing.product_id)).length;
    const reuseBonus = recipe.ingredients.filter((ing) => selectedProductIds.has(ing.product_id)).length * 25;
    const sessionBonus = sessionRecipes.includes(recipe.id) ? -40 : 0;
    const repetitionPenalty = usedCount * OPTIMIZER_WEIGHTS.repetition;
    const proteinGap = Math.max(0, input.macroTargets.protein - currentProteinPerDay(selected, input.days));
    const proteinBonus = recipe.protein > 25 && proteinGap > 10 ? -50 : 0;

    const score =
      cost * OPTIMIZER_WEIGHTS.cost +
      newProducts * OPTIMIZER_WEIGHTS.uniqueProducts +
      recipe.cooking_time * OPTIMIZER_WEIGHTS.cookingTime +
      repetitionPenalty +
      sessionBonus -
      reuseBonus +
      proteinBonus;

    if (score < bestScore) {
      bestScore = score;
      best = recipe;
    }
  }

  return best ?? pool[0] ?? null;
}

function trailingSameRecipe(
  selected: PlannedMeal[],
  recipeId: string,
  mealType: Recipe["meal_type"],
): number {
  const sameType = selected.filter((meal) => meal.mealType === mealType);
  let count = 0;
  for (let i = sameType.length - 1; i >= 0; i -= 1) {
    if (sameType[i].recipeId === recipeId) count += 1;
    else break;
  }
  return count;
}

function currentProteinPerDay(selected: PlannedMeal[], days: number): number {
  if (selected.length === 0) return 0;
  const coveredDays = new Set(selected.map((meal) => meal.dayIndex)).size || days;
  const protein = selected.reduce((sum, meal) => sum + meal.protein, 0);
  return protein / coveredDays;
}

function recipeCost(recipe: Recipe, input: OptimizationInput, peopleCount: number): number {
  const factor = peopleCount / recipe.servings;
  let cost = 0;
  for (const ing of recipe.ingredients) {
    const best = cheapestOffer(ing.product_id, input);
    if (!best) continue;
    const grams = ing.grams * factor;
    cost += (grams / best.package_weight) * effectivePrice(best.price, cashbackFor(best.store_id, input));
  }
  return cost;
}

function cheapestOffer(productId: string, input: OptimizationInput) {
  const preferred = new Set(input.constraints.preferredStoreIds);
  const offers = input.prices.filter((item) => item.canonical_product_id === productId && item.available);
  const scoped = preferred.size > 0 ? offers.filter((item) => preferred.has(item.store_id)) : offers;
  const pool = scoped.length > 0 ? scoped : offers;
  return pool
    .slice()
    .sort((a, b) => {
      const aEff = effectivePrice(a.price, cashbackFor(a.store_id, input)) / a.package_weight;
      const bEff = effectivePrice(b.price, cashbackFor(b.store_id, input)) / b.package_weight;
      return aEff - bEff;
    })[0];
}

function cashbackFor(storeId: string, input: OptimizationInput): number {
  return input.cashback.find((rule) => rule.store_id === storeId)?.percent ?? 0;
}

function buildCart(menu: PlannedMeal[], input: OptimizationInput): CartLine[] {
  const gramsByProduct = new Map<string, number>();
  for (const meal of menu) {
    for (const ing of meal.ingredients) {
      gramsByProduct.set(ing.product_id, (gramsByProduct.get(ing.product_id) ?? 0) + ing.grams);
    }
  }

  const lines: CartLine[] = [];
  for (const [productId, grams] of gramsByProduct) {
    const product = input.products.find((item) => item.id === productId);
    const offer = cheapestOffer(productId, input);
    if (!product || !offer) continue;
    const store = STORES.find((item) => item.id === offer.store_id);
    const percent = cashbackFor(offer.store_id, input);
    const count = packagesNeeded(grams, offer.package_weight);
    const bought = purchasedGrams(count, offer.package_weight);
    const price = count * offer.price;
    const cashback = cashbackAmount(price, percent);
    lines.push({
      productId,
      productName: product.canonical_name,
      storeId: offer.store_id,
      storeName: store?.name ?? offer.store_id,
      quantityGrams: grams,
      packageCount: count,
      packageWeight: offer.package_weight,
      price: roundMoney(price),
      cashbackPercent: percent,
      cashback: roundMoney(cashback),
      effectivePrice: effectivePrice(price, percent),
      leftoverGrams: leftoverGrams(grams, bought),
    });
  }

  return lines.sort((a, b) => a.storeName.localeCompare(b.storeName, "ru"));
}

function limitStores(cart: CartLine[], input: OptimizationInput): CartLine[] {
  const maxStores = Math.max(1, input.constraints.maxStores);
  const spend = new Map<string, number>();
  for (const line of cart) {
    spend.set(line.storeId, (spend.get(line.storeId) ?? 0) + line.effectivePrice);
  }
  const ranked = [...spend.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  const allowed = new Set(ranked.slice(0, maxStores));
  if (allowed.size === spend.size) return cart;

  const rebuiltInput: OptimizationInput = {
    ...input,
    constraints: {
      ...input.constraints,
      preferredStoreIds: [...allowed],
    },
  };
  const gramsByProduct = new Map(cart.map((line) => [line.productId, line.quantityGrams] as const));
  const fakeMenu: PlannedMeal[] = [
    {
      dayIndex: 0,
      mealType: "lunch",
      recipeId: "aggregate",
      recipeName: "aggregate",
      cookingSession: 0,
      servings: 1,
      ingredients: [...gramsByProduct.entries()].map(([product_id, grams]) => ({ product_id, grams })),
      calories: 0,
      protein: 0,
      fat: 0,
      carbs: 0,
      instructions: [],
    },
  ];
  return buildCart(fakeMenu, rebuiltInput);
}

function tryCheaperMenu(
  selected: PlannedMeal[],
  recipes: Recipe[],
  input: OptimizationInput,
  peopleCount: number,
  sessions: number[],
): PlannedMeal[] | null {
  const clone = selected.map((meal) => ({ ...meal, ingredients: meal.ingredients.map((ing) => ({ ...ing })) }));
  const expensive = [...clone].sort((a, b) => recipeCostById(b.recipeId, recipes, input, peopleCount) - recipeCostById(a.recipeId, recipes, input, peopleCount));
  for (const meal of expensive.slice(0, 6)) {
    const cheaper = recipes
      .filter((recipe) => recipe.meal_type === meal.mealType && recipe.id !== meal.recipeId)
      .sort((a, b) => recipeCost(a, input, peopleCount) - recipeCost(b, input, peopleCount))[0];
    if (!cheaper) continue;
    const servings = peopleCount / cheaper.servings;
    meal.recipeId = cheaper.id;
    meal.recipeName = cheaper.name;
    meal.instructions = cheaper.instructions;
    meal.ingredients = cheaper.ingredients.map((ing) => ({
      product_id: ing.product_id,
      grams: Math.round(ing.grams * servings),
    }));
    meal.calories = round(cheaper.calories * servings);
    meal.protein = round(cheaper.protein * servings);
    meal.fat = round(cheaper.fat * servings);
    meal.carbs = round(cheaper.carbs * servings);
    meal.cookingSession = sessions[meal.dayIndex] ?? 0;
  }
  const cart = buildCart(clone, input);
  const effective = cart.reduce((sum, line) => sum + line.effectivePrice, 0);
  if (effective < input.budget) return clone;
  return effective < buildCart(selected, input).reduce((sum, line) => sum + line.effectivePrice, 0) ? clone : null;
}

function recipeCostById(
  recipeId: string,
  recipes: Recipe[],
  input: OptimizationInput,
  peopleCount: number,
): number {
  const recipe = recipes.find((item) => item.id === recipeId);
  return recipe ? recipeCost(recipe, input, peopleCount) : 0;
}

function summarizeNutrition(
  menu: PlannedMeal[],
  input: OptimizationInput,
  days: number,
): OptimizationResult["nutritionSummary"] {
  const totals = sumNutrition(menu);
  return {
    caloriesPerDay: round(totals.calories / days),
    proteinPerDay: round(totals.protein / days),
    fatPerDay: round(totals.fat / days),
    carbsPerDay: round(totals.carbs / days),
    calorieTarget: input.calorieTargets,
    proteinTarget: input.macroTargets.protein,
    fatTarget: input.macroTargets.fat,
    carbsTarget: input.macroTargets.carbs,
  };
}

function buildCookingSessions(days: number, maxSessions: number): number[] {
  const sessions = Math.max(1, Math.min(days, maxSessions));
  const result: number[] = [];
  const chunk = Math.ceil(days / sessions);
  for (let day = 0; day < days; day += 1) {
    result.push(Math.min(sessions - 1, Math.floor(day / chunk)));
  }
  return result;
}

function toCookingPlan(sessions: number[], menu: PlannedMeal[]): CookingSession[] {
  const labels = ["Воскресенье", "Среда", "Пятница", "Суббота"];
  const unique = [...new Set(sessions)];
  return unique.map((index) => {
    const dayIndex = sessions.indexOf(index);
    const meals = menu.filter((meal) => meal.cookingSession === index);
    const recipeIds = [...new Set(meals.map((meal) => meal.recipeId))];
    return {
      index,
      dayIndex,
      label: labels[index] ?? `Готовка ${index + 1}`,
      recipeIds,
      recipeNames: recipeIds.map((id) => meals.find((meal) => meal.recipeId === id)?.recipeName ?? id),
    };
  });
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function nutritionFromCart(
  cart: CartLine[],
  products: OptimizationInput["products"],
) {
  return sumNutrition(
    cart.map((line) => {
      const product = products.find((item) => item.id === line.productId);
      if (!product) return { calories: 0, protein: 0, fat: 0, carbs: 0 };
      return macrosFromGrams({
        grams: line.quantityGrams,
        caloriesPer100g: product.calories_per_100g,
        proteinPer100g: product.protein_per_100g,
        fatPer100g: product.fat_per_100g,
        carbsPer100g: product.carbs_per_100g,
      });
    }),
  );
}

export function materializeFromMenu(
  menu: PlannedMeal[],
  input: OptimizationInput,
): OptimizationResult {
  const days = Math.max(1, input.days);
  const cart = limitStores(buildCart(menu, input), input);
  const totalCost = roundMoney(cart.reduce((sum, line) => sum + line.price, 0));
  const cashback = roundMoney(cart.reduce((sum, line) => sum + line.cashback, 0));
  const effectiveCost = roundMoney(cart.reduce((sum, line) => sum + line.effectivePrice, 0));
  const leftoverValue = cart.reduce(
    (sum, line) => sum + (line.leftoverGrams / line.packageWeight) * line.effectivePrice,
    0,
  );
  const nutrition = summarizeNutrition(menu, input, days);
  return {
    menu,
    cart,
    totalCost,
    cashback,
    effectiveCost,
    nutritionSummary: nutrition,
    varietyScore: calculateVarietyScore(menu, input.recipes),
    wasteScore: totalCost <= 0 ? 100 : Math.max(0, Math.round(100 - (leftoverValue / totalCost) * 100)),
    cookingPlan: toCookingPlan(
      Array.from({ length: days }, (_, day) => menu.find((meal) => meal.dayIndex === day)?.cookingSession ?? 0),
      menu,
    ),
    feasible: effectiveCost <= input.budget && nutrition.proteinPerDay >= input.macroTargets.protein * 0.85,
    warnings: effectiveCost > input.budget ? ["После замены стоимость превышает бюджет."] : [],
  };
}

export { STORES };
