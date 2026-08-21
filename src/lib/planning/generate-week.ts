import { catalog } from "@/lib/catalog/repository";
import { catalogWithCustom } from "@/lib/catalog/custom-products";
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
  customProducts?: import("@/lib/catalog/custom-products").CustomProduct[];
  useLlm: boolean;
}

export async function generateWeek(params: GenerateWeekParams): Promise<OptimizationResult> {
  const engine = new GreedyOptimizationEngine();
  const { products, prices } = catalogWithCustom(params.customProducts ?? []);
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
    products,
    prices,
    recipes: catalog.getRecipes(),
    cashback: params.cashback,
    fridge: params.fridge ?? [],
    constraints: { ...params.constraints, snacks: true },
  };

  const fallback = engine.optimize(input);

  if (!params.useLlm) return validateMenuNutrition(fallback, input);

  const llmProducts = pricedCatalogForLlm(input).map((item) => ({
    id: item.id,
    n: item.name,
    r: item.rub_per_100g,
  }));
  const fridgeStock = (params.fridge ?? []).filter((item) => item.grams > 0);
  const productName = new Map(input.products.map((item) => [item.id, item.canonical_name]));
  const fridgeForLlm = fridgeStock.map((item) => ({
    id: item.productId,
    n: productName.get(item.productId) ?? item.productId,
    g: Math.round(item.grams),
  }));
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
    quickBreakfasts: Boolean(params.constraints.quickBreakfasts),
    dietType: params.constraints.dietType,
    eatingOutSlots: params.constraints.eatingOutSlots ?? [],
    products: llmProducts,
    fridge: fridgeForLlm,
  };

  // По 1 дню: полный каталог + 2 дня часто обрезает JSON → остаются 3–4 дня.
  const mergedByDay = new Map<number, NonNullable<WorkerGenerateResponse["menu"]>["days"][number]>();
  const errors: string[] = [];

  async function fetchDay(day: number, attempt: number) {
    const worker = await requestWorker<WorkerGenerateResponse>("/api/generate-menu", {
      ...basePayload,
      days: 1,
      fromDay: day,
      toDay: day,
      attempt,
    });
    if (!worker.ok || !worker.data.menu?.days?.length) {
      errors.push(worker.ok === false ? `${day}: ${worker.error}` : `пустой день ${day}`);
      return false;
    }
    const match = worker.data.menu.days.find((item) => item.day === day) ?? worker.data.menu.days[0];
    if (!match) {
      errors.push(`нет дня ${day} в ответе`);
      return false;
    }
    mergedByDay.set(day, { ...match, day });
    return true;
  }

  for (let day = 1; day <= params.days; day += 1) {
    if (await fetchDay(day, 1)) continue;
    if (await fetchDay(day, 2)) continue;
    await fetchDay(day, 3);
  }

  // Финальный проход по дырам ещё раз.
  for (let day = 1; day <= params.days; day += 1) {
    if (mergedByDay.has(day)) continue;
    await fetchDay(day, 4);
  }

  const mergedDays = [...mergedByDay.values()].sort((a, b) => a.day - b.day);
  const lastError = errors[errors.length - 1] ?? "";

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
  const llmSlots = menu.length;
  menu = fillMissingSlots(menu, fallback.menu);
  const filledFromCatalog = menu.length - llmSlots;
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
    const missing = Array.from({ length: params.days }, (_, i) => i + 1).filter((day) => !mergedByDay.has(day));
    result.warnings.push(
      `Модель вернула ${mergedDays.length} из ${params.days} дней (не хватило: ${missing.join(", ")})${
        lastError ? ` — ${lastError}` : ""
      }. Остальное дополнено из каталога.`,
    );
  }
  if (filledFromCatalog > 0) {
    result.warnings.push(
      `${filledFromCatalog} слот(ов) добрано из каталога — у модели не хватило валидных блюд на эти приёмы.`,
    );
  }
  result.warnings = [
    ...result.warnings,
    "Блюда придумала модель из продуктов каталога. Граммы, корзина и КБЖУ подогнаны кодом под цель и бюджет.",
  ];
  return validateMenuNutrition(result, input);
}

export function localFallbackProvider() {
  return new FallbackLLMProvider(catalog.getRecipes());
}

/** Полный канонический каталог с лучшей ценой из выбранных магазинов (без среза). */
export function pricedCatalogForLlm(input: OptimizationInput) {
  const preferred = new Set(input.constraints.preferredStoreIds);
  const excluded = new Set(input.constraints.excludedProductIds ?? []);
  return input.products
    .filter((product) => !excluded.has(product.id))
    .map((product) => {
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
