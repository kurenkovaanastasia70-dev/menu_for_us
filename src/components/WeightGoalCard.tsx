import { Card } from "@/components/ui/card";
import type { WeightPlan } from "@/lib/nutrition/weight-goal";

export function WeightGoalCard({ plan }: { plan: WeightPlan }) {
  const lose = plan.direction === "lose";
  const gain = plan.direction === "gain";
  return (
    <Card>
      <h2 className="font-display text-xl">Цель по весу</h2>
      <div className="mt-3 grid grid-cols-2 gap-2 text-center">
        <Stat label="Сейчас" value={`${plan.currentKg} кг`} />
        <Stat label="Цель" value={`${plan.targetKg} кг`} />
        <Stat label={lose ? "Уйти" : gain ? "Набрать" : "Разница"} value={`${Math.abs(plan.deltaKg)} кг`} />
        <Stat label="Срок цели" value={plan.goalWeeks ? `${plan.goalWeeks} нед.` : plan.weeksToGoal ? `${plan.weeksToGoal} нед.` : "—"} />
      </div>
      <p className="mt-3 text-sm">{plan.summary}</p>
      <p className="mt-2 text-xs text-muted">{plan.menuDaysNote}</p>
      {!plan.safe && (
        <p className="mt-2 text-sm text-clay">
          Темп быстрее безопасного (~0.25–0.75 кг/нед.). Лучше увеличить срок.
        </p>
      )}
      <p className="mt-2 text-xs text-muted">Ориентир, не медицинская рекомендация.</p>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-cream px-2 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
