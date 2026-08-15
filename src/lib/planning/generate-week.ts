import { catalog } from "@/lib/catalog/repository";
import { FallbackLLMProvider, requestWorker } from "@/lib/llm/client";
import { parseGuides } from "@/lib/llm/recipe-guide";
import type { WorkerGenerateResponse } from "@/lib/llm/schema";
import { GreedyOptimizationEngine, materializeFromMenu, type OptimizationInput, type OptimizationResult } from "@/lib/optimizer";
import { fillMissingSlots, fitMenuToBudget, mealsFromLlmMenu, scaleMenuToMacroTargets } from "./from-llm";
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
    constraints: { ...params.constraints, snacks: true },
  };

  const fallback = engine.optimize(input);

  if (!params.useLlm) return validateMenuNutrition(fallback, input);

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
    products: pricedCatalogForLlm(input),
  });

  if (!worker.ok || !worker.data.menu) {
    fallback.warnings.push(
      "Модель недоступна — меню из каталога. Ключ Gemini кладётся в Cloudflare Worker, в GitHub только VITE_API_URL.",
    );
    return validateMenuNutrition(fallback, input);
  }

  const guides = parseGuides(worker.data.guides ? { guides: worker.data.guides } : worker.data);
  let menu = mealsFromLlmMenu(worker.data.menu, input, guides);
  menu = fillMissingSlots(menu, fallback.menu);
  menu = scaleMenuToMacroTargets(menu, input);
  menu = fitMenuToBudget(menu, input);

  const result = materializeFromMenu(menu, input);
  result.warnings = [
    ...result.warnings,
    "Рецепты и примерное КБЖУ предложила модель. Граммы, корзина и итоговое КБЖУ подогнаны кодом под цель и бюджет.",
  ];
  return validateMenuNutrition(result, input);
}

export function localFallbackProvider() {
  return new FallbackLLMProvider(catalog.getRecipes());
}

/** Компактный прайс для модели: id, имя, упаковка и минимальная цена среди выбранных магазинов. */
export function pricedCatalogForLlm(input: OptimizationInput) {
  const preferred = new Set(input.constraints.preferredStoreIds);
  return input.products.map((product) => {
    const offers = input.prices.filter((item) => item.canonical_product_id === product.id && item.available);
    const scoped = preferred.size > 0 ? offers.filter((item) => preferred.has(item.store_id)) : offers;
    const pool = scoped.length > 0 ? scoped : offers;
    const best = pool.slice().sort((a, b) => a.price / a.package_weight - b.price / b.package_weight)[0];
    return {
      id: product.id,
      name: product.canonical_name,
      category: product.category,
      pack_g: best?.package_weight ?? product.package_weight,
      price_rub: best?.price ?? null,
      rub_per_100g: best ? Math.round((best.price / best.package_weight) * 1000) / 10 : null,
    };
  });
}
