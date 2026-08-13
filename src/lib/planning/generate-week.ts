import { catalog } from "@/lib/catalog/repository";
import { FallbackLLMProvider, requestWorker } from "@/lib/llm/client";
import { parseGuides } from "@/lib/llm/recipe-guide";
import { buildRecipeGuidesPrompt } from "@/lib/llm/recipe-prompt";
import type { WorkerGenerateResponse } from "@/lib/llm/schema";
import { GreedyOptimizationEngine, type OptimizationInput, type OptimizationResult, type Recipe } from "@/lib/optimizer";
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
    constraints: params.constraints,
  };

  const result = engine.optimize(input);
  const withTraining: OptimizationResult = {
    ...result,
    trainingPlans: buildTrainingPlans(params.trainingPeople ?? [], params.days),
  };
  const validated = validateMenuNutrition(withTraining, input);

  if (!params.useLlm) return validated;

  const selectedIds = [...new Set(validated.menu.map((meal) => meal.recipeId))];
  const recipePayload = selectedIds
    .map((id) => catalog.getRecipes().find((recipe) => recipe.id === id))
    .filter((recipe): recipe is Recipe => Boolean(recipe))
    .map((recipe) => ({
      id: recipe.id,
      name: recipe.name,
      meal_type: recipe.meal_type,
      cooking_time: recipe.cooking_time,
      ingredients: recipe.ingredients.map((ing) => ({
        name: catalog.getProducts().find((product) => product.id === ing.product_id)?.canonical_name ?? ing.product_id,
        grams: ing.grams,
      })),
      instructions: recipe.instructions,
    }));

  const worker = await requestWorker<WorkerGenerateResponse>("/api/generate-menu", {
    days: params.days,
    peopleCount: params.people.length,
    calorieTarget: input.calorieTargets,
    selectedRecipeIds: selectedIds,
    recipes: recipePayload,
    prompt: buildRecipeGuidesPrompt({ peopleCount: params.people.length, recipes: recipePayload }),
  });

  if (!worker.ok || !worker.data.menu) {
    validated.warnings.push("Меню собрано из каталога: языковая модель недоступна. Гиды — из рецептов, кнопка «Перегенерировать» заработает после ключа.");
    return validated;
  }

  const renamed = applyLlmMenu(validated, worker.data, catalog.getRecipes());
  return validateMenuNutrition(renamed, input);
}

function applyLlmMenu(
  result: OptimizationResult,
  llm: WorkerGenerateResponse,
  recipes: Recipe[],
): OptimizationResult {
  const names = new Map<string, string>();
  if (llm.menu) {
    for (const day of llm.menu.days) {
      for (const meal of day.meals) {
        if (recipes.some((recipe) => recipe.id === meal.recipe_id)) {
          names.set(meal.recipe_id, meal.name);
        }
      }
    }
  }
  const guides = parseGuides(llm.guides ? { guides: llm.guides } : llm);
  const byId = new Map(guides.map((guide) => [guide.recipe_id, guide]));
  return {
    ...result,
    menu: result.menu.map((meal) => {
      const guide = byId.get(meal.recipeId);
      const title = guide?.title ?? names.get(meal.recipeId);
      return {
        ...meal,
        recipeName: title ? (meal.sideSalad ? `${title} + ${meal.sideSalad.name}` : title) : meal.recipeName,
        guide: guide ?? meal.guide,
      };
    }),
  };
}

export function localFallbackProvider() {
  return new FallbackLLMProvider(catalog.getRecipes());
}
