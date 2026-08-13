import { requestWorker } from "@/lib/llm/client";
import { plansFromLlm, type LlmTrainingPayload } from "./from-llm";
import { buildTrainingPlans, type PersonTrainingPlan, type TrainingPerson } from "./plan";

export async function generateTrainingPlans(
  people: TrainingPerson[],
  useLlm = true,
): Promise<{ plans: PersonTrainingPlan[]; source: "llm" | "fallback"; warning?: string }> {
  const fallback = buildTrainingPlans(people);
  if (!useLlm || people.length === 0) {
    return { plans: fallback, source: "fallback" };
  }

  const worker = await requestWorker<{ ok?: boolean; plans?: LlmTrainingPayload["plans"]; error?: string }>(
    "/api/generate-training",
    {
      people: people.map((person) => ({
        id: person.id,
        name: person.name,
        goal: person.goal,
        gender: person.gender,
        ageYears: person.ageYears,
        weightKg: person.weightKg,
        activityLevel: person.activityLevel,
      })),
    },
  );

  if (!worker.ok || !worker.data.plans) {
    return {
      plans: fallback,
      source: "fallback",
      warning: "Модель недоступна — показан запасной план по цели. В GitHub только VITE_API_URL воркера.",
    };
  }

  return {
    plans: plansFromLlm({ plans: worker.data.plans }, people, fallback),
    source: "llm",
  };
}
