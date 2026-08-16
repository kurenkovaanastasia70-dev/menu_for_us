/** Local calendar helpers (avoid UTC shift from toISOString). */

const DAY_SHORT = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const DAY_LONG = [
  "Воскресенье",
  "Понедельник",
  "Вторник",
  "Среда",
  "Четверг",
  "Пятница",
  "Суббота",
];

export function toLocalDateISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseLocalDateISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + days);
  return next;
}

/** Понедельник недели (локально), в которой лежит `date`. */
export function startOfWeekMonday(date = new Date()): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay(); // 0 = вс
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

export function planDateRange(days: number, from = new Date()): {
  start: Date;
  end: Date;
  startDate: string;
  endDate: string;
} {
  const start = startOfWeekMonday(from);
  const end = addDays(start, Math.max(1, days) - 1);
  return {
    start,
    end,
    startDate: toLocalDateISO(start),
    endDate: toLocalDateISO(end),
  };
}

export function dayLabelForPlan(
  startDate: string,
  dayIndex: number,
  style: "short" | "long" = "long",
): string {
  const date = addDays(parseLocalDateISO(startDate), dayIndex);
  const names = style === "short" ? DAY_SHORT : DAY_LONG;
  return names[date.getDay()] ?? `День ${dayIndex + 1}`;
}

export function planCoversDate(
  plan: { start_date: string; end_date: string },
  date = new Date(),
): boolean {
  const iso = toLocalDateISO(date);
  return plan.start_date <= iso && plan.end_date >= iso;
}

/** Меню на текущую календарную неделю; устаревшие планы не подставляем. */
export function pickCurrentWeekPlan<T extends { start_date: string; end_date: string; created_at?: string }>(
  plans: T[],
  date = new Date(),
): T | null {
  const covering = plans.filter((plan) => planCoversDate(plan, date));
  if (covering.length === 0) return null;
  return covering.sort((a, b) => {
    if (a.start_date !== b.start_date) return b.start_date.localeCompare(a.start_date);
    return (b.created_at ?? "").localeCompare(a.created_at ?? "");
  })[0];
}

const CURRENT_WEEK_KEY = (householdId: string) => `menu-for-us-current-week:${householdId}`;

export function readCurrentWeekPlanId(householdId: string): string | null {
  try {
    return localStorage.getItem(CURRENT_WEEK_KEY(householdId));
  } catch {
    return null;
  }
}

export function writeCurrentWeekPlanId(householdId: string, planId: string | null) {
  try {
    if (!planId) localStorage.removeItem(CURRENT_WEEK_KEY(householdId));
    else localStorage.setItem(CURRENT_WEEK_KEY(householdId), planId);
  } catch {
    /* ignore quota */
  }
}

/**
 * План для экрана «Моя неделя» и корзины:
 * — если отмечена «текущая неделя» и план ещё есть — его;
 * — иначе последняя генерация.
 */
export function resolveActivePlan<T extends { id: string }>(
  plans: T[],
  pinnedPlanId: string | null,
): T | null {
  if (pinnedPlanId) {
    const pinned = plans.find((plan) => plan.id === pinnedPlanId);
    if (pinned) return pinned;
  }
  return plans[0] ?? null;
}
