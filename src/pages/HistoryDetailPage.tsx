import { Screen } from "@/components/layout/Shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useApp } from "@/context/AppContext";
import { formatDateRange, formatRub } from "@/lib/cn";
import { planDateRange } from "@/lib/dates/week";
import type { OptimizationResult } from "@/lib/optimizer";
import { deleteMealPlan, fetchMealPlan, saveMealPlan } from "@/lib/supabase/api";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

export function HistoryDetailPage() {
  const { planId } = useParams();
  const { plans, household, refresh, latestPlan, currentWeekPlanId, setCurrentWeekPlan } = useApp();
  const navigate = useNavigate();
  const existing = plans.find((item) => item.id === planId);
  const [plan, setPlan] = useState(existing);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!planId || existing) return;
    fetchMealPlan(planId).then((row) => {
      if (row) setPlan(row);
    });
  }, [planId, existing]);

  if (!plan) return <Screen title="Неделя">Загрузка…</Screen>;
  const current = plan;
  const result = current.result_json as OptimizationResult;
  const isPinned = currentWeekPlanId === current.id;
  const isActive = latestPlan?.id === current.id;

  async function repeatFull() {
    if (!household) return;
    const range = planDateRange(current.days);
    const id = await saveMealPlan({
      householdId: household.id,
      startDate: range.startDate,
      endDate: range.endDate,
      days: current.days,
      budget: Number(current.budget),
      result,
    });
    setCurrentWeekPlan(null);
    await refresh();
    navigate(`/menu/${id}`);
  }

  async function remove() {
    if (!window.confirm("Удалить эту неделю из истории?")) return;
    setDeleting(true);
    try {
      await deleteMealPlan(current.id);
      if (currentWeekPlanId === current.id) setCurrentWeekPlan(null);
      await refresh();
      navigate("/history");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Screen title={formatDateRange(plan.start_date, plan.end_date)}>
      <Card>
        <div className="font-display text-3xl">{formatRub(plan.effective_price)}</div>
        <p className="mt-2 text-sm text-muted">
          {Math.round(plan.calories_per_day)} kcal · {Math.round(plan.protein_per_day)} g белка · {plan.days} дней
        </p>
        <label className="mt-4 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => {
              if (e.target.checked) setCurrentWeekPlan(current.id);
              else if (isPinned) setCurrentWeekPlan(null);
            }}
          />
          Текущая неделя (корзина)
        </label>
        {isActive && (
          <p className="mt-2 text-xs text-sage">
            {isPinned ? "Закреплена как текущая неделя" : "Активна как последняя генерация"}
          </p>
        )}
      </Card>
      <div className="mt-4 grid gap-2">
        <Button onClick={() => navigate(`/menu/${plan.id}`)}>Открыть меню</Button>
        <Button variant="secondary" onClick={() => navigate(`/cart/${plan.id}`)}>
          Открыть корзину
        </Button>
        <Button variant="ghost" onClick={repeatFull}>
          Повторить полностью
        </Button>
        <Button variant="ghost" onClick={() => navigate("/plan")}>
          Изменить бюджет / калории / блюда
        </Button>
        <Button variant="ghost" disabled={deleting} onClick={remove}>
          {deleting ? "Удаляем…" : "Удалить из истории"}
        </Button>
      </div>
    </Screen>
  );
}
