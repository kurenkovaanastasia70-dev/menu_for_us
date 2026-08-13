import type { ActivityLevel, Gender, Goal } from "@/lib/nutrition/calculator";

export const WEEKDAY_NAMES = [
  "Понедельник",
  "Вторник",
  "Среда",
  "Четверг",
  "Пятница",
  "Суббота",
  "Воскресенье",
];

export interface WorkoutBlock {
  name: string;
  detail: string;
}

export interface WorkoutSession {
  dayIndex: number;
  title: string;
  focus: string;
  durationMin: number;
  intensity: "easy" | "moderate" | "hard";
  blocks: WorkoutBlock[];
}

export interface PersonTrainingPlan {
  personId: string;
  personName: string;
  goal: Goal;
  weeklySummary: string;
  scienceNote: string;
  sessions: WorkoutSession[];
}

export interface TrainingPerson {
  id: string;
  name: string;
  goal: Goal;
  gender?: Gender;
  ageYears?: number;
  weightKg?: number;
  activityLevel?: ActivityLevel;
}

export function maxSessionsForGoal(goal: Goal): number {
  if (goal === "maintain") return 3;
  if (goal === "gain") return 4;
  return 4;
}

export function capSessions(goal: Goal, sessions: WorkoutSession[]): WorkoutSession[] {
  const seen = new Set<number>();
  const unique: WorkoutSession[] = [];
  for (const item of sessions) {
    const day = Math.max(0, Math.min(6, Math.round(item.dayIndex)));
    if (seen.has(day)) continue;
    seen.add(day);
    unique.push({
      ...item,
      dayIndex: day,
      durationMin: Math.max(15, Math.min(90, Math.round(item.durationMin || 40))),
      intensity: item.intensity === "hard" || item.intensity === "easy" ? item.intensity : "moderate",
      blocks: (item.blocks ?? []).slice(0, 6).map((block) => ({
        name: block.name || "Блок",
        detail: block.detail || "",
      })),
    });
  }
  return unique.sort((a, b) => a.dayIndex - b.dayIndex).slice(0, maxSessionsForGoal(goal));
}

/**
 * Недельный план по ACSM/ISSN: 2–4 тренировки, остальные дни — отдых.
 * Не заполняем всю неделю нагрузкой.
 */
export function buildTrainingPlan(person: TrainingPerson, _days = 7): PersonTrainingPlan {
  if (person.goal === "gain") return massGainPlan(person);
  if (person.goal === "lose") return fatLossPlan(person);
  return maintainPlan(person);
}

export function buildTrainingPlans(people: TrainingPerson[], days = 7): PersonTrainingPlan[] {
  return people.map((person) => buildTrainingPlan(person, days));
}

function fatLossPlan(person: TrainingPerson): PersonTrainingPlan {
  const sessions = capSessions("lose", [
    session(0, "Силовая A: всё тело", "приседания, жим, тяга", 50, "hard", [
      { name: "Приседания или жим ногами", detail: "3–4×8–12, запас 1–3 повторения" },
      { name: "Жим лёжа / отжимания", detail: "3×8–12" },
      { name: "Тяга в наклоне / подтягивания", detail: "3×8–12" },
      { name: "Планка", detail: "3×30–45 сек" },
    ]),
    session(2, "Силовая B: верх + задняя цепь", "тяга, ягодичные", 50, "hard", [
      { name: "Румынская тяга / ягодичный мост", detail: "3–4×8–12" },
      { name: "Жим над головой", detail: "3×8–12" },
      { name: "Тяга горизонтальная", detail: "3×10–12" },
    ]),
    session(4, "Зона 2", "ходьба / велосипед", 35, "easy", [
      { name: "Кардио зона 2", detail: "можно говорить предложениями, 30–40 мин" },
    ]),
    session(5, "Силовая C: всё тело", "повторение паттернов", 45, "moderate", [
      { name: "Присед / выпад", detail: "3×8–12" },
      { name: "Жим или отжимания", detail: "3×8–12" },
      { name: "Тяга", detail: "3×8–12" },
    ]),
  ]);
  return {
    personId: person.id,
    personName: person.name,
    goal: "lose",
    weeklySummary: "4 тренировки и 3 дня отдыха. Силовые сохраняют мышцы в дефиците, одно кардио — без ежедневной гонки.",
    scienceNote:
      "Опора: ACSM 2–3+ силовых в неделю; ISSN — белок 1.6–2.2 г/кг в дефиците. Не нужно тренироваться каждый день.",
    sessions,
  };
}

