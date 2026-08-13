import type { Goal } from "@/lib/nutrition/calculator";
import { capSessions, type PersonTrainingPlan, type TrainingPerson, type WorkoutSession } from "./plan";

export interface LlmTrainingPayload {
  plans?: Array<{
    person_id?: string;
    personId?: string;
    weeklySummary?: string;
    scienceNote?: string;
    sessions?: Array<{
      dayIndex?: number;
      day?: number;
      title?: string;
      focus?: string;
      durationMin?: number;
      intensity?: WorkoutSession["intensity"];
      blocks?: Array<{ name?: string; detail?: string }>;
    }>;
  }>;
}

export function plansFromLlm(
  payload: LlmTrainingPayload | null | undefined,
  people: TrainingPerson[],
  fallback: PersonTrainingPlan[],
): PersonTrainingPlan[] {
  const raw = payload?.plans ?? [];
  return people.map((person, index) => {
    const fallbackPlan = fallback[index] ?? fallback[0];
    const match =
      raw.find((item) => item.person_id === person.id || item.personId === person.id) ?? raw[index];
    if (!match?.sessions?.length || !fallbackPlan) {
      return fallbackPlan;
    }
    const sessions = capSessions(
      person.goal,
      match.sessions.map((item) => {
        const fromDay = item.day != null ? Number(item.day) - 1 : 0;
        return {
          dayIndex: Number(item.dayIndex ?? fromDay),
          title: item.title || "Тренировка",
          focus: item.focus || "",
          durationMin: Number(item.durationMin) || 40,
          intensity: item.intensity === "hard" || item.intensity === "easy" ? item.intensity : "moderate",
          blocks: (item.blocks ?? []).map((block) => ({
            name: block.name || "Блок",
            detail: block.detail || "",
          })),
        };
      }),
    );
    if (sessions.length < 2) return fallbackPlan;
    return {
      personId: person.id,
      personName: person.name,
      goal: person.goal,
      weeklySummary: match.weeklySummary || fallbackPlan.weeklySummary,
      scienceNote: match.scienceNote || fallbackPlan.scienceNote,
      sessions,
    };
  });
}

export function goalLabel(goal: Goal): string {
  if (goal === "gain") return "массонабор";
  if (goal === "lose") return "похудение";
  return "поддержание";
}
