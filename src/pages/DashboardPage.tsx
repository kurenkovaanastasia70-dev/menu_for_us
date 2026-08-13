import { EmptyHint, Screen } from "@/components/layout/Shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useApp } from "@/context/AppContext";
import { formatRub } from "@/lib/cn";
import type { OptimizationResult } from "@/lib/optimizer";
import { useNavigate } from "react-router-dom";

const dayNames = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const mealLabels: Record<string, string> = {
  breakfast: "Завтрак",
  lunch: "Обед",
  dinner: "Ужин",
  snack: "Перекус",
};

export function DashboardPage() {
  const { latestPlan, members, household, error, offlineCache } = useApp();
  const navigate = useNavigate();
  const result = latestPlan?.result_json as OptimizationResult | undefined;
  const calories = latestPlan?.calories_per_day ?? members.reduce((sum, p) => sum + p.calorie_target, 0) / Math.max(members.length, 1);
  const protein = latestPlan?.protein_per_day ?? members.reduce((sum, p) => sum + Number(p.protein_target), 0) / Math.max(members.length, 1);

  return (
    <Screen title="Моя неделя">
      {error && <p className="mb-4 rounded-2xl bg-white px-4 py-3 text-sm text-clay">{error}{offlineCache ? " (кэш)" : ""}</p>}
      <Card className="bg-[linear-gradient(180deg,#fff, #f4eee4)]">
        <p className="text-sm text-muted">
          {members.length} {members.length === 1 ? "человек" : "человека"}
          {latestPlan ? ` · ${latestPlan.days} дней` : ""}
        </p>
        <div className="mt-3 flex items-end justify-between gap-4">
          <div>
            <div className="font-display text-4xl">{Math.round(calories)}</div>
            <div className="text-sm text-muted">kcal / день на пару</div>
          </div>
          <div className="text-right">
            <div className="font-display text-3xl">{formatRub(latestPlan?.effective_price ?? household?.default_budget ?? 0)}</div>
            <div className="text-sm text-muted">{Math.round(protein)} g protein</div>
          </div>
        </div>
        <div className="mt-5 grid gap-2">
          <Button onClick={() => navigate(latestPlan ? `/menu/${latestPlan.id}` : "/plan")}>
            Посмотреть меню
          </Button>
          <Button variant="secondary" onClick={() => navigate(latestPlan ? `/cart/${latestPlan.id}` : "/cart")}>
            Посмотреть корзину
          </Button>
          <Button variant="ghost" onClick={() => navigate("/plan")}>
            Составить новую неделю
          </Button>
        </div>
      </Card>

      {result ? (
        <div className="mt-6 space-y-4">
          {Array.from({ length: latestPlan!.days }).map((_, day) => {
            const meals = result.menu.filter((meal) => meal.dayIndex === day);
            return (
              <Card key={day}>
                <h2 className="text-sm font-semibold tracking-wide text-muted">{dayNames[day % 7]}</h2>
                <ul className="mt-2 space-y-2">
                  {meals.map((meal) => (
                    <li key={`${meal.dayIndex}-${meal.mealType}`} className="flex justify-between gap-3">
                      <span className="text-muted">{mealLabels[meal.mealType]}</span>
                      <span className="text-right font-medium">{meal.recipeName}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="mt-6">
          <EmptyHint text="Пока нет сохранённой недели." cta="Составить неделю" onClick={() => navigate("/plan")} />
        </div>
      )}
    </Screen>
  );
}
