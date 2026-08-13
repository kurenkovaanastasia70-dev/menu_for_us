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

export async function requestWorker<T>(
  path: string,
  body: unknown,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const base = import.meta.env.VITE_API_URL;
  if (!base) {
    return { ok: false, error: "LLM API не настроен" };
  }
  try {
    const response = await fetch(`${base.replace(/\/$/, "")}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await response.json()) as T & { error?: string };
    if (!response.ok) {
      return { ok: false, error: json.error || "Ошибка LLM" };
    }
    return { ok: true, data: json };
  } catch {
    return { ok: false, error: "LLM временно недоступна" };
  }
}
