import { Screen } from "@/components/layout/Shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useApp } from "@/context/AppContext";
import { formatDateRange, formatRub } from "@/lib/cn";
import type { OptimizationResult } from "@/lib/optimizer";
import { fetchMealPlan, saveMealPlan } from "@/lib/supabase/api";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

export function HistoryDetailPage() {
  const { planId } = useParams();
  const { plans, household, refresh } = useApp();
  const navigate = useNavigate();
  const existing = plans.find((item) => item.id === planId);
  const [plan, setPlan] = useState(existing);

  useEffect(() => {
    if (!planId || existing) return;
    fetchMealPlan(planId).then((row) => {
      if (row) setPlan(row);
    });
  }, [planId, existing]);

  if (!plan) return <Screen title="Неделя">Загрузка…</Screen>;
  const current = plan;
  const result = current.result_json as OptimizationResult;

  async function repeatFull() {
    if (!household) return;
    const start = new Date();
    const end = new Date();
    end.setDate(start.getDate() + current.days - 1);
    const id = await saveMealPlan({
      householdId: household.id,
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
      days: current.days,
      budget: Number(current.budget),
      result,
    });
    await refresh();
    navigate(`/menu/${id}`);
  }

  return (
    <Screen title={formatDateRange(plan.start_date, plan.end_date)}>
      <Card>
        <div className="font-display text-3xl">{formatRub(plan.effective_price)}</div>
        <p className="mt-2 text-sm text-muted">
          {Math.round(plan.calories_per_day)} kcal · {Math.round(plan.protein_per_day)} g белка · {plan.days} дней
        </p>
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
      </div>
    </Screen>
  );
}
