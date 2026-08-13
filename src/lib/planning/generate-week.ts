import { catalog } from "@/lib/catalog/repository";
import { FallbackLLMProvider, requestWorker } from "@/lib/llm/client";
import { parseGuides } from "@/lib/llm/recipe-guide";
import type { WorkerGenerateResponse } from "@/lib/llm/schema";
import {
  GreedyOptimizationEngine,
  materializeFromMenu,
  type OptimizationInput,
  type OptimizationResult,
  type PlannedMeal,
} from "@/lib/optimizer";
import {
  attachSideSalad,
  attachSnackFruit,
  fallbackGuide,
  isHotDinnerMain,
  isQuickLunch,
  isSideSalad,
  leftoverFromDinner,
  pickSnackFruit,
  plannedMealFromRecipe,
} from "@/lib/optimizer/meals";
import { buildTrainingPlans, type TrainingPerson } from "@/lib/training/plan";
import { validateMenuNutrition } from "./validate-menu";

export interface GenerateWeekParams {
  people: OptimizationInput["people"];
  days: number;
  budget: number;
  constraints: OptimizationInput["constraints"];
  cashback: OptimizationInput["cashback"];
  fridge?: OptimizationInput["fridge"];
  useLlm: boolean;
  trainingPeople?: TrainingPerson[];
}

export async function generateWeek(params: GenerateWeekParams): Promise<OptimizationResult> {
  const engine = new GreedyOptimizationEngine();
  const input: OptimizationInput = {
    people: params.people,
    days: params.days,
    calorieTargets: params.people.reduce((sum, person) => sum + person.calorieTarget, 0),
    macroTargets: {
      protein: params.people.reduce((sum, person) => sum + person.proteinTarget, 0),
      fat: params.people.reduce((sum, person) => sum + person.fatTarget, 0),
      carbs: params.people.reduce((sum, person) => sum + person.carbsTarget, 0),
      fiber: params.people.reduce((sum, person) => sum + person.fiberTarget, 0),
      iron: params.people.reduce((sum, person) => sum + person.ironTarget, 0),
    },
    budget: params.budget,
    products: catalog.getProducts(),
    prices: catalog.getStoreProducts(),
    recipes: catalog.getRecipes(),
    cashback: params.cashback,
    fridge: params.fridge ?? [],
    constraints: { ...params.constraints, snacks: true },
  };

  const result = engine.optimize(input);
  const withTraining: OptimizationResult = {
    ...result,
    trainingPlans: buildTrainingPlans(params.trainingPeople ?? [], params.days),
  };
  const validated = validateMenuNutrition(withTraining, input);

  if (!params.useLlm) return validated;

  const compactRecipes = catalog.getRecipes().map((recipe) => ({
    id: recipe.id,
    name: recipe.name,
    meal_type: recipe.meal_type,
    cooking_time: recipe.cooking_time,
    protein_source: recipe.protein_source,
    tags: recipe.tags,
  }));

  const worker = await requestWorker<WorkerGenerateResponse>("/api/generate-menu", {
    days: params.days,
    peopleCount: params.people.length,
    calorieTarget: input.calorieTargets,
    proteinTarget: input.macroTargets.protein,
    quickLunches: Boolean(params.constraints.quickLunches),
    dietType: params.constraints.dietType,
    eatingOutSlots: params.constraints.eatingOutSlots ?? [],
    recipes: compactRecipes,
    compose: true,
  });

  if (!worker.ok || !worker.data.menu) {
    validated.warnings.push(
      "Меню собрано из каталога: языковая модель недоступна. Гиды — из рецептов. Нужен ключ Gemini в воркере.",
    );
    return validated;
  }

  const composed = applyLlmComposedMenu(validated, worker.data, input);
  return validateMenuNutrition(composed, input);
}

