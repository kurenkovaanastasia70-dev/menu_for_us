import { catalog } from "@/lib/catalog/repository";
import { FallbackLLMProvider, requestWorker } from "@/lib/llm/client";
import { parseGuides } from "@/lib/llm/recipe-guide";
import type { WorkerGenerateResponse } from "@/lib/llm/schema";
import { GreedyOptimizationEngine, materializeFromMenu, type OptimizationInput, type OptimizationResult } from "@/lib/optimizer";
import { fillMissingSlots, fitMenuToBudget, mealsFromLlmMenu, scaleMenuToMacroTargets } from "./from-llm";
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

  const fallback = engine.optimize(input);
  const trainingPlans = buildTrainingPlans(params.trainingPeople ?? [], params.days);
  const fallbackWithTraining: OptimizationResult = { ...fallback, trainingPlans };

  if (!params.useLlm) return validateMenuNutrition(fallbackWithTraining, input);

  const worker = await requestWorker<WorkerGenerateResponse>("/api/generate-menu", {
    days: params.days,
    peopleCount: params.people.length,
    calorieTarget: input.calorieTargets,
    proteinTarget: input.macroTargets.protein,
    fatTarget: input.macroTargets.fat,
    carbsTarget: input.macroTargets.carbs,
    budget: params.budget,
    quickLunches: Boolean(params.constraints.quickLunches),
    dietType: params.constraints.dietType,
    eatingOutSlots: params.constraints.eatingOutSlots ?? [],
    products: catalog.getProducts().map((product) => ({
      id: product.id,
      name: product.canonical_name,
      category: product.category,
    })),
  });

  if (!worker.ok || !worker.data.menu) {
    fallbackWithTraining.warnings.push(
      "Модель недоступна — меню из каталога. Ключ Gemini кладётся в Cloudflare Worker, в GitHub только VITE_API_URL.",
    );
    return validateMenuNutrition(fallbackWithTraining, input);
  }

  const guides = parseGuides(worker.data.guides ? { guides: worker.data.guides } : worker.data);
  let menu = mealsFromLlmMenu(worker.data.menu, input, guides);
  menu = fillMissingSlots(menu, fallback.menu);
  menu = scaleMenuToMacroTargets(menu, input);
  menu = fitMenuToBudget(menu, input);

  const result = materializeFromMenu(menu, input, { trainingPlans });
  result.warnings = [
    ...result.warnings,
    "Рецепты и примерное КБЖУ предложила модель. Граммы, корзина и итоговое КБЖУ подогнаны кодом под цель и бюджет.",
  ];
  return validateMenuNutrition(result, input);
}

export function localFallbackProvider() {
  return new FallbackLLMProvider(catalog.getRecipes());
}
