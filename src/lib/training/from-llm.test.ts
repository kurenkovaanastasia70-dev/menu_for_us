import { describe, expect, it } from "vitest";
import { plansFromLlm } from "./from-llm";
import { buildTrainingPlans } from "./plan";

describe("training from LLM", () => {
  const people = [{ id: "p1", name: "Аня", goal: "lose" as const }];
  const fallback = buildTrainingPlans(people);

  it("uses fallback when payload is empty", () => {
    expect(plansFromLlm({ plans: [] }, people, fallback)).toEqual(fallback);
  });

  it("keeps at most four unique days even if the model fills the week", () => {
    const plans = plansFromLlm(
      {
        plans: [
          {
            person_id: "p1",
            weeklySummary: "Нейросеть",
            sessions: Array.from({ length: 7 }, (_, dayIndex) => ({
              dayIndex,
              title: `День ${dayIndex}`,
              focus: "всё",
              durationMin: 40,
              intensity: "hard" as const,
              blocks: [{ name: "Блок", detail: "3×10" }],
            })),
          },
        ],
      },
      people,
      fallback,
    );
    expect(plans[0].sessions).toHaveLength(4);
    expect(plans[0].weeklySummary).toBe("Нейросеть");
  });
});
