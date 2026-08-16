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

  const products = pricedCatalogForLlm(input);
  const basePayload = {
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
    products,
  };

  // Куски по 2 дня на клиенте: длинный один запрос обрезается прокси/таймаутом → «модель недоступна».
  const chunkSize = 2;
  const mergedDays: NonNullable<WorkerGenerateResponse["menu"]>["days"] = [];
  let lastError = "";
  for (let fromDay = 1; fromDay <= params.days; fromDay += chunkSize) {
    const toDay = Math.min(params.days, fromDay + chunkSize - 1);
    const worker = await requestWorker<WorkerGenerateResponse>("/api/generate-menu", {
      ...basePayload,
      days: toDay - fromDay + 1,
      fromDay,
      toDay,
    });
    if (!worker.ok || !worker.data.menu?.days?.length) {
      lastError = worker.ok === false ? worker.error : "пустой кусок меню";
      continue;
    }
    mergedDays.push(...worker.data.menu.days);
  }

  if (mergedDays.length === 0) {
    fallback.warnings.push(
      lastError
        ? `Модель недоступна (${lastError}). Показано меню из каталога.`
        : "Модель недоступна — меню из каталога. Ключ Gemini в Cloudflare Worker, в GitHub только VITE_API_URL.",
    );
    return validateMenuNutrition(fallback, input);
  }

  const llmMenu = { days: mergedDays.sort((a, b) => a.day - b.day) };
  const guides = parseGuides({ guides: [] });
  let menu = mealsFromLlmMenu(llmMenu, input, guides);
  menu = fillMissingSlots(menu, fallback.menu);
  menu = scaleMenuToMacroTargets(menu, input);
  menu = fitMenuToBudget(menu, input);

  const result = materializeFromMenu(menu, input);
  if (result.effectiveCost > input.budget) {
    result.warnings = [
      ...result.warnings,
      `Корзина ${Math.round(result.effectiveCost)} ₽ при бюджете ${Math.round(input.budget)} ₽ — порции уже ужаты по максимуму. Поднимите бюджет или отметьте больше «ем не дома».`,
    ];
  }
  if (mergedDays.length < params.days) {
    result.warnings.push(`Модель вернула ${mergedDays.length} из ${params.days} дней — остальное дополнено из каталога.`);
  }
  result.warnings = [
    ...result.warnings,
    "Рецепты и примерное КБЖУ предложила модель. Граммы, корзина и итоговое КБЖУ подогнаны кодом под цель и бюджет.",
  ];
  return validateMenuNutrition(result, input);
}

export function localFallbackProvider() {
  return new FallbackLLMProvider(catalog.getRecipes());
}

/** Прайс для модели: широкий, но компактный срез полного каталога (не «только самые дешёвые»). */
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

  // Квоты по категориям: белок/овощи шире, жиры/снеки уже.
  const quota: Record<string, number> = {
    protein: 32,
    vegetable: 24,
    grain: 20,
    dairy: 18,
    fruit: 16,
    pantry: 16,
    fat: 10,
    snack: 8,
  };
  const MAX = input.constraints.varietyPreference === "high" ? 48 : input.constraints.varietyPreference === "low" ? 36 : 42;
  const seed = hashSeed(
    `${input.constraints.varietyPreference}:${input.people.map((person) => person.id).join(",")}:${input.days}:${input.budget}`,
  );

  const byCategory = new Map<string, typeof priced>();
  for (const item of priced) {
    const list = byCategory.get(item.category) ?? [];
    list.push(item);
    byCategory.set(item.category, list);
  }

  const staples = new Set([
    "chicken_breast",
    "egg",
    "cottage_cheese",
    "milk",
    "oats",
    "rice",
    "buckwheat",
    "potato",
    "onion",
    "carrot",
    "tomato",
    "cucumber",
    "apple",
    "banana",
    "sunflower_oil",
    "yogurt",
    "tuna_can",
    "beans",
    "lentils",
  ]);

  const picked: typeof priced = [];
  const seen = new Set<string>();

  function add(item: (typeof priced)[number]) {
    if (seen.has(item.id)) return;
    seen.add(item.id);
    picked.push(item);
  }

  for (const item of priced) {
    if (staples.has(item.id)) add(item);
  }

  for (const [category, list] of byCategory) {
    const limit = quota[category] ?? 10;
    const sorted = list.slice().sort((a, b) => (a.rub_per_100g ?? 999) - (b.rub_per_100g ?? 999));
    const cheapCount = Math.ceil(limit * 0.55);
    const varietyCount = Math.max(0, limit - cheapCount);
    for (const item of sorted.slice(0, cheapCount)) add(item);

    // Середина/хвост прайса — ротация по seed, чтобы недели не были клонами.
    const rest = sorted.slice(cheapCount);
    const rotated = rotate(rest, seed + category.charCodeAt(0));
    for (const item of rotated.slice(0, varietyCount)) add(item);
  }

  // Если ещё есть место — добираем оставшиеся по ротации (не только дешёвые).
  if (picked.length < MAX) {
    const rest = rotate(
      priced.filter((item) => !seen.has(item.id)),
      seed,
    );
    for (const item of rest) {
      if (picked.length >= MAX) break;
      add(item);
    }
  }

  return picked.slice(0, MAX);
}

function rotate<T>(items: T[], seed: number): T[] {
  if (items.length <= 1) return items.slice();
  const offset = Math.abs(seed) % items.length;
  return items.slice(offset).concat(items.slice(0, offset));
}

function hashSeed(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}