function applyLlmComposedMenu(
  baseline: OptimizationResult,
  llm: WorkerGenerateResponse,
  input: OptimizationInput,
): OptimizationResult {
  const recipes = input.recipes;
  const peopleCount = Math.max(1, input.people.length);
  const vegetarian = input.constraints.dietType === "vegetarian";
  const guides = parseGuides(llm.guides ? { guides: llm.guides } : llm);
  const guideById = new Map(guides.map((guide) => [guide.recipe_id, guide]));

  const llmBySlot = new Map<string, { recipe_id: string; name?: string; leftover?: boolean; meal_type?: string }>();
  if (llm.menu) {
    for (const day of llm.menu.days) {
      for (const meal of day.meals) {
        const mealType = meal.meal_type ?? inferMealType(day.meals.indexOf(meal));
        llmBySlot.set(`${day.day - 1}:${mealType}`, {
          recipe_id: meal.recipe_id,
          name: meal.name,
          leftover: meal.leftover,
          meal_type: mealType,
        });
      }
    }
  }

  const nextMenu: PlannedMeal[] = [];
  for (const baselineMeal of baseline.menu) {
    const key = `${baselineMeal.dayIndex}:${baselineMeal.mealType}`;
    const llmMeal = llmBySlot.get(key);
    if (baselineMeal.mealType === "lunch" && (llmMeal?.leftover || (input.constraints.quickLunches && baselineMeal.leftover))) {
      const prev = nextMenu.find((item) => item.dayIndex === baselineMeal.dayIndex - 1 && item.mealType === "dinner" && !item.eatingOut);
      if (prev) {
        nextMenu.push(leftoverFromDinner(prev, baselineMeal.dayIndex, Boolean(baselineMeal.eatingOut)));
        continue;
      }
    }

    const recipe = llmMeal ? recipes.find((item) => item.id === llmMeal.recipe_id) : undefined;
    if (!recipe || isSideSalad(recipe)) {
      nextMenu.push(applyGuide(baselineMeal, guideById.get(baselineMeal.recipeId)));
      continue;
    }
    if (baselineMeal.mealType === "lunch" && input.constraints.quickLunches && !isQuickLunch(recipe) && !llmMeal?.leftover) {
      nextMenu.push(applyGuide(baselineMeal, guideById.get(baselineMeal.recipeId)));
      continue;
    }
    if (baselineMeal.mealType === "dinner" && !isHotDinnerMain(recipe, vegetarian)) {
      nextMenu.push(applyGuide(baselineMeal, guideById.get(baselineMeal.recipeId)));
      continue;
    }

    let meal = plannedMealFromRecipe(
      recipe,
      {
        dayIndex: baselineMeal.dayIndex,
        mealType: baselineMeal.mealType,
        cookingSession: baselineMeal.cookingSession,
        eatingOut: baselineMeal.eatingOut,
      },
      peopleCount,
    );
    if (meal.mealType === "dinner") {
      const salad =
        recipes.find((item) => item.id === baselineMeal.sideSalad?.recipeId) ??
        recipes.find((item) => isSideSalad(item));
      if (salad) meal = attachSideSalad(meal, salad, peopleCount);
    }
    if (meal.mealType === "snack") {
      const fruit =
        input.products.find((item) => item.id === baselineMeal.sideFruit?.productId) ??
        pickSnackFruit(input.products, nextMenu);
      if (fruit) meal = attachSnackFruit(meal, fruit, peopleCount);
    }
    const title = llmMeal?.name;
    if (title) {
      meal = {
        ...meal,
        recipeName: meal.sideSalad
          ? `${title} + ${meal.sideSalad.name}`
          : meal.sideFruit
            ? `${title} + ${meal.sideFruit.name}`
            : title,
      };
    }
    meal = { ...meal, guide: guideById.get(recipe.id) ?? fallbackGuide(recipe, meal) };
    nextMenu.push(meal);
  }

  const materialized = materializeFromMenu(nextMenu, input, { trainingPlans: baseline.trainingPlans });
  materialized.warnings = [...new Set([...baseline.warnings, ...materialized.warnings, "Меню и гиды составила языковая модель, корзина и КБЖУ — по каталогу."])];
  return materialized;
}

function applyGuide(meal: PlannedMeal, guide: ReturnType<typeof parseGuides>[number] | undefined): PlannedMeal {
  if (!guide) return meal;
  return {
    ...meal,
    recipeName: meal.sideSalad ? `${guide.title} + ${meal.sideSalad.name}` : guide.title,
    guide,
  };
}

function inferMealType(index: number): "breakfast" | "lunch" | "dinner" | "snack" {
  return (["breakfast", "lunch", "dinner", "snack"][index] ?? "lunch") as "breakfast" | "lunch" | "dinner" | "snack";
}

export function localFallbackProvider() {
  return new FallbackLLMProvider(catalog.getRecipes());
}
