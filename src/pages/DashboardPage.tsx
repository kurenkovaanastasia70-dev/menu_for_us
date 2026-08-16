import { EmptyHint, Screen } from "@/components/layout/Shell";
import { WeightGoalCard } from "@/components/WeightGoalCard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useApp } from "@/context/AppContext";
import { formatDateRange, formatRub } from "@/lib/cn";
import { dayLabelForPlan } from "@/lib/dates/week";
import { ageFromBirthDate, calculateNutritionTargets } from "@/lib/nutrition/calculator";
import { calculateWeightPlan } from "@/lib/nutrition/weight-goal";
import type { OptimizationResult } from "@/lib/optimizer";
import { useNavigate } from "react-router-dom";

const mealLabels: Record<string, string> = {
  breakfast: "Завтрак",
  lunch: "Обед",
  dinner: "Ужин",
  snack: "Перекус",
};

export function DashboardPage() {
  const { latestPlan, members, household, error, offlineCache, currentWeekPlanId } = useApp();
  const navigate = useNavigate();
  const result = latestPlan?.result_json as OptimizationResult | undefined;
  const calories = members.reduce((sum, p) => sum + p.calorie_target, 0);
  const names = members.map((member) => member.name).join(" и ");
  const isPinned = Boolean(latestPlan && currentWeekPlanId === latestPlan.id);

  return (
    <Screen title="Моя неделя">
      {error && (
        <p className="mb-4 rounded-2xl bg-white px-4 py-3 text-sm text-clay">
          {error}
          {offlineCache ? " (кэш)" : ""}
        </p>
      )}
      <Card>
        <p className="text-sm font-semibold text-sage">Меню на пару</p>
        <p className="mt-1 text-sm text-muted">
          {members.length < 2
            ? "Пока заполнен один профиль. Пригласите второго человека кодом в разделе Профиль — порции тогда будут на двоих."
            : `Считаем сразу на двоих: ${names}. Калории, БЖУ, клетчатка и железо складываются.`}
        </p>
        <div className="mt-4 flex items-end justify-between gap-4">
          <div>
            <div className="font-display text-4xl">{Math.round(latestPlan?.calories_per_day ?? calories)}</div>
            <div className="text-sm text-muted">kcal / день на пару</div>
          </div>
          <div className="text-right">
            <div className="font-display text-3xl">
              {formatRub(latestPlan?.effective_price ?? household?.default_budget ?? 0)}
            </div>
            <div className="text-sm text-muted">
              {latestPlan
                ? formatDateRange(latestPlan.start_date, latestPlan.end_date)
                : "бюджет"}
            </div>
          </div>
        </div>
        <div className="mt-4 space-y-2 text-sm">
          {members.map((member) => (
            <div key={member.id} className="flex justify-between rounded-2xl bg-cream px-3 py-2">
              <span>{member.name}</span>
              <span>
                {member.calorie_target} kcal · {member.fiber_target ?? 25} г клетч. · {member.iron_target ?? 8} мг Fe
              </span>
            </div>
          ))}
        </div>
        {latestPlan && (
          <p className="mt-4 text-sm text-muted">
            Корзина из {isPinned ? "закреплённой текущей недели" : "последней генерации"}. Отметить другую — в
            Истории.
          </p>
        )}
        <div className="mt-5 grid gap-2">
          <Button onClick={() => navigate("/plan")}>Составить меню на пару</Button>
          <Button variant="secondary" onClick={() => navigate(latestPlan ? `/menu/${latestPlan.id}` : "/plan")}>
            Посмотреть меню
          </Button>
          <Button variant="secondary" onClick={() => navigate("/training")}>
            Тренировки
          </Button>
          <Button variant="ghost" onClick={() => navigate("/products")}>
            Каталог продуктов
          </Button>
          <Button variant="ghost" onClick={() => navigate("/profile")}>
            Цель и трекер веса
          </Button>
          <Button variant="ghost" onClick={() => navigate(latestPlan ? `/cart/${latestPlan.id}` : "/cart")}>
            Корзина
          </Button>
        </div>
      </Card>

      <div className="mt-4 space-y-3">
        {members.map((member) => {
          const nutrition = calculateNutritionTargets({
            gender: member.gender,
            ageYears: ageFromBirthDate(member.birth_date),
            heightCm: Number(member.height_cm),
            weightKg: Number(member.weight_kg),
            activityLevel: member.activity_level,
            goal: member.goal,
            targetWeightKg: Number(member.target_weight_kg ?? member.weight_kg),
            goalWeeks: member.goal_weeks ?? undefined,
          });
          const plan = calculateWeightPlan({
            currentKg: Number(member.weight_kg),
            targetKg: Number(member.target_weight_kg ?? member.weight_kg),
            tdee: nutrition.tdee,
            calorieTarget: member.calorie_target,
            goal: member.goal,
            goalWeeks: member.goal_weeks ?? undefined,
            menuDays: latestPlan?.days ?? household?.default_days ?? 7,
          });
          return (
            <div key={`goal-${member.id}`}>
              <p className="mb-2 text-sm font-semibold">{member.name}</p>
              <WeightGoalCard plan={plan} />
            </div>
          );
        })}
      </div>

      {result ? (
        <div className="mt-6 space-y-4">
          {Array.from({ length: latestPlan!.days }).map((_, day) => {
            const meals = result.menu.filter((meal) => meal.dayIndex === day);
            return (
              <Card key={day}>
                <h2 className="text-sm font-semibold tracking-wide text-muted">
                  {dayLabelForPlan(latestPlan!.start_date, day, "short")}
                </h2>
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
          <EmptyHint
            text="Нет сохранённой недели. Нажмите «Составить меню на пару» — порции будут на всех, кто в профилях."
            cta="Составить меню на пару"
            onClick={() => navigate("/plan")}
          />
        </div>
      )}
    </Screen>
  );
}
