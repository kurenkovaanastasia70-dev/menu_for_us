import { Screen } from "@/components/layout/Shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useApp } from "@/context/AppContext";
import { formatRub } from "@/lib/cn";
import type { OptimizationResult, PlannedMeal } from "@/lib/optimizer";
import { replaceMeal, suggestMealAlternatives } from "@/lib/planning/alternatives";
import { makeOptimizationInput } from "@/lib/planning/from-profiles";
import { fetchMealPlan, replaceCartItems, updateMealPlanResult } from "@/lib/supabase/api";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

const dayNames = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];
const mealLabels: Record<string, string> = {
  breakfast: "Завтрак",
  lunch: "Обед",
  dinner: "Ужин",
  snack: "Перекус",
};

export function MenuPage() {
  const { planId } = useParams();
  const { latestPlan, household, members, cashback, refresh } = useApp();
  const navigate = useNavigate();
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [activeMeal, setActiveMeal] = useState<PlannedMeal | null>(null);
  const [saving, setSaving] = useState(false);

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

  const input = useMemo(() => {
    if (!household || members.length === 0 || !latestPlan) return null;
    return makeOptimizationInput({
      profiles: members,
      household,
      cashback,
      days: latestPlan.days,
      budget: Number(latestPlan.budget),
    });
  }, [household, members, cashback, latestPlan]);

  const alternatives = useMemo(() => {
    if (!activeMeal || !result || !input) return [];
    return suggestMealAlternatives(activeMeal, result, input);
  }, [activeMeal, result, input]);

  async function applyReplace(recipeId: string) {
    if (!activeMeal || !result || !input || !planId && !latestPlan) return;
    const recipe = input.recipes.find((item) => item.id === recipeId);
    if (!recipe) return;
    const next = replaceMeal(result, activeMeal, recipe, input);
    setResult(next);
    setActiveMeal(null);
    const id = planId ?? latestPlan?.id;
    if (!id || !household) return;
    setSaving(true);
    await updateMealPlanResult(id, next);
    await replaceCartItems(id, household.id, next);
    await refresh();
    setSaving(false);
  }

  if (!result) {
    return (
      <Screen title="Меню">
        <p className="text-muted">Сначала составьте неделю.</p>
        <Button className="mt-4 w-full" onClick={() => navigate("/plan")}>
          Составить неделю
        </Button>
      </Screen>
    );
  }

  const days = Math.max(...result.menu.map((meal) => meal.dayIndex), 0) + 1;

  return (
    <Screen
      title="Меню"
      action={
        <button className="text-sm font-semibold text-sage" onClick={() => navigate(`/cart/${planId ?? latestPlan?.id}`)}>
          Корзина
        </button>
      }
    >
      <Card className="mb-4">
        <div className="flex justify-between text-sm">
          <span>{Math.round(result.nutritionSummary.caloriesPerDay)} kcal</span>
          <span>{Math.round(result.nutritionSummary.proteinPerDay)} g белка</span>
          <span>{formatRub(result.effectiveCost)}</span>
        </div>
        <p className="mt-2 text-xs text-muted">
          Разнообразие {result.varietyScore} · остатки {result.wasteScore}
        </p>
        {result.warnings.map((warning) => (
          <p key={warning} className="mt-2 text-sm text-clay">
            {warning}
          </p>
        ))}
      </Card>

      {result.cookingPlan.length > 0 && (
        <Card className="mb-4">
          <h2 className="font-display text-xl">Meal prep</h2>
          <ul className="mt-3 space-y-3">
            {result.cookingPlan.map((session) => (
              <li key={session.index}>
                <div className="text-sm font-semibold text-sage">{session.label}</div>
                <div className="text-sm text-muted">{session.recipeNames.join(", ")}</div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="space-y-4">
        {Array.from({ length: days }).map((_, day) => (
          <Card key={day}>
            <h2 className="font-display text-2xl">{dayNames[day % 7]}</h2>
            <div className="mt-3 space-y-3">
              {result.menu
                .filter((meal) => meal.dayIndex === day)
                .map((meal) => (
                  <div key={`${meal.dayIndex}-${meal.mealType}`} className="rounded-2xl bg-cream p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-semibold tracking-wide text-muted uppercase">
                          {mealLabels[meal.mealType]}
                        </div>
                        <div className="font-semibold">{meal.recipeName}</div>
                        <div className="text-xs text-muted">
                          {Math.round(meal.calories)} kcal · {Math.round(meal.protein)} g белка
                        </div>
                      </div>
                      <button className="text-sm font-semibold text-sage" onClick={() => setActiveMeal(meal)}>
                        🔄 Заменить
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </Card>
        ))}
      </div>

      {activeMeal && (
        <div className="fixed inset-0 z-30 bg-ink/40 p-4" onClick={() => setActiveMeal(null)}>
          <div className="mx-auto mt-20 max-w-lg rounded-3xl bg-paper p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-2xl">Замена блюда</h3>
            <p className="mt-1 text-sm text-muted">{activeMeal.recipeName}</p>
            <div className="mt-4 space-y-2">
              {alternatives.map((item) => (
                <button
                  key={item.recipe.id}
                  className="w-full rounded-2xl border border-line bg-white p-3 text-left"
                  onClick={() => applyReplace(item.recipe.id)}
                  disabled={saving}
                >
                  <div className="font-semibold">{item.recipe.name}</div>
                  <div className="text-sm text-muted">
                    {item.reason}
                    {item.extraCost !== 0 ? ` · ${item.extraCost > 0 ? "+" : ""}${Math.round(item.extraCost)} ₽` : ""}
                  </div>
                </button>
              ))}
            </div>
            <Button className="mt-4 w-full" variant="secondary" onClick={() => setActiveMeal(null)}>
              Закрыть
            </Button>
          </div>
        </div>
      )}
    </Screen>
  );
}