function massGainPlan(person: TrainingPerson): PersonTrainingPlan {
  const sessions = capSessions("gain", [
    session(0, "Верх: жим", "грудь, плечи, трицепс", 55, "hard", [
      { name: "Жим лёжа или гантели", detail: "4×6–10, прогрессия веса" },
      { name: "Жим над головой", detail: "3×8–12" },
      { name: "Трицепс", detail: "3×10–12" },
    ]),
    session(1, "Низ: присед", "квадрицепс, ягодицы", 55, "hard", [
      { name: "Приседания", detail: "4×6–10" },
      { name: "Выпады или жим ногами", detail: "3×8–12" },
      { name: "Ягодичный мост", detail: "3×10–15" },
    ]),
    session(3, "Верх: тяга", "спина, бицепс", 55, "hard", [
      { name: "Подтягивания / тяга вертикальная", detail: "4×6–10" },
      { name: "Тяга штанги / гантели", detail: "3×8–12" },
      { name: "Бицепс + задняя дельта", detail: "3×10–15" },
    ]),
    session(4, "Низ: шарнир", "задняя цепь", 50, "hard", [
      { name: "Румынская тяга", detail: "4×6–10" },
      { name: "Сгибания ног / ягодицы", detail: "3×10–12" },
    ]),
  ]);
  return {
    personId: person.id,
    personName: person.name,
    goal: "gain",
    weeklySummary: "4 силовые и 3 дня отдыха. Ходьбу можно добавить в дни отдыха, но не как отдельную тяжёлую тренировку.",
    scienceNote:
      "Schoenfeld: 10–20 подходов/мышца/нед. ISSN: профицит ~250–500 ккал. Лишнее кардио мешает набору.",
    sessions,
  };
}

function maintainPlan(person: TrainingPerson): PersonTrainingPlan {
  const sessions = capSessions("maintain", [
    session(0, "Силовая всё тело", "базовые движения", 45, "moderate", [
      { name: "Присед", detail: "3×8–12" },
      { name: "Жим", detail: "3×8–12" },
      { name: "Тяга", detail: "3×8–12" },
    ]),
    session(3, "Зона 2", "здоровье сердца", 30, "easy", [{ name: "Ходьба или велосипед", detail: "25–35 мин" }]),
    session(5, "Силовая всё тело", "повтор паттернов", 45, "moderate", [
      { name: "Шарнир / румынская тяга", detail: "3×8–12" },
      { name: "Жим или отжимания", detail: "3×8–12" },
      { name: "Тяга", detail: "3×8–12" },
    ]),
  ]);
  return {
    personId: person.id,
    personName: person.name,
    goal: "maintain",
    weeklySummary: "3 тренировки и 4 дня отдыха. Достаточно, чтобы держать форму в режиме поддержания.",
    scienceNote: "ACSM: силовые ≥2 раза в неделю; 150 мин умеренной аэробики. Не нужно заполнять все дни.",
    sessions,
  };
}

function session(
  dayIndex: number,
  title: string,
  focus: string,
  durationMin: number,
  intensity: WorkoutSession["intensity"],
  blocks: WorkoutBlock[],
): WorkoutSession {
  return { dayIndex, title, focus, durationMin, intensity, blocks };
}
