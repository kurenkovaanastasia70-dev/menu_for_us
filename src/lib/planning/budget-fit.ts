import { packagesNeeded } from "@/lib/money/cashback";
import { materializeFromMenu, type OptimizationInput, type PlannedMeal, type Product } from "@/lib/optimizer";
import { nutritionFromIngredients, scalePlannedMeal } from "@/lib/optimizer/meals";

/** Дешёвые замены дорогих продуктов той же роли. */
const CHEAP_SWAPS: Record<string, string[]> = {
  salmon: ["pink_salmon", "pollock", "hake", "cod", "tuna_can"],
  trout: ["pink_salmon", "pollock", "hake", "cod"],
  shrimp: ["pollock", "hake", "squid", "tuna_can"],
  beef: ["chicken_breast", "turkey_fillet", "ground_chicken", "chicken_thigh"],
  beef_stew_cut: ["chicken_thigh", "ground_chicken", "pork_mince"],
  ground_beef: ["ground_chicken", "ground_turkey", "pork_mince"],
  beef_mince_lean: ["ground_chicken", "pork_mince"],
  lamb: ["chicken_thigh", "pork_chop", "pork_mince"],
  pork_tenderloin: ["chicken_breast", "pork_mince", "chicken_thigh"],
  pork_chop: ["chicken_thigh", "pork_mince"],
  turkey_fillet: ["chicken_breast", "ground_chicken"],
  turkey_steak: ["chicken_breast", "turkey_fillet"],
  olive_oil: ["sunflower_oil", "rapeseed_oil"],
  olive_oil_extra: ["sunflower_oil", "olive_oil", "rapeseed_oil"],
  butter: ["sunflower_oil", "spread_butter"],
  butter_82: ["sunflower_oil", "spread_butter"],
  quinoa: ["buckwheat", "bulgur", "rice", "rice_round"],
  avocado: ["cucumber", "tomato"],
  avocado_ready: ["cucumber", "tomato"],
  mozzarella: ["cheese_russian", "cheese", "feta"],
  cheese: ["cheese_russian", "cottage_cheese"],
  cheese_gouda: ["cheese_russian", "cheese"],
  ricotta: ["cottage_cheese", "cottage_0"],
  coconut_milk: ["milk", "milk_1_5"],
  milk_lactose_free: ["milk", "milk_1_5"],
  milk_3_2: ["milk", "milk_1_5"],
  nuts: ["peanuts", "sunflower_seeds", "seeds"],
  almonds: ["peanuts", "sunflower_seeds"],
  cashew: ["peanuts", "sunflower_seeds"],
  berries: ["apple", "banana", "strawberry_frozen"],
  blueberry_frozen: ["apple", "banana"],
  asparagus: ["broccoli", "green_beans", "zucchini"],
  mix_salad: ["cabbage", "cucumber", "tomato"],
  arugula: ["lettuce", "cabbage"],
  salmon_steak: ["pollock", "hake"],
};

function cheapestUnitPrice(productId: string, input: OptimizationInput): number {
  const preferred = new Set(input.constraints.preferredStoreIds);
  const offers = input.prices.filter((item) => item.canonical_product_id === productId && item.available);
  const scoped = preferred.size > 0 ? offers.filter((item) => preferred.has(item.store_id)) : offers;
  const pool = scoped.length > 0 ? scoped : offers;
  if (pool.length === 0) return Number.POSITIVE_INFINITY;
  return Math.min(...pool.map((item) => item.price / Math.max(1, item.package_weight)));
}

function packageWeight(productId: string, input: OptimizationInput): number {
  const product = input.products.find((item) => item.id === productId);
  const offer = input.prices.find((item) => item.canonical_product_id === productId);
  return offer?.package_weight || product?.package_weight || 0;
}

function cartCost(menu: PlannedMeal[], input: OptimizationInput): number {
  return materializeFromMenu(menu, input).effectiveCost;
}

function rebuildMeal(meal: PlannedMeal, ingredients: PlannedMeal["ingredients"], products: Product[]): PlannedMeal {
  const nutrition = nutritionFromIngredients(ingredients, products);
  return {
    ...meal,
    ingredients,
    fullIngredients: ingredients.map((ing) => ({ ...ing })),
    calories: nutrition.calories,
    protein: nutrition.protein,
    fat: nutrition.fat,
    carbs: nutrition.carbs,
    fiber: nutrition.fiber,
    iron: nutrition.iron,
  };
}

function swapExpensiveProducts(menu: PlannedMeal[], input: OptimizationInput): PlannedMeal[] {
  const ids = new Set(input.products.map((item) => item.id));
  return menu.map((meal) => {
    if (meal.eatingOut) return meal;
    const ingredients = meal.ingredients.map((ing) => {
      const options = CHEAP_SWAPS[ing.product_id];
      if (!options) return ing;
      const current = cheapestUnitPrice(ing.product_id, input);
      let bestId = ing.product_id;
      let bestPrice = current;
      for (const alt of options) {
        if (!ids.has(alt)) continue;
        const price = cheapestUnitPrice(alt, input);
        if (price < bestPrice * 0.9) {
          bestPrice = price;
          bestId = alt;
        }
      }
      return bestId === ing.product_id ? ing : { ...ing, product_id: bestId };
    });
    return rebuildMeal(meal, ingredients, input.products);
  });
}

