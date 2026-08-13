import { catalog } from "@/lib/catalog/repository";
import { FallbackLLMProvider, requestWorker } from "@/lib/llm/client";
import type { WorkerGenerateResponse } from "@/lib/llm/schema";
import { GreedyOptimizationEngine, type OptimizationInput, type OptimizationResult, type Recipe } from "@/lib/optimizer";
import { validateMenuNutrition } from "./validate-menu";

export interface GenerateWeekParams {
  people: OptimizationInput["people"];
  days: number;
  budget: number;
  constraints: OptimizationInput["constraints"];
  cashback: OptimizationInput["cashback"];
  fridge?: OptimizationInput["fridge"];
  useLlm: boolean;
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
    constraints: params.constraints,
  };

  const result = engine.optimize(input);
  const validated = validateMenuNutrition(result, input);

  if (!params.useLlm) return validated;

  const worker = await requestWorker<WorkerGenerateResponse>("/api/generate-menu", {
    days: params.days,
    peopleCount: params.people.length,
    calorieTarget: input.calorieTargets,
    selectedRecipeIds: [...new Set(result.menu.map((meal) => meal.recipeId))],
    recipes: catalog.getRecipes().map((recipe) => ({
      id: recipe.id,
      name: recipe.name,
      meal_type: recipe.meal_type,
    })),
  });

  if (!worker.ok || !worker.data.menu) {
    validated.warnings.push("Меню собрано из каталога: языковая модель недоступна.");
    return validated;
  }

  const renamed = applyLlmNames(validated, worker.data.menu, catalog.getRecipes());
  return validateMenuNutrition(renamed, input);
}

function applyLlmNames(
  result: OptimizationResult,
  llmMenu: NonNullable<WorkerGenerateResponse["menu"]>,
  recipes: Recipe[],
): OptimizationResult {
  const names = new Map<string, string>();
  for (const day of llmMenu.days) {
    for (const meal of day.meals) {
      if (recipes.some((recipe) => recipe.id === meal.recipe_id)) {
        names.set(meal.recipe_id, meal.name);
      }
    }
  }
  return {
    ...result,
    menu: result.menu.map((meal) => ({
      ...meal,
      recipeName: names.get(meal.recipeId) ?? meal.recipeName,
    })),
  };
}

export function localFallbackProvider() {
  return new FallbackLLMProvider(catalog.getRecipes());
}
