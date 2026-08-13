import type { LLMMenu } from "@/lib/llm/schema";
import type { RecipeGuide } from "@/lib/llm/recipe-guide";
import { materializeFromMenu, type OptimizationInput, type PlannedMeal } from "@/lib/optimizer";
import {
  attachSideSalad,
  attachSnackFruit,
  isEatingOutSlot,
  isSideSalad,
  leftoverFromDinner,
  nutritionFromIngredients,
  pickSnackFruit,
  scalePlannedMeal,
} from "@/lib/optimizer/meals";

const MEAL_TYPES: Array<PlannedMeal["mealType"]> = ["breakfast", "lunch", "dinner", "snack"];

export function mealsFromLlmMenu(
  llmMenu: LLMMenu,
  input: OptimizationInput,
  guides: RecipeGuide[],
): PlannedMeal[] {
  const peopleCount = Math.max(1, input.people.length);
  const productIds = new Set(input.products.map((item) => item.id));
  const guideById = new Map(guides.map((guide) => [guide.recipe_id, guide]));
  const menu: PlannedMeal[] = [];

  for (const day of llmMenu.days) {
    const dayIndex = day.day - 1;
    if (dayIndex < 0 || dayIndex >= input.days) continue;
    for (const raw of day.meals) {
      const mealType = (raw.meal_type ?? inferMealType(day.meals.indexOf(raw))) as PlannedMeal["mealType"];
      if (!MEAL_TYPES.includes(mealType)) continue;
      const eatingOut = isEatingOutSlot(input.constraints, dayIndex, mealType);

      if (mealType === "lunch" && (raw.leftover || (input.constraints.quickLunches && dayIndex % 2 === 1))) {
        const prev = menu.find((item) => item.dayIndex === dayIndex - 1 && item.mealType === "dinner" && !item.eatingOut);
        if (prev) {
          menu.push(leftoverFromDinner(prev, dayIndex, eatingOut));
          continue;
        }
      }

      const ingredients = (raw.ingredients ?? [])
        .filter((ing) => productIds.has(ing.product_id) && ing.grams > 0)
        .map((ing) => ({ product_id: ing.product_id, grams: Math.round(ing.grams) }));
      if (ingredients.length === 0) continue;

      const nutrition = nutritionFromIngredients(ingredients, input.products);
      const recipeId = raw.recipe_id || `llm_${dayIndex}_${mealType}`;
      const guide =
        guideById.get(recipeId) ??
        (raw.steps && raw.steps.length >= 3
          ? {
              recipe_id: recipeId,
              title: raw.name,
              subtitle: mealType === "dinner" ? "Горячее, оценка КБЖУ от модели" : "Рецепт модели",
              time_minutes: Math.max(5, raw.steps.reduce((sum, step) => sum + (step.minutes ?? 5), 0)),
              servings: peopleCount,
              steps: raw.steps.map((step, index) => ({
                order: step.order || index + 1,
                title: step.title,
                text: step.text,
                minutes: step.minutes,
              })),
              tips: [],
              plating: "",
            }
          : undefined);

      let meal: PlannedMeal = {
        dayIndex,
        mealType,
        recipeId,
        recipeName: raw.name,
        cookingSession: Math.floor(dayIndex / 3),
        servings: peopleCount,
        ingredients,
        calories: nutrition.calories,
        protein: nutrition.protein,
        fat: nutrition.fat,
        carbs: nutrition.carbs,
        fiber: nutrition.fiber,
        iron: nutrition.iron,
        instructions: (raw.steps ?? []).map((step) => step.text).filter(Boolean),
        eatingOut,
        llmEstimate:
          raw.calories || raw.protein
            ? {
                calories: raw.calories ?? nutrition.calories,
                protein: raw.protein ?? nutrition.protein,
                fat: raw.fat ?? nutrition.fat,
                carbs: raw.carbs ?? nutrition.carbs,
              }
            : undefined,
        guide,
      };

      if (mealType === "dinner") {
        const salad = input.recipes.find((item) => isSideSalad(item));
        if (salad) meal = attachSideSalad(meal, salad, peopleCount);
      }
      if (mealType === "snack") {
        const fruit = pickSnackFruit(input.products, menu);
        if (fruit) meal = attachSnackFruit(meal, fruit, peopleCount);
      }
      menu.push(meal);
    }
  }
  return menu;
}

export function scaleMenuToMacroTargets(menu: PlannedMeal[], input: OptimizationInput): PlannedMeal[] {
  const home = menu.filter((meal) => !meal.eatingOut);
  if (home.length === 0) return menu;
  const days = Math.max(1, input.days);
  const calories = home.reduce((sum, meal) => sum + meal.calories, 0) / days;
  if (calories <= 0) return menu;
  const factor = clamp(input.calorieTargets / calories, 0.8, 1.3);
  if (Math.abs(factor - 1) < 0.05) return menu;
  return menu.map((meal) => (meal.eatingOut ? meal : scalePlannedMeal(meal, factor, input.products)));
}

export function fitMenuToBudget(menu: PlannedMeal[], input: OptimizationInput): PlannedMeal[] {
  const first = materializeFromMenu(menu, input);
  if (first.effectiveCost <= input.budget || first.effectiveCost <= 0) return menu;
  const factor = clamp(input.budget / first.effectiveCost, 0.7, 0.95);
  return menu.map((meal) => (meal.eatingOut ? meal : scalePlannedMeal(meal, factor, input.products)));
}

export function fillMissingSlots(llmMenu: PlannedMeal[], fallback: PlannedMeal[]): PlannedMeal[] {
  if (llmMenu.length === 0) return fallback;
  const have = new Set(llmMenu.map((meal) => `${meal.dayIndex}:${meal.mealType}`));
  const extra = fallback.filter((meal) => !have.has(`${meal.dayIndex}:${meal.mealType}`));
  return [...llmMenu, ...extra].sort((a, b) => a.dayIndex - b.dayIndex || MEAL_TYPES.indexOf(a.mealType) - MEAL_TYPES.indexOf(b.mealType));
}

function inferMealType(index: number): PlannedMeal["mealType"] {
  return MEAL_TYPES[index] ?? "lunch";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
