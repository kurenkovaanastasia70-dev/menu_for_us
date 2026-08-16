import { Screen } from "@/components/layout/Shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useApp } from "@/context/AppContext";
import { formatRub } from "@/lib/cn";
import type { OptimizationResult, PlannedMeal } from "@/lib/optimizer";
import { materializeFromMenu } from "@/lib/optimizer";
import {
  replaceMeal,
  replaceMealWithLlmIdea,
  suggestLlmMealAlternatives,
  type MealAlternative,
} from "@/lib/planning/alternatives";
import { makeOptimizationInput } from "@/lib/planning/from-profiles";
import { withHomePresence } from "@/lib/planning/portions";
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
  const { latestPlan, household, members, cashback, fridge, customProducts, refresh } = useApp();
  const navigate = useNavigate();
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [activeMeal, setActiveMeal] = useState<PlannedMeal | null>(null);
  const [alternatives, setAlternatives] = useState<MealAlternative[]>([]);
  const [loadingAlts, setLoadingAlts] = useState(false);
  const [altsNonce, setAltsNonce] = useState(0);
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
      fridge,
      customProducts,
    });
  }, [household, members, cashback, latestPlan, fridge, customProducts]);

  useEffect(() => {
    if (!activeMeal || !result || !input) {
      setAlternatives([]);
      return;
    }
    let cancelled = false;
    setLoadingAlts(true);
    suggestLlmMealAlternatives(activeMeal, result, input, { refreshToken: altsNonce }).then((items) => {
      if (!cancelled) {
        setAlternatives(items);
        setLoadingAlts(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [activeMeal, result, input, altsNonce]);

  async function persist(next: OptimizationResult) {
    setResult(next);
    const id = planId ?? latestPlan?.id;
    if (!id || !household) return;
    setSaving(true);
    await updateMealPlanResult(id, next);
    await replaceCartItems(id, household.id, next);
    await refresh();
    setSaving(false);
  }

  async function applyAlternative(item: MealAlternative) {
    if (!activeMeal || !result || !input) return;
    const next =
      item.kind === "catalog"
        ? replaceMeal(result, activeMeal, item.recipe, input)
        : replaceMealWithLlmIdea(
            result,
            activeMeal,
            {
              recipeId: item.recipeId,
              name: item.name,
              ingredients: item.ingredients,
              steps: item.steps,
            },
            input,
          );
    setActiveMeal(null);
    await persist(next);
  }

  async function togglePersonEatingOut(meal: PlannedMeal, personId: string) {
    if (!result || !input) return;
    const out = new Set(meal.eatingOutPersonIds ?? []);
    if (out.has(personId)) out.delete(personId);
    else out.add(personId);
    const constraints = {
      ...input.constraints,
      eatingOutSlots: [
        ...(input.constraints.eatingOutSlots ?? []).filter(
          (slot) => !(slot.dayIndex === meal.dayIndex && slot.mealType === meal.mealType),
        ),
        ...[...out].map((id) => ({
          personId: id,
          dayIndex: meal.dayIndex,
          mealType: meal.mealType,
        })),
      ],
    };
    const fullIngredients = (meal.fullIngredients ?? meal.ingredients).map((ing) => ({ ...ing }));
    const nextMeal = withHomePresence(
      {
        ...meal,
        fullIngredients,
        ingredients: fullIngredients,
        calories: estimateFullMacro(meal, "calories"),
        protein: estimateFullMacro(meal, "protein"),
        fat: estimateFullMacro(meal, "fat"),
        carbs: estimateFullMacro(meal, "carbs"),
        fiber: estimateFullMacro(meal, "fiber"),
        iron: estimateFullMacro(meal, "iron"),
        eatingOutPersonIds: [...out],
      },
      input.people,
      constraints,
    );
    const nextMenu = result.menu.map((item) =>
      item.dayIndex === meal.dayIndex && item.mealType === meal.mealType ? nextMeal : item,
    );
    await persist(materializeFromMenu(nextMenu, { ...input, constraints }, { trainingPlans: result.trainingPlans }));
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
          Клетчатка {Math.round(result.nutritionSummary.fiberPerDay ?? 0)} / {Math.round(result.nutritionSummary.fiberTarget ?? 0)} г ·
          железо {Math.round((result.nutritionSummary.ironPerDay ?? 0) * 10) / 10} / {Math.round(result.nutritionSummary.ironTarget ?? 0)} мг
        </p>
        <p className="mt-1 text-xs text-muted">
          Разнообразие {result.varietyScore} · остатки {result.wasteScore} · порции по людям
        </p>
        {result.warnings.map((warning) => (
          <p key={warning} className="mt-2 text-sm text-clay">
            {warning}
          </p>
        ))}
      </Card>

      <div className="space-y-4">
        {Array.from({ length: days }, (_, dayIndex) => (
          <Card key={dayIndex}>
            <h2 className="font-display text-2xl">{dayNames[dayIndex] ?? `День ${dayIndex + 1}`}</h2>
            <div className="mt-3 space-y-3">
              {result.menu
                .filter((meal) => meal.dayIndex === dayIndex)
                .map((meal) => (
                  <div
                    key={`${meal.dayIndex}-${meal.mealType}`}
                    className="rounded-2xl border border-line bg-white/70 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <button
                        className="text-left"
                        onClick={() =>
                          navigate(`/menu/${planId ?? latestPlan?.id}/recipe/${meal.dayIndex}/${meal.mealType}`)
                        }
                      >
                        <div className="text-xs font-semibold tracking-wide text-muted uppercase">
                          {mealLabels[meal.mealType]}
                          {meal.fromLlm ? " · модель" : ""}
                        </div>
                        <div className="font-semibold">{meal.recipeName}</div>
                        <div className="text-xs text-muted">
                          {meal.eatingOut
                            ? "Оба не дома — не в корзине"
                            : meal.leftover
                              ? "Остатки ужина · 5–8 мин"
                              : `${Math.round(meal.calories)} kcal · ${Math.round(meal.protein)} g белка (на дом)`}
                        </div>
                        {meal.portions && meal.portions.length > 0 && !meal.eatingOut && (
                          <ul className="mt-1 space-y-0.5 text-xs text-muted">
                            {meal.portions.map((portion) => (
                              <li key={portion.personId}>
                                {portion.name}:{" "}
                                {portion.eatingOut
                                  ? "не дома"
                                  : `${Math.round(portion.calories)} kcal · ${Math.round(portion.protein)} g белка`}
                              </li>
                            ))}
                          </ul>
                        )}
                        {meal.llmEstimate && !meal.eatingOut && (
                          <div className="text-xs text-muted">
                            оценка модели: {Math.round(meal.llmEstimate.calories)} kcal ·{" "}
                            {Math.round(meal.llmEstimate.protein)} g белка
                          </div>
                        )}
                        {meal.sideSalad && !meal.eatingOut && (
                          <div className="text-xs text-muted">Салат: {meal.sideSalad.name}</div>
                        )}
                        {meal.sideFruit && !meal.eatingOut && (
                          <div className="text-xs text-muted">
                            Фрукт: {meal.sideFruit.name} · {meal.sideFruit.grams} г
                          </div>
                        )}
                        <div className="mt-1 text-xs font-semibold text-sage">Открыть гид →</div>
                      </button>
                      <button className="text-sm font-semibold text-sage" onClick={() => setActiveMeal(meal)}>
                        🔄
                      </button>
                    </div>
                    <div className="mt-3 space-y-2">
                      {(meal.portions ??
                        input?.people.map((person) => ({
                          personId: person.id,
                          name: person.name,
                          eatingOut: Boolean(meal.eatingOut),
                        })) ??
                        []).map((portion) => (
                        <label key={portion.personId} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={Boolean(portion.eatingOut || meal.eatingOutPersonIds?.includes(portion.personId))}
                            onChange={() => togglePersonEatingOut(meal, portion.personId)}
                            disabled={saving || !input}
                          />
                          {portion.name}: ем не дома
                        </label>
                      ))}
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
            <div className="mt-4 max-h-[50vh] space-y-2 overflow-y-auto">
              {loadingAlts && <p className="text-sm text-muted">Модель генерирует 5 вариантов…</p>}
              {!loadingAlts && alternatives.length === 0 && (
                <p className="text-sm text-muted">Варианты не пришли — нажмите «Ещё варианты».</p>
              )}
              {!loadingAlts && alternatives.length > 0 && alternatives.length < 5 && (
                <p className="text-sm text-clay">Пришло {alternatives.length} из 5 — нажмите «Ещё варианты».</p>
              )}
              {!loadingAlts &&
                alternatives.map((item) => {
                  const key = item.kind === "catalog" ? item.recipe.id : item.recipeId;
                  const name = item.kind === "catalog" ? item.recipe.name : item.name;
                  return (
                    <button
                      key={key}
                      className="w-full rounded-2xl border border-line bg-white p-3 text-left"
                      onClick={() => applyAlternative(item)}
                      disabled={saving}
                    >
                      <div className="font-semibold">{name}</div>
                      <div className="text-sm text-muted">
                        {item.kind === "llm" ? "От модели · " : "Из каталога · "}
                        {item.reason}
                        {item.extraCost !== 0
                          ? ` · ${item.extraCost > 0 ? "+" : ""}${Math.round(item.extraCost)} ₽`
                          : ""}
                      </div>
                    </button>
                  );
                })}
            </div>
            <div className="mt-4 flex gap-2">
              <Button
                className="flex-1"
                variant="secondary"
                disabled={loadingAlts}
                onClick={() => setAltsNonce((value) => value + 1)}
              >
                {loadingAlts ? "Генерируем…" : "Ещё варианты"}
              </Button>
              <Button className="flex-1" variant="secondary" onClick={() => setActiveMeal(null)}>
                Закрыть
              </Button>
            </div>
          </div>
        </div>
      )}
    </Screen>
  );
}

function estimateFullMacro(
  meal: PlannedMeal,
  key: "calories" | "protein" | "fat" | "carbs" | "fiber" | "iron",
): number {
  const value = Number(meal[key] ?? 0);
  const fullG = (meal.fullIngredients ?? meal.ingredients).reduce((sum, ing) => sum + ing.grams, 0);
  const curG = meal.ingredients.reduce((sum, ing) => sum + ing.grams, 0);
  if (fullG > 0 && curG > 0 && Math.abs(fullG - curG) > 1) {
    return Math.round(value * (fullG / curG) * 10) / 10;
  }
  if (meal.eatingOut && meal.fullIngredients) {
    const fromPortions = meal.portions?.reduce((sum, portion) => sum + Number(portion[key as "calories"] ?? 0), 0);
    if (fromPortions && fromPortions > 0) return fromPortions;
  }
  return value;
}
