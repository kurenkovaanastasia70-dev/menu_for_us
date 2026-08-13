import { describe, expect, it } from "vitest";
import { buildTrainingPlan, capSessions, maxSessionsForGoal } from "./plan";

describe("training plans", () => {
  it("keeps rest days instead of filling the whole week", () => {
    const gain = buildTrainingPlan({ id: "1", name: "А", goal: "gain" });
    const lose = buildTrainingPlan({ id: "2", name: "Б", goal: "lose" });
    const maintain = buildTrainingPlan({ id: "3", name: "В", goal: "maintain" });
    expect(gain.sessions.length).toBeLessThanOrEqual(4);
    expect(lose.sessions.length).toBeLessThanOrEqual(4);
    expect(maintain.sessions.length).toBeLessThanOrEqual(3);
    expect(gain.sessions.length).toBeGreaterThanOrEqual(3);
    expect(new Set(lose.sessions.map((item) => item.dayIndex)).size).toBe(lose.sessions.length);
    expect(lose.scienceNote).toContain("ISSN");
    expect(gain.scienceNote.toLowerCase()).toContain("профицит");
  });

  it("caps overlapping or extra sessions by goal", () => {
    expect(maxSessionsForGoal("maintain")).toBe(3);
    const capped = capSessions("maintain", [
      { dayIndex: 0, title: "A", focus: "", durationMin: 40, intensity: "hard", blocks: [] },
      { dayIndex: 0, title: "dup", focus: "", durationMin: 40, intensity: "hard", blocks: [] },
      { dayIndex: 1, title: "B", focus: "", durationMin: 40, intensity: "hard", blocks: [] },
      { dayIndex: 2, title: "C", focus: "", durationMin: 40, intensity: "hard", blocks: [] },
      { dayIndex: 3, title: "D", focus: "", durationMin: 40, intensity: "hard", blocks: [] },
    ]);
    expect(capped).toHaveLength(3);
    expect(capped.map((item) => item.dayIndex)).toEqual([0, 1, 2]);
  });
});
