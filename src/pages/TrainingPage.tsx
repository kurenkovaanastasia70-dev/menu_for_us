import { Screen } from "@/components/layout/Shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useApp } from "@/context/AppContext";
import { ageFromBirthDate } from "@/lib/nutrition/calculator";
import { saveTrainingPlans } from "@/lib/supabase/api";
import { goalLabel } from "@/lib/training/from-llm";
import { generateTrainingPlans } from "@/lib/training/generate";
import { WEEKDAY_NAMES, type PersonTrainingPlan, type TrainingPerson } from "@/lib/training/plan";
import { useEffect, useState } from "react";

const intensityLabel = {
  easy: "легко",
  moderate: "средне",
  hard: "тяжело",
};

export function TrainingPage() {
  const { household, members, trainingPlans, refresh } = useApp();
  const [plans, setPlans] = useState<PersonTrainingPlan[]>(trainingPlans);
  const [pending, setPending] = useState(false);
  const [warning, setWarning] = useState("");

  useEffect(() => {
    setPlans(trainingPlans);
  }, [trainingPlans]);

  async function generate() {
    if (members.length === 0) return;
    setPending(true);
    setWarning("");
    try {
      const people: TrainingPerson[] = members.map((member) => ({
        id: member.id,
        name: member.name,
        goal: member.goal,
        gender: member.gender,
        ageYears: ageFromBirthDate(member.birth_date),
        weightKg: Number(member.weight_kg),
        activityLevel: member.activity_level,
      }));
      const result = await generateTrainingPlans(people, true);
      setPlans(result.plans);
      if (result.warning) setWarning(result.warning);
      if (household) {
        await saveTrainingPlans(household.id, result.plans);
        await refresh();
      }
    } catch (err) {
      setWarning(err instanceof Error ? err.message : "Не удалось собрать план");
    } finally {
      setPending(false);
    }
  }

  const shown = plans.length > 0 ? plans : trainingPlans;

  return (
    <Screen title="Тренировки">
      <Card className="mb-4">
        <p className="text-sm">
          Это отдельный раздел: меню считается само, тренировки — сами. План пишет модель под цель из профиля
          (похудение / поддержание / массонабор). Не каждый день — тренировка, есть дни отдыха.
        </p>
        <p className="mt-2 text-xs text-muted">Ориентир, не персональная медрекомендация. Опора: ACSM, ISSN.</p>
        <Button className="mt-4 w-full" disabled={pending || members.length === 0} onClick={generate}>
          {pending ? "Считаем план…" : shown.length ? "Пересобрать план" : "Составить план тренировок"}
        </Button>
      </Card>
      {warning && <p className="mb-4 text-sm text-clay">{warning}</p>}
      {shown.length === 0 ? (
        <Card>Сначала заполните профили и нажмите «Составить план».</Card>
      ) : (
        shown.map((plan) => <TrainingWeek key={plan.personId} plan={plan} />)
      )}
    </Screen>
  );
}

export function TrainingWeek({ plan }: { plan: PersonTrainingPlan }) {
  const byDay = new Map(plan.sessions.map((session) => [session.dayIndex, session]));
  return (
    <Card className="mb-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-sage">{plan.personName}</p>
      <h2 className="font-display text-2xl">Неделя: {goalLabel(plan.goal)}</h2>
      <p className="mt-2 text-sm">{plan.weeklySummary}</p>
      <p className="mt-2 text-xs text-muted">{plan.scienceNote}</p>
      <ul className="mt-4 space-y-3">
        {WEEKDAY_NAMES.map((dayName, dayIndex) => {
          const session = byDay.get(dayIndex);
          if (!session) {
            return (
              <li key={dayIndex} className="rounded-2xl border border-dashed border-line px-3 py-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted">{dayName}</div>
                <div className="font-semibold text-muted">Отдых</div>
              </li>
            );
          }
          return (
            <li key={dayIndex} className="rounded-2xl bg-cream p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted">
                {dayName} · {session.durationMin} мин · {intensityLabel[session.intensity]}
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
          );
        })}
      </ul>
    </Card>
  );
}
