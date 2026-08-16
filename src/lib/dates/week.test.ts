import { describe, expect, it } from "vitest";
import {
  dayLabelForPlan,
  parseLocalDateISO,
  pickCurrentWeekPlan,
  planDateRange,
  resolveActivePlan,
  startOfWeekMonday,
  toLocalDateISO,
} from "./week";

describe("week dates", () => {
  it("starts the plan week on Monday", () => {
    // 2026-08-16 is Sunday
    const sunday = parseLocalDateISO("2026-08-16");
    const range = planDateRange(7, sunday);
    expect(range.startDate).toBe("2026-08-10");
    expect(range.endDate).toBe("2026-08-16");
    expect(startOfWeekMonday(sunday).getDay()).toBe(1);
  });

  it("labels days from start_date, not a fixed Mon grid", () => {
    expect(dayLabelForPlan("2026-08-12", 0, "short")).toBe("Ср");
    expect(dayLabelForPlan("2026-08-12", 1, "long")).toBe("Четверг");
  });

  it("picks only a plan that covers today", () => {
    const today = parseLocalDateISO("2026-08-16");
    const plans = [
      { id: "old", start_date: "2026-08-01", end_date: "2026-08-07", created_at: "2026-08-01" },
      { id: "now", start_date: "2026-08-10", end_date: "2026-08-16", created_at: "2026-08-10" },
    ];
    expect(pickCurrentWeekPlan(plans, today)?.id).toBe("now");
    expect(pickCurrentWeekPlan([plans[0]], today)).toBeNull();
  });

  it("resolves active plan as pinned or latest generation", () => {
    const plans = [{ id: "new" }, { id: "old" }];
    expect(resolveActivePlan(plans, null)?.id).toBe("new");
    expect(resolveActivePlan(plans, "old")?.id).toBe("old");
    expect(resolveActivePlan(plans, "missing")?.id).toBe("new");
  });

  it("formats local ISO without UTC shift", () => {
    const d = new Date(2026, 7, 16, 1, 0, 0);
    expect(toLocalDateISO(d)).toBe("2026-08-16");
  });
});
