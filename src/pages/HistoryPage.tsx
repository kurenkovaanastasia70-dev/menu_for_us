import { Screen } from "@/components/layout/Shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useApp } from "@/context/AppContext";
import { formatDateRange, formatRub } from "@/lib/cn";
import type { OptimizationResult } from "@/lib/optimizer";
import { saveMealPlan } from "@/lib/supabase/api";
import { useNavigate } from "react-router-dom";

export function HistoryPage() {
  const { plans, household, refresh } = useApp();
  const navigate = useNavigate();

  async function repeat(planId: string, mutate?: "budget" | "menu") {
    const plan = plans.find((item) => item.id === planId);
    if (!plan || !household) return;
    if (mutate === "budget" || mutate === "menu") {
      navigate("/plan");
      return;
    }
    const start = new Date();
    const end = new Date();
    end.setDate(start.getDate() + plan.days - 1);
    const id = await saveMealPlan({
      householdId: household.id,
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
      days: plan.days,
      budget: Number(plan.budget),
      result: plan.result_json as OptimizationResult,
    });
    await refresh();
    navigate(`/menu/${id}`);
  }

  return (
    <Screen title="История">
      {plans.length === 0 ? (
        <p className="text-muted">Пока нет сохранённых недель.</p>
      ) : (
        <div className="space-y-3">
          {plans.map((plan) => (
            <Card key={plan.id}>
              <button className="w-full text-left" onClick={() => navigate(`/history/${plan.id}`)}>
                <div className="text-sm text-muted">{formatDateRange(plan.start_date, plan.end_date)}</div>
                <div className="mt-1 flex items-end justify-between">
                  <div className="font-display text-2xl">{formatRub(plan.effective_price)}</div>
                  <div className="text-sm text-muted">{plan.days} дней</div>
                </div>
              </button>
              <Button className="mt-3 w-full" variant="secondary" onClick={() => repeat(plan.id)}>
                Повторить неделю
              </Button>
            </Card>
          ))}
        </div>
      )}
    </Screen>
  );
}
