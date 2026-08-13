import { describe, expect, it } from "vitest";
import { buildTrainingPlan } from "./plan";

describe("training plans", () => {
  it("gives mass-gain more lifting than fat-loss cardio bias", () => {
    const gain = buildTrainingPlan({ id: "1", name: "А", goal: "gain" }, 7);
    const lose = buildTrainingPlan({ id: "2", name: "Б", goal: "lose" }, 7);
    expect(gain.sessions.length).toBeGreaterThanOrEqual(4);
    expect(gain.weeklySummary.toLowerCase()).toContain("сил");
    expect(lose.scienceNote).toContain("ISSN");
    expect(gain.scienceNote.toLowerCase()).toContain("профицит");
  });

  it("does not schedule sessions past the planning window", () => {
    const plan = buildTrainingPlan({ id: "1", name: "А", goal: "maintain" }, 5);
    expect(plan.sessions.every((session) => session.dayIndex < 5)).toBe(true);
  });
});
