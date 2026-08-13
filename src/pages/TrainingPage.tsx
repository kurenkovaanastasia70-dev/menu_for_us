import { Screen } from "@/components/layout/Shell";
import { Card } from "@/components/ui/card";
import { useApp } from "@/context/AppContext";
import type { OptimizationResult } from "@/lib/optimizer";
import { buildTrainingPlans, type PersonTrainingPlan } from "@/lib/training/plan";

const dayNames = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];
const intensityLabel = {
  easy: "легко",
  moderate: "средне",
  hard: "тяжело",
};

export function TrainingPage() {
  const { latestPlan, members } = useApp();
  const stored = (latestPlan?.result_json as OptimizationResult | undefined)?.trainingPlans;
  const plans =
    stored && stored.length > 0
      ? stored
      : buildTrainingPlans(
          members.map((member) => ({ id: member.id, name: member.name, goal: member.goal })),
          latestPlan?.days ?? 7,
        );

  return (
    <Screen title="Тренировки">
      <p className="mb-4 text-sm text-muted">
        План считается по цели человека (похудение / поддержание / массонабор), не нейросетью. Опора: ACSM, ISSN,
        исследования гипертрофии Schoenfeld. Это ориентир, не персональная медрекомендация.
      </p>
      {plans.length === 0 ? (
        <Card>Сначала заполните профили.</Card>
      ) : (
        plans.map((plan) => <TrainingCard key={plan.personId} plan={plan} />)
      )}
    </Screen>
  );
}

export function TrainingCard({ plan }: { plan: PersonTrainingPlan }) {
  const goalLabel = plan.goal === "gain" ? "массонабор" : plan.goal === "lose" ? "похудение" : "поддержание";
  return (
    <Card className="mb-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-sage">{plan.personName}</p>
      <h2 className="font-display text-2xl">Неделя: {goalLabel}</h2>
      <p className="mt-2 text-sm">{plan.weeklySummary}</p>
      <p className="mt-2 text-xs text-muted">{plan.scienceNote}</p>
      <ul className="mt-4 space-y-3">
        {plan.sessions.map((session) => (
          <li key={`${plan.personId}-${session.dayIndex}`} className="rounded-2xl bg-cream p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">
              {dayNames[session.dayIndex % 7]} · {session.durationMin} мин · {intensityLabel[session.intensity]}
            </div>
            <div className="font-semibold">{session.title}</div>
            <div className="text-xs text-muted">{session.focus}</div>
            <ul className="mt-2 space-y-1 text-sm">
              {session.blocks.map((block) => (
                <li key={block.name}>
                  <span className="font-medium">{block.name}.</span> {block.detail}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </Card>
  );
}
