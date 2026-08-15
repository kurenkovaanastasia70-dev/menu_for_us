import { Screen } from "@/components/layout/Shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useApp } from "@/context/AppContext";
import { catalog } from "@/lib/catalog/repository";
import { requestWorker } from "@/lib/llm/client";
import { parseGuides } from "@/lib/llm/recipe-guide";
import { buildSingleRecipePrompt } from "@/lib/llm/recipe-prompt";
import type { WorkerGenerateResponse } from "@/lib/llm/schema";
import { fallbackGuide } from "@/lib/optimizer/meals";
import type { OptimizationResult, RecipeGuide } from "@/lib/optimizer/types";
import { fetchMealPlan, updateMealPlanResult } from "@/lib/supabase/api";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

export function RecipePage() {
  const { planId, dayIndex, mealType } = useParams();
  const { latestPlan, members } = useApp();
  const navigate = useNavigate();
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const id = planId ?? latestPlan?.id;
    if (!id) return;
    if (latestPlan && latestPlan.id === id) {
      setResult(latestPlan.result_json as OptimizationResult);
      return;
    }
    fetchMealPlan(id).then((row) => {
      if (row) setResult(row.result_json as OptimizationResult);
    });
  }, [planId, latestPlan]);

  const meal = useMemo(() => {
    const day = Number(dayIndex);
    return result?.menu.find((item) => item.dayIndex === day && item.mealType === mealType) ?? null;
  }, [result, dayIndex, mealType]);

  const recipe = meal ? catalog.getRecipes().find((item) => item.id === meal.recipeId) : undefined;
  const guide = meal?.guide ?? (recipe && meal ? fallbackGuide(recipe, meal) : null);

  async function saveGuide(nextGuide: RecipeGuide) {
    if (!result || !meal) return;
    const next: OptimizationResult = {
      ...result,
      menu: result.menu.map((item) =>
        item.dayIndex === meal.dayIndex && item.mealType === meal.mealType
          ? {
              ...item,
              guide: nextGuide,
              recipeName: item.sideSalad ? `${nextGuide.title} + ${item.sideSalad.name}` : nextGuide.title,
            }
          : item,
      ),
    };
    setResult(next);
    const id = planId ?? latestPlan?.id;
    if (id) await updateMealPlanResult(id, next);
  }

  async function regenerate() {
    if (!meal || !recipe) return;
    setPending(true);
    setError("");
    const peopleCount = members.length || meal.servings || 1;
    const payload = {
      peopleCount,
      recipe: {
        id: recipe.id,
        name: recipe.name,
        meal_type: recipe.meal_type,
        cooking_time: recipe.cooking_time,
        ingredients: recipe.ingredients.map((ing) => ({
          name: catalog.getProducts().find((product) => product.id === ing.product_id)?.canonical_name ?? ing.product_id,
          grams: ing.grams,
        })),
        instructions: recipe.instructions,
        peopleCount,
      },
      prompt: buildSingleRecipePrompt({
        id: recipe.id,
        name: recipe.name,
        meal_type: recipe.meal_type,
        cooking_time: recipe.cooking_time,
        ingredients: recipe.ingredients.map((ing) => ({
          name: catalog.getProducts().find((product) => product.id === ing.product_id)?.canonical_name ?? ing.product_id,
          grams: ing.grams,
        })),
        instructions: recipe.instructions,
        peopleCount,
      }),
    };
    const worker = await requestWorker<WorkerGenerateResponse>("/api/generate-recipe", payload);
    setPending(false);
    if (!worker.ok) {
      setError("Нет ключа LLM или воркер не отвечает. Ниже — гид из каталога. Как получить ключ — в профиле и README.");
      if (recipe) await saveGuide(fallbackGuide(recipe, meal));
      return;
    }
    const parsed = parseGuides(worker.data.guides ? { guides: worker.data.guides } : worker.data);
    const nextGuide = parsed[0];
    if (!nextGuide) {
      setError("Модель вернула странный JSON. Оставили прошлый гид.");
      return;
    }
    await saveGuide(nextGuide);
  }

  if (!meal || !guide) {
    return (
      <Screen title="Рецепт">
        <p className="text-muted">Блюдо не найдено.</p>
        <Button className="mt-4 w-full" onClick={() => navigate(-1)}>
          Назад
        </Button>
      </Screen>
    );
  }

  return (
    <Screen
      title={guide.title}
      action={
        <button className="text-sm font-semibold text-sage" onClick={() => navigate(-1)}>
          Меню
        </button>
      }
    >
      <Card className="mb-4">
        <p className="text-sm text-muted">{guide.subtitle}</p>
        <p className="mt-2 text-sm">
          {guide.time_minutes} мин · {guide.servings} порц.
          {meal.eatingOut ? " · оба не дома" : ""}
        </p>
        {meal.portions && meal.portions.length > 0 && (
          <ul className="mt-2 space-y-1 text-sm text-muted">
            {meal.portions.map((portion) => (
              <li key={portion.personId}>
                {portion.name}:{" "}
                {portion.eatingOut
                  ? "ем не дома"
                  : `${Math.round(portion.calories)} kcal · ${portion.ingredients
                      .slice(0, 4)
                      .map((ing) => `${ing.product_id} ${ing.grams} г`)
                      .join(", ")}${portion.ingredients.length > 4 ? "…" : ""}`}
              </li>
            ))}
          </ul>
        )}
        {meal.sideSalad && <p className="mt-2 text-sm">Салат: {meal.sideSalad.name}</p>}
      </Card>

      <div className="space-y-3">
        {guide.steps
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((step) => (
            <Card key={step.order}>
              <div className="text-xs font-semibold uppercase tracking-wide text-sage">
                Шаг {step.order}
                {step.minutes ? ` · ${step.minutes} мин` : ""}
              </div>
              <h2 className="mt-1 font-display text-2xl">{step.title}</h2>
              <p className="mt-2 text-sm leading-relaxed">{step.text}</p>
            </Card>
          ))}
      </div>

      {guide.tips.length > 0 && (
        <Card className="mt-4">
          <h2 className="font-display text-xl">Советы</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {guide.tips.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </Card>
      )}

      {guide.plating && (
        <Card className="mt-4">
          <h2 className="font-display text-xl">Подача</h2>
          <p className="mt-2 text-sm">{guide.plating}</p>
        </Card>
      )}

      {error && <p className="mt-4 text-sm text-clay">{error}</p>}
      <Button className="mt-4 w-full" disabled={pending} onClick={regenerate}>
        {pending ? "Пишем новый гид…" : "Перегенерировать рецепт"}
      </Button>
    </Screen>
  );
}
