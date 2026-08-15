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
    people: params.people.map((person) => ({
      id: person.id,
      name: person.name,
      calorieTarget: person.calorieTarget,
      proteinTarget: person.proteinTarget,
    })),
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
      worker.ok === false && worker.error
        ? `Модель недоступна (${worker.error}). Показано меню из каталога.`
        : "Модель недоступна — меню из каталога. Ключ Gemini в Cloudflare Worker, в GitHub только VITE_API_URL.",
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

/** Компактный прайс для модели: только нужный минимум, иначе воркер/Gemini рвут длинный запрос. */
export function pricedCatalogForLlm(input: OptimizationInput) {
  const preferred = new Set(input.constraints.preferredStoreIds);
  const priced = input.products.map((product) => {
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

  const MAX = 64;
  const PER_CATEGORY = 10;
  const byCategory = new Map<string, typeof priced>();
  for (const item of priced) {
    const list = byCategory.get(item.category) ?? [];
    list.push(item);
    byCategory.set(item.category, list);
  }
  const picked: typeof priced = [];
  for (const list of byCategory.values()) {
    const sorted = list
      .slice()
      .sort((a, b) => (a.rub_per_100g ?? 999) - (b.rub_per_100g ?? 999));
    picked.push(...sorted.slice(0, PER_CATEGORY));
  }
  return picked
    .sort((a, b) => (a.rub_per_100g ?? 999) - (b.rub_per_100g ?? 999))
    .slice(0, MAX);
}
