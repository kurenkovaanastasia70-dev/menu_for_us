import type { PlannedMeal, Recipe } from "./types";

export function calculateVarietyScore(menu: PlannedMeal[], recipes: Recipe[]): number {
  if (menu.length === 0) return 0;

  const uniqueMeals = new Set(menu.map((meal) => meal.recipeId)).size;
  const mealScore = uniqueMeals / menu.length;

  const sources = new Set(
    menu.map((meal) => recipes.find((recipe) => recipe.id === meal.recipeId)?.protein_source ?? meal.recipeId),
  );
  const sourceScore = Math.min(1, sources.size / 4);

  const cuisines = new Set(
    menu.map((meal) => recipes.find((recipe) => recipe.id === meal.recipeId)?.cuisine ?? "other"),
  );
  const cuisineScore = Math.min(1, cuisines.size / 4);

  const vegetableMeals = menu.filter((meal) => {
    const recipe = recipes.find((item) => item.id === meal.recipeId);
    return recipe?.tags.includes("vegetables") || recipe?.tags.includes("salad");
  }).length;
  const vegScore = Math.min(1, vegetableMeals / Math.max(3, menu.length * 0.3));

  const maxStreak = longestRepeatStreak(menu);
  const repetitionScore = maxStreak >= 3 ? 0 : maxStreak === 2 ? 0.6 : 1;

  return Math.round(
    (mealScore * 40 + sourceScore * 15 + cuisineScore * 15 + vegScore * 15 + repetitionScore * 15) * 10,
  ) / 10;
}

function longestRepeatStreak(menu: PlannedMeal[]): number {
  let longest = 1;
  let current = 1;
  for (let i = 1; i < menu.length; i += 1) {
    if (menu[i].recipeId === menu[i - 1].recipeId && menu[i].mealType === menu[i - 1].mealType) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 1;
    }
  }
  return menu.length === 0 ? 0 : longest;
}
