import { Screen } from "@/components/layout/Shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useApp } from "@/context/AppContext";
import { formatDateRange, formatRub } from "@/lib/cn";
import { planDateRange } from "@/lib/dates/week";
import type { OptimizationResult } from "@/lib/optimizer";
import { clearMealPlanHistory, deleteMealPlan, saveMealPlan } from "@/lib/supabase/api";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

export function HistoryPage() {
  const { plans, household, refresh, latestPlan, currentWeekPlanId, setCurrentWeekPlan } = useApp();
  const navigate = useNavigate();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState("");

  async function repeat(planId: string, mutate?: "budget" | "menu") {
    const plan = plans.find((item) => item.id === planId);
    if (!plan || !household) return;
    if (mutate === "budget" || mutate === "menu") {
      navigate("/plan");
      return;
    }
    const range = planDateRange(plan.days);
    const id = await saveMealPlan({
      householdId: household.id,
      startDate: range.startDate,
      endDate: range.endDate,
      days: plan.days,
      budget: Number(plan.budget),
      result: plan.result_json as OptimizationResult,
    });
    setCurrentWeekPlan(null);
    await refresh();
    navigate(`/menu/${id}`);
  }

  async function removeOne(planId: string) {
    if (!window.confirm("Удалить эту неделю из истории?")) return;
    setPendingId(planId);
    setError("");
    try {
      await deleteMealPlan(planId);
      if (currentWeekPlanId === planId) setCurrentWeekPlan(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось удалить");
    } finally {
      setPendingId(null);
    }
  }

  async function clearAll() {
    if (!household) return;
    if (!window.confirm("Очистить всю историю меню? Это нельзя отменить.")) return;
    setClearing(true);
    setError("");
    try {
      await clearMealPlanHistory(household.id);
      setCurrentWeekPlan(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось очистить историю");
    } finally {
      setClearing(false);
    }
  }

  return (
    <Screen title="История">
      <p className="mb-4 text-sm text-muted">
        Галочка «Текущая неделя» — из этого плана собирается корзина. Без галочки берётся последняя генерация.
      </p>
      {plans.length > 0 && (
        <div className="mb-4">
          <Button variant="ghost" className="w-full" disabled={clearing} onClick={clearAll}>
            {clearing ? "Очищаем…" : "Очистить всю историю"}
          </Button>
        </div>
      )}
      {error && <p className="mb-3 text-sm text-clay">{error}</p>}
      {plans.length === 0 ? (
        <p className="text-muted">Пока нет сохранённых недель.</p>
      ) : (
        <div className="space-y-3">
          {plans.map((plan) => {
            const isPinned = currentWeekPlanId === plan.id;
            const isActive = latestPlan?.id === plan.id;
            return (
              <Card key={plan.id}>
                <button className="w-full text-left" onClick={() => navigate(`/history/${plan.id}`)}>
                  <div className="text-sm text-muted">{formatDateRange(plan.start_date, plan.end_date)}</div>
                  <div className="mt-1 flex items-end justify-between">
                    <div className="font-display text-2xl">{formatRub(plan.effective_price)}</div>
                    <div className="text-sm text-muted">{plan.days} дней</div>
                  </div>
                  {isActive && (
                    <p className="mt-2 text-xs font-semibold text-sage">
                      {isPinned ? "Текущая неделя · корзина" : "Последняя генерация · корзина"}
                    </p>
                  )}
                </button>
                <label className="mt-3 flex items-center gap-2 text-sm" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => {
                      if (e.target.checked) setCurrentWeekPlan(plan.id);
                      else if (isPinned) setCurrentWeekPlan(null);
                    }}
                  />
                  Текущая неделя (корзина)
                </label>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button variant="secondary" onClick={() => repeat(plan.id)}>
                    Повторить неделю
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={pendingId === plan.id}
                    onClick={() => removeOne(plan.id)}
                  >
                    {pendingId === plan.id ? "Удаляем…" : "Удалить"}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </Screen>
  );
}

