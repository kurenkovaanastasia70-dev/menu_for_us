import { packagesNeeded } from "@/lib/money/cashback";
import { materializeFromMenu, type OptimizationInput, type PlannedMeal, type Product } from "@/lib/optimizer";
import { nutritionFromIngredients, scalePlannedMeal } from "@/lib/optimizer/meals";

/** Дешёвые замены дорогих продуктов той же роли (каталог Магнит-стиль). */
const CHEAP_SWAPS: Record<string, string[]> = {
  salmon: ["pink_salmon", "trout", "pollock", "hake", "cod"],
  trout: ["pink_salmon", "pollock", "hake", "cod"],
  shrimp: ["pollock", "hake", "squid", "tuna_can"],
  beef: ["chicken_breast", "turkey_fillet", "ground_chicken", "chicken_thigh"],
  ground_beef: ["ground_chicken", "ground_turkey", "pork_mince"],
  lamb: ["chicken_thigh", "pork_chop", "beef_stew_cut"],
  olive_oil: ["sunflower_oil", "rapeseed_oil"],
  olive_oil_extra: ["sunflower_oil", "olive_oil", "rapeseed_oil"],
  quinoa: ["buckwheat", "bulgur", "rice", "rice_round"],
  avocado: ["cucumber", "tomato"],
  avocado_ready: ["cucumber", "tomato"],
  mozzarella: ["cheese_russian", "cheese", "feta"],
  cheese: ["cheese_russian", "cottage_cheese"],
  nuts: ["peanuts", "sunflower_seeds", "seeds"],
  almonds: ["peanuts", "sunflower_seeds"],
  cashew: ["peanuts", "sunflower_seeds"],
  berries: ["apple", "banana", "strawberry_frozen"],
  asparagus: ["broccoli", "green_beans", "zucchini"],
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
        if (price < bestPrice * 0.85) {
          bestPrice = price;
          bestId = alt;
        }
      }
      return bestId === ing.product_id ? ing : { ...ing, product_id: bestId };
    });
    return rebuildMeal(meal, ingredients, input.products);
  });
}

/** Обрезает граммы до границы упаковки, если лишняя пачка почти пустая. */
function trimPackageSpill(menu: PlannedMeal[], input: OptimizationInput): PlannedMeal[] {
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
    if (spill > 0 && spill <= pack * 0.25) {
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
  for (let step = 0; step < 8; step += 1) {
    const result = materializeFromMenu(current, input);
    if (result.effectiveCost <= budget) return current;
    const costly = [...result.cart]
      .filter((line) => line.toBuyGrams > 0 && line.effectivePrice > 0)
      .sort((a, b) => b.effectivePrice / Math.max(1, b.toBuyGrams) - a.effectivePrice / Math.max(1, a.toBuyGrams));
    const target = costly[0];
    if (!target) break;
    current = current.map((meal) => {
      if (meal.eatingOut) return meal;
      const ingredients = meal.ingredients.map((ing) => {
        if (ing.product_id !== target.productId) return ing;
        // Ужимаем только дорогой продукт, не всю тарелку.
        return { ...ing, grams: Math.max(20, Math.round(ing.grams * 0.85)) };
      });
      return rebuildMeal(meal, ingredients, input.products);
    });
  }
  return current;
}

/**
 * Подгонка под бюджет с учётом упаковок:
 * 1) замена дорогих продуктов на более дешёвые аналоги
 * 2) обрезка «хвоста» лишней пачки
 * 3) точечное уменьшение самых дорогих позиций
 * 4) лёгкое общее сжатие — только запасной вариант
 */
export function fitMenuToBudget(menu: PlannedMeal[], input: OptimizationInput): PlannedMeal[] {
  if (cartCost(menu, input) <= input.budget) return menu;

  let current = swapExpensiveProducts(menu, input);
  if (cartCost(current, input) <= input.budget) return current;

  current = trimPackageSpill(current, input);
  if (cartCost(current, input) <= input.budget) return current;

  current = reduceCostliestIngredients(current, input, input.budget);
  if (cartCost(current, input) <= input.budget) return current;

  const cost = cartCost(current, input);
  if (cost <= 0) return current;
  const factor = Math.min(0.95, Math.max(0.8, input.budget / cost));
  return current.map((meal) => (meal.eatingOut ? meal : scalePlannedMeal(meal, factor, input.products)));
}
