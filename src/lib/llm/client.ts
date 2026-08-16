import type { Recipe } from "@/lib/optimizer/types";
import type { AlternativeInput, LLMMenu, LLMProvider, MenuGenerationInput } from "./schema";

export class FallbackLLMProvider implements LLMProvider {
  private recipes: Recipe[];
  constructor(recipes: Recipe[]) {
    this.recipes = recipes;
  }

  async generateMenu(input: MenuGenerationInput): Promise<LLMMenu> {
    const byId = new Map(this.recipes.map((recipe) => [recipe.id, recipe]));
    const days = [];
    for (let day = 1; day <= input.days; day += 1) {
      const slice = input.selectedRecipeIds.slice(
        (day - 1) * Math.ceil(input.selectedRecipeIds.length / input.days),
        day * Math.ceil(input.selectedRecipeIds.length / input.days),
      );
      days.push({
        day,
        meals: slice.map((id) => {
          const recipe = byId.get(id);
          return {
            name: recipe?.name ?? id,
            recipe_id: id,
            ingredients: recipe?.ingredients ?? [],
          };
        }),
      });
    }
    return { days };
  }

  async generateAlternatives(input: AlternativeInput) {
    return input.candidates.slice(0, 3).map((candidate) => ({
      name: candidate.name,
      recipe_id: candidate.id,
      reason: input.cartProductIds.length
        ? "Близко к продуктам уже в корзине"
        : "Похожее блюдо из каталога",
    }));
  }
}

export async function requestWorker<T extends { ok?: boolean; error?: string; menu?: unknown }>(
  path: string,
  body: unknown,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const base = import.meta.env.VITE_API_URL;
  if (!base) {
    return { ok: false, error: "LLM API не настроен" };
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90_000);
    const response = await fetch(`${base.replace(/\/$/, "")}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const text = await response.text();
    let json: T;
    try {
      json = JSON.parse(text) as T;
    } catch {
      return {
        ok: false,
        error: text
          ? "Ответ модели обрезан или не JSON — повторите расчёт"
          : `Пустой ответ LLM (HTTP ${response.status})`,
      };
    }
    if (!response.ok) {
      return { ok: false, error: json.error || "Ошибка LLM" };
    }
    if (json && typeof json === "object" && json.ok === false) {
      return { ok: false, error: json.error || "LLM недоступна" };
    }
    return { ok: true, data: json };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { ok: false, error: "LLM слишком долго отвечает (таймаут)" };
    }
    return { ok: false, error: "LLM временно недоступна" };
  }
}
