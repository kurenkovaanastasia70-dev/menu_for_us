import { catalog } from "@/lib/catalog/repository";
import { materializeFromMenu, type OptimizationInput, type OptimizationResult, type PlannedMeal, type Recipe } from "@/lib/optimizer";
import { recipeUsesCart } from "./recipe-score";

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
      recipe.cooking_time <= input.constraints.maxCookingTime,
  );

  const scored = candidates.map((recipe) => {
    const nextMenu = result.menu.map((item) =>
      item === meal ? mealFromRecipe(recipe, item, input.people.length) : item,
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

export function replaceMeal(
  result: OptimizationResult,
  meal: PlannedMeal,
  recipe: Recipe,
  input: OptimizationInput,
): OptimizationResult {
  const nextMenu = result.menu.map((item) =>
    item.dayIndex === meal.dayIndex && item.mealType === meal.mealType
      ? mealFromRecipe(recipe, item, input.people.length)
      : item,
  );
  return materializeFromMenu(nextMenu, input);
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
        };
      },
      { calories: 0, protein: 0, fat: 0, carbs: 0 },
    );
    return {
      ...meal,
      calories: Math.round(nutrition.calories * 10) / 10,
      protein: Math.round(nutrition.protein * 10) / 10,
      fat: Math.round(nutrition.fat * 10) / 10,
      carbs: Math.round(nutrition.carbs * 10) / 10,
    };
  });
  return materializeFromMenu(recalculated, input);
}

function mealFromRecipe(recipe: Recipe, meal: PlannedMeal, peopleCount: number): PlannedMeal {
  const servings = peopleCount / recipe.servings;
  return {
    ...meal,
    recipeId: recipe.id,
    recipeName: recipe.name,
    instructions: recipe.instructions,
    servings: peopleCount,
    ingredients: recipe.ingredients.map((ing) => ({
      product_id: ing.product_id,
      grams: Math.round(ing.grams * servings),
    })),
    calories: Math.round(recipe.calories * servings * 10) / 10,
    protein: Math.round(recipe.protein * servings * 10) / 10,
    fat: Math.round(recipe.fat * servings * 10) / 10,
    carbs: Math.round(recipe.carbs * servings * 10) / 10,
  };
}
