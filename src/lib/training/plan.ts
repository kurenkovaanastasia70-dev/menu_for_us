import type { Goal } from "@/lib/nutrition/calculator";

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
}

/**
 * Недельный план по ACSM/ISSN: силовые 3–5 раз, зона 2, шаги.
 * Массонабор — больше объёма и меньше лишнего кардио, чтобы не съедать профицит.
 */
export function buildTrainingPlan(person: TrainingPerson, days: number): PersonTrainingPlan {
  const length = Math.max(5, Math.min(14, days));
  if (person.goal === "gain") return massGainPlan(person, length);
  if (person.goal === "lose") return fatLossPlan(person, length);
  return maintainPlan(person, length);
}

export function buildTrainingPlans(people: TrainingPerson[], days: number): PersonTrainingPlan[] {
  return people.map((person) => buildTrainingPlan(person, days));
}

function fatLossPlan(person: TrainingPerson, days: number): PersonTrainingPlan {
  const sessions = fillWeek(days, [
    session(0, "Силовая A: всё тело", "приседания, жим, тяга", 50, "hard", [
      { name: "Приседания или жим ногами", detail: "3–4×8–12, близко к отказу с запасом 1–3 повторения (RIR)" },
      { name: "Жим лёжа / отжимания", detail: "3×8–12" },
      { name: "Тяга в наклоне / подтягивания", detail: "3×8–12" },
      { name: "Планка", detail: "3×30–45 сек" },
    ]),
    session(1, "Зона 2", "ходьба / велосипед", 35, "easy", [
      { name: "Кардио зона 2", detail: "можно говорить предложениями, пульс примерно 60–70% от макс." },
      { name: "Шаги", detail: "цель дня 8–10 тысяч" },
    ]),
    session(2, "Силовая B: верх + задняя цепь", "тяга, ягодичные", 50, "hard", [
      { name: "Румынская тяга / ягодичный мост", detail: "3–4×8–12" },
      { name: "Жим над головой", detail: "3×8–12" },
      { name: "Тяга горизонтальная", detail: "3×10–12" },
      { name: "Выпады", detail: "3×8–10 на ногу" },
    ]),
    session(4, "Силовая C: всё тело", "повторение паттернов", 45, "moderate", [
      { name: "Присед / выпад", detail: "3×8–12" },
      { name: "Жим или отжимания", detail: "3×8–12" },
      { name: "Тяга", detail: "3×8–12" },
    ]),
    session(5, "Зона 2 или прогулка", "NEAT", 40, "easy", [
      { name: "Ходьба", detail: "30–40 мин, без силовой в этот день" },
    ]),
  ]);
  return {
    personId: person.id,
    personName: person.name,
    goal: "lose",
    weeklySummary: "3 силовые + 2 лёгких кардио. Силовые сохраняют мышцы в дефиците, зона 2 помогает расходу без сильного голода.",
    scienceNote:
      "Опора: ACSM по частоте силовых 2–3+ раза в неделю; ISSN — белок 1.6–2.2 г/кг в дефиците; зона 2 не заменяет силовые.",
    sessions,
  };
}

function massGainPlan(person: TrainingPerson, days: number): PersonTrainingPlan {
  const sessions = fillWeek(days, [
    session(0, "Верх: жим", "грудь, плечи, трицепс", 55, "hard", [
      { name: "Жим лёжа или гантели", detail: "4×6–10, прогрессия веса каждую неделю по возможности" },
      { name: "Жим над головой", detail: "3×8–12" },
      { name: "Разведения / пек-дек", detail: "3×10–15" },
      { name: "Трицепс", detail: "3×10–12" },
    ]),
    session(1, "Низ: присед", "квадрицепс, ягодицы", 55, "hard", [
      { name: "Приседания", detail: "4×6–10" },
      { name: "Выпады или жим ногами", detail: "3×8–12" },
      { name: "Разгибания / ягодичный мост", detail: "3×10–15" },
    ]),
    session(2, "Прогулка", "восстановление", 30, "easy", [
      { name: "Ходьба", detail: "20–30 мин. Не урезайте калории кардио — профицит нужен для массы." },
    ]),
    session(3, "Верх: тяга", "спина, бицепс", 55, "hard", [
      { name: "Подтягивания / тяга вертикальная", detail: "4×6–10" },
      { name: "Тяга штанги / гантели", detail: "3×8–12" },
      { name: "Бицепс + задняя дельта", detail: "3×10–15" },
    ]),
    session(4, "Низ: шарнир", "задняя цепь", 50, "hard", [
      { name: "Румынская тяга", detail: "4×6–10" },
      { name: "Сгибания ног / ягодицы", detail: "3×10–12" },
      { name: "Икры", detail: "3×10–15" },
    ]),
  ]);
  return {
    personId: person.id,
    personName: person.name,
    goal: "gain",
    weeklySummary: "4 силовые (верх/низ) и короткая ходьба. Объём ~10–20 рабочих подходов на крупные группы за неделю, прогрессия нагрузки.",
    scienceNote:
      "Schoenfeld: гипертрофия при 10–20 подходах/мышца/нед. ISSN: профицит ~250–500 ккал, белок 1.6–2.2 г/кг. Лишнее кардио мешает набору.",
    sessions,
  };
}

function maintainPlan(person: TrainingPerson, days: number): PersonTrainingPlan {
  const sessions = fillWeek(days, [
    session(0, "Силовая всё тело", "базовые движения", 45, "moderate", [
      { name: "Присед", detail: "3×8–12" },
      { name: "Жим", detail: "3×8–12" },
      { name: "Тяга", detail: "3×8–12" },
    ]),
    session(2, "Зона 2", "здоровье сердца", 30, "easy", [{ name: "Ходьба или велосипед", detail: "25–35 мин" }]),
    session(4, "Силовая всё тело", "повтор паттернов", 45, "moderate", [
      { name: "Шарнир / румынская тяга", detail: "3×8–12" },
      { name: "Жим или отжимания", detail: "3×8–12" },
      { name: "Тяга", detail: "3×8–12" },
    ]),
  ]);
  return {
    personId: person.id,
    personName: person.name,
    goal: "maintain",
    weeklySummary: "2–3 силовые и одна зона 2. Этого достаточно, чтобы держать мышцы и здоровье без гонки объёма.",
    scienceNote: "ACSM: силовые ≥2 раза в неделю на основные группы; 150 мин умеренной аэробики в неделю.",
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

function fillWeek(days: number, template: WorkoutSession[]): WorkoutSession[] {
  return template
    .filter((item) => item.dayIndex < days)
    .map((item) => ({ ...item, blocks: item.blocks.map((block) => ({ ...block })) }));
}
