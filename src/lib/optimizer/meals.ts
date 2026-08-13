import type { OptimizationConstraints, PlannedMeal, Recipe, RecipeGuide, SideSalad } from "./types";

const MEAT_SOURCES = new Set(["chicken", "beef", "pork", "turkey", "fish"]);

export function slotKey(dayIndex: number, mealType: string): string {
  return `${dayIndex}:${mealType}`;
}

export function isEatingOutSlot(
  constraints: OptimizationConstraints,
  dayIndex: number,
  mealType: Recipe["meal_type"],
): boolean {
  return (constraints.eatingOutSlots ?? []).some(
    (slot) => slot.dayIndex === dayIndex && slot.mealType === mealType,
  );
}

export function isSideSalad(recipe: Recipe): boolean {
  return recipe.tags.includes("salad") && recipe.tags.includes("side");
}

export function isHotDinnerMain(recipe: Recipe, vegetarian: boolean): boolean {
  if (isSideSalad(recipe) || recipe.meal_type !== "dinner") return false;
  if (vegetarian) return !MEAT_SOURCES.has(recipe.protein_source);
  return MEAT_SOURCES.has(recipe.protein_source);
}

export function scaleIngredients(recipe: Recipe, peopleCount: number) {
  const servings = peopleCount / Math.max(1, recipe.servings);
  return {
    servings: peopleCount,
    factor: servings,
    ingredients: recipe.ingredients.map((ing) => ({
      product_id: ing.product_id,
      grams: Math.round(ing.grams * servings),
    })),
    calories: round1(recipe.calories * servings),
    protein: round1(recipe.protein * servings),
    fat: round1(recipe.fat * servings),
    carbs: round1(recipe.carbs * servings),
    fiber: round1((recipe.fiber ?? 0) * servings),
    iron: round1((recipe.iron ?? 0) * servings),
  };
}

export function plannedMealFromRecipe(
  recipe: Recipe,
  meal: Pick<PlannedMeal, "dayIndex" | "mealType" | "cookingSession" | "eatingOut">,
  peopleCount: number,
): PlannedMeal {
  const scaled = scaleIngredients(recipe, peopleCount);
  return {
    dayIndex: meal.dayIndex,
    mealType: meal.mealType,
    recipeId: recipe.id,
    recipeName: recipe.name,
    cookingSession: meal.cookingSession,
    servings: scaled.servings,
    ingredients: scaled.ingredients,
    calories: scaled.calories,
    protein: scaled.protein,
    fat: scaled.fat,
    carbs: scaled.carbs,
    fiber: scaled.fiber,
    iron: scaled.iron,
    instructions: [...recipe.instructions],
    eatingOut: meal.eatingOut,
  };
}

export function attachSideSalad(meal: PlannedMeal, salad: Recipe, peopleCount: number): PlannedMeal {
  const scaled = scaleIngredients(salad, peopleCount);
  const sideSalad: SideSalad = {
    recipeId: salad.id,
    name: salad.name,
    ingredients: scaled.ingredients,
    instructions: [...salad.instructions],
  };
  return {
    ...meal,
    recipeName: `${meal.recipeName} + ${salad.name}`,
    sideSalad,
    ingredients: [...meal.ingredients, ...scaled.ingredients],
    calories: round1(meal.calories + scaled.calories),
    protein: round1(meal.protein + scaled.protein),
    fat: round1(meal.fat + scaled.fat),
    carbs: round1(meal.carbs + scaled.carbs),
    fiber: round1(meal.fiber + scaled.fiber),
    iron: round1(meal.iron + scaled.iron),
    instructions: [...meal.instructions, `Салат «${salad.name}»:`, ...salad.instructions],
  };
}

export function fallbackGuide(recipe: Recipe, meal: PlannedMeal): RecipeGuide {
  const steps = (recipe.instructions.length ? recipe.instructions : ["Приготовьте блюдо по составу продуктов."]).map(
    (text, index) => ({
      order: index + 1,
      title: `Шаг ${index + 1}`,
      text,
      minutes: Math.max(2, Math.round(recipe.cooking_time / Math.max(recipe.instructions.length, 1))),
    }),
  );
  while (steps.length < 3) {
    steps.push({
      order: steps.length + 1,
      title: "Подача",
      text: "Посолите по вкусу и подавайте сразу.",
      minutes: 2,
    });
  }
  if (meal.sideSalad) {
    steps.push({
      order: steps.length + 1,
      title: "Салат",
      text: meal.sideSalad.instructions.join(" "),
      minutes: 8,
    });
  }
  return {
    recipe_id: recipe.id,
    title: meal.recipeName || recipe.name,
    subtitle: meal.mealType === "dinner" ? "Горячее + свежий салат" : "Пошаговый гид",
    time_minutes: recipe.cooking_time + (meal.sideSalad ? 10 : 0),
    servings: meal.servings,
    steps,
    tips: meal.sideSalad
      ? [`Салат «${meal.sideSalad.name}» соберите перед подачей, чтобы зелень не дала сок.`]
      : ["Не пережаривайте белок — сочность важнее корочки."],
    plating: meal.sideSalad
      ? `Горячее сбоку, салат «${meal.sideSalad.name}» отдельной горкой.`
      : "Подавайте сразу, пока горячее.",
  };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