/** Обрезает граммы до границы упаковки, если хвост пачки слишком большой. */
function trimPackageSpill(menu: PlannedMeal[], input: OptimizationInput, spillRatio = 0.35): PlannedMeal[] {
  const totals = new Map<string, number>();
  for (const meal of menu) {
    if (meal.eatingOut) continue;
    for (const ing of meal.ingredients) {
      totals.set(ing.product_id, (totals.get(ing.product_id) ?? 0) + ing.grams);
    }
  }

  const targets = new Map<string, number>();
  for (const [productId, grams] of totals) {
    const pack = packageWeight(productId, input);
    if (pack <= 0) continue;
    const packs = packagesNeeded(grams, pack);
    if (packs <= 1) continue;
    const prevCap = (packs - 1) * pack;
    const spill = grams - prevCap;
    if (spill > 0 && spill <= pack * spillRatio) {
      targets.set(productId, prevCap);
    }
  }
  if (targets.size === 0) return menu;

  return menu.map((meal) => {
    if (meal.eatingOut) return meal;
    const ingredients = meal.ingredients.map((ing) => {
      const target = targets.get(ing.product_id);
      const total = totals.get(ing.product_id) ?? 0;
      if (target == null || total <= 0) return ing;
      return { ...ing, grams: Math.max(10, Math.round((ing.grams / total) * target)) };
    });
    return rebuildMeal(meal, ingredients, input.products);
  });
}

function reduceCostliestIngredients(menu: PlannedMeal[], input: OptimizationInput, budget: number): PlannedMeal[] {
  let current = menu;
  for (let step = 0; step < 16; step += 1) {
    const result = materializeFromMenu(current, input);
    if (result.effectiveCost <= budget) return current;
    const costly = [...result.cart]
      .filter((line) => line.toBuyGrams > 0 && line.effectivePrice > 0)
      .sort((a, b) => b.effectivePrice - a.effectivePrice);
    const target = costly[0];
    if (!target) break;
    const cut = result.effectiveCost > budget * 1.35 ? 0.7 : 0.82;
    current = current.map((meal) => {
      if (meal.eatingOut) return meal;
      const ingredients = meal.ingredients.map((ing) => {
        if (ing.product_id !== target.productId) return ing;
        return { ...ing, grams: Math.max(15, Math.round(ing.grams * cut)) };
      });
      return rebuildMeal(meal, ingredients, input.products);
    });
  }
  return current;
}

function stripOptionalExtras(menu: PlannedMeal[], input: OptimizationInput): PlannedMeal[] {
  return menu.map((meal) => {
    if (meal.eatingOut) return meal;
    let ingredients = meal.ingredients;
    if (meal.sideFruit) {
      ingredients = ingredients.filter((ing) => ing.product_id !== meal.sideFruit?.productId);
    }
    // ужимаем масла/орехи
    ingredients = ingredients.map((ing) => {
      if (["olive_oil", "olive_oil_extra", "butter", "butter_82", "nuts", "almonds", "cashew"].includes(ing.product_id)) {
        return { ...ing, grams: Math.max(5, Math.round(ing.grams * 0.5)) };
      }
      return ing;
    });
    const next = rebuildMeal(
      {
        ...meal,
        sideFruit: undefined,
        recipeName: meal.sideFruit ? meal.recipeName.replace(` + ${meal.sideFruit.name}`, "") : meal.recipeName,
      },
      ingredients,
      input.products,
    );
    return next;
  });
}

function forceScaleToBudget(menu: PlannedMeal[], input: OptimizationInput): PlannedMeal[] {
  let current = menu;
  for (let step = 0; step < 10; step += 1) {
    const cost = cartCost(current, input);
    if (cost <= input.budget) return current;
    if (cost <= 0) return current;
    const factor = Math.max(0.55, Math.min(0.92, (input.budget / cost) * 0.98));
    current = current.map((meal) => (meal.eatingOut ? meal : scalePlannedMeal(meal, factor, input.products)));
  }
  return current;
}

/**
 * Подгонка под бюджет с учётом упаковок.
 * Цель: уложиться в budget (или максимально близко), а не «чуть урезать».
 */
export function fitMenuToBudget(menu: PlannedMeal[], input: OptimizationInput): PlannedMeal[] {
  if (cartCost(menu, input) <= input.budget) return menu;

  let current = swapExpensiveProducts(menu, input);
  if (cartCost(current, input) <= input.budget) return current;

  current = trimPackageSpill(current, input, 0.4);
  if (cartCost(current, input) <= input.budget) return current;

  current = stripOptionalExtras(current, input);
  if (cartCost(current, input) <= input.budget) return current;

  current = swapExpensiveProducts(current, input);
  if (cartCost(current, input) <= input.budget) return current;

  current = reduceCostliestIngredients(current, input, input.budget);
  if (cartCost(current, input) <= input.budget) return current;

  current = trimPackageSpill(current, input, 0.5);
  if (cartCost(current, input) <= input.budget) return current;

  return forceScaleToBudget(current, input);
}
