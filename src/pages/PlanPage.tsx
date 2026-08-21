import { Screen } from "@/components/layout/Shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/field";
import { useApp } from "@/context/AppContext";
import { STORES } from "@/lib/optimizer";
import type { EatingOutSlot } from "@/lib/optimizer/types";
import { generateWeek } from "@/lib/planning/generate-week";
import {
  cashbackInput,
  constraintsFromProfiles,
  couplePeopleForPlan,
  couplePlannerSlots,
} from "@/lib/planning/from-profiles";
import { dayLabelForPlan, planDateRange } from "@/lib/dates/week";
import { saveMealPlan } from "@/lib/supabase/api";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

const mealLabels: Record<string, string> = {
  breakfast: "Завтрак",
  lunch: "Обед",
  dinner: "Ужин",
  snack: "Перекус",
};

const PARTNER_DRAFT_KEY = "menu_for_us_partner_draft";

function loadPartnerDraft(householdId?: string | null) {
  if (!householdId || typeof localStorage === "undefined") {
    return { name: "Партнёр", calorieTarget: 2000 };
  }
  try {
    const raw = localStorage.getItem(`${PARTNER_DRAFT_KEY}:${householdId}`);
    if (!raw) return { name: "Партнёр", calorieTarget: 2000 };
    const parsed = JSON.parse(raw) as { name?: string; calorieTarget?: number };
    return {
      name: parsed.name?.trim() || "Партнёр",
      calorieTarget: Math.max(1200, Number(parsed.calorieTarget) || 2000),
    };
  } catch {
    return { name: "Партнёр", calorieTarget: 2000 };
  }
}

export function PlanPage() {
  const { household, members, cashback, profile, fridge, customProducts, refresh, setCurrentWeekPlan } = useApp();
  const navigate = useNavigate();
  const [days, setDays] = useState(household?.default_days ?? 7);
  const [budget, setBudget] = useState(household?.default_budget ?? 6000);
  const [meals, setMeals] = useState(profile?.meals_per_day ?? 3);
  const [cookTime, setCookTime] = useState(profile?.max_cooking_time ?? 40);
  const [sessions, setSessions] = useState(profile?.cooking_sessions ?? 3);
  const [variety, setVariety] = useState<"low" | "medium" | "high">("medium");
  const [stores, setStores] = useState<string[]>(household?.preferred_stores ?? ["pyaterochka", "magnit"]);
  const [eatingOut, setEatingOut] = useState<Set<string>>(new Set());
  const [quickLunches, setQuickLunches] = useState(false);
  const [quickBreakfasts, setQuickBreakfasts] = useState(true);
  const [partnerName, setPartnerName] = useState("Партнёр");
  const [partnerCalories, setPartnerCalories] = useState(2000);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const draft = loadPartnerDraft(household?.id);
    setPartnerName(draft.name);
    setPartnerCalories(draft.calorieTarget);
  }, [household?.id]);

  useEffect(() => {
    if (!household?.id || members.length >= 2) return;
    localStorage.setItem(
      `${PARTNER_DRAFT_KEY}:${household.id}`,
      JSON.stringify({ name: partnerName, calorieTarget: partnerCalories }),
    );
  }, [household?.id, members.length, partnerName, partnerCalories]);

  const selectedStores = useMemo(() => new Set(stores), [stores]);
  const partnerDraft = useMemo(
    () => ({ id: "partner-draft", name: partnerName, calorieTarget: partnerCalories }),
    [partnerName, partnerCalories],
  );
  const planners = useMemo(
    () => couplePlannerSlots(members, partnerDraft),
    [members, partnerDraft],
  );
  const names = planners.map((person) => person.name).join(" и ");
  const mealTypes = useMemo(() => {
    const types: Array<"breakfast" | "lunch" | "dinner" | "snack"> = ["breakfast", "lunch", "dinner"].slice(
      0,
      Math.min(3, Math.max(2, Number(meals))),
    ) as Array<"breakfast" | "lunch" | "dinner" | "snack">;
    types.push("snack");
    return types;
  }, [meals]);

  const weekStartDate = useMemo(() => planDateRange(Number(days)).startDate, [days]);

  function slotKey(personId: string, dayIndex: number, mealType: string) {
    return `${personId}:${dayIndex}:${mealType}`;
  }

  function toggleSlot(personId: string, dayIndex: number, mealType: string) {
    const key = slotKey(personId, dayIndex, mealType);
    setEatingOut((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function run() {
    if (!household || members.length === 0) {
      setError("Сначала заполните профили пары.");
      return;
    }
    setPending(true);
    setError("");
    try {
      const eatingOutSlots: EatingOutSlot[] = [...eatingOut].map((key) => {
        const [personId, day, mealType] = key.split(":");
        return {
          personId,
          dayIndex: Number(day),
          mealType: mealType as EatingOutSlot["mealType"],
        };
      });
      const people = couplePeopleForPlan(members, partnerDraft);
      const constraints = constraintsFromProfiles(members, household);
      const result = await generateWeek({
        people,
        days: Number(days),
        budget: Number(budget),
        cashback: cashbackInput(cashback),
        fridge: fridge.map((item) => ({ productId: item.product_id, grams: item.grams })),
        customProducts,
        useLlm: true,
        constraints: {
          ...constraints,
          mealsPerDay: Number(meals),
          maxCookingTime: Number(cookTime),
          maxCookingSessions: Number(sessions),
          preferredStoreIds: [...selectedStores],
          varietyPreference: variety,
          eatingOutSlots,
          quickLunches,
          quickBreakfasts,
        },
      });
      const start = planDateRange(Number(days));
      const id = await saveMealPlan({
        householdId: household.id,
        startDate: start.startDate,
        endDate: start.endDate,
        days: Number(days),
        budget: Number(budget),
        result,
      });
      setCurrentWeekPlan(null);
      await refresh();
      navigate(`/menu/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось рассчитать неделю");
    } finally {
      setPending(false);
    }
  }

  return (
    <Screen title="Меню на пару">
      <Card className="mb-4">
        <p className="text-sm">
          Один человек может заполнить всё за двоих: ниже два отдельных блока «ем не дома» для {names}. Блюдо общее,
          граммовки на тарелке — свои.
        </p>
        <p className="mt-2 text-sm text-muted">
          Цены берутся из расширенного каталога в стиле Магнит/Пятёрочка (типичные ценники на 1 августа 2026) плюс ваш
          cashback. Это не парсинг сайта магазина. Модель сразу видит цены и упаковки; код потом дотачивает корзину.
        </p>
        <p className="mt-2 text-sm text-muted">
          Срок меню ({days} дн.) — с понедельника текущей недели. Цель по весу и калории задаются в Профиле, не здесь.
        </p>
        <p className="mt-2 text-sm text-muted">
          Ужин всегда горячее мясо/рыба + салат. Вегетарианцам — горячее без мяса + салат. Меню и тексты рецептов пишет
          модель, корзину и калории считает приложение.
        </p>
      </Card>

      <Card className="mb-4">
        <h2 className="font-display text-xl">Холодильник</h2>
        <p className="mt-2 text-sm text-muted">
          Продукты дома обязательно входят в план меню. В бюджете это скидка: их не покупаем.
        </p>
        {fridge.length > 0 ? (
          <p className="mt-2 text-sm">
            Сейчас {fridge.filter((item) => item.grams > 0).length} позиций. Меню будет опираться на них.
          </p>
        ) : (
          <p className="mt-2 text-sm text-clay">Пока пусто — заполните, чтобы снизить расходы на неделю.</p>
        )}
        <Button className="mt-3 w-full" variant="secondary" onClick={() => navigate("/fridge")}>
          {fridge.length > 0 ? "Изменить холодильник" : "Добавить, что уже есть"}
        </Button>
      </Card>

      <Card className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Дней меню</Label>
            <Input type="number" min={1} max={14} value={days} onChange={(e) => setDays(Number(e.target.value))} />
          </div>
          <div>
            <Label>Бюджет, ₽</Label>
            <Input type="number" min={500} value={budget} onChange={(e) => setBudget(Number(e.target.value))} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Приёмы пищи</Label>
            <Input type="number" min={2} max={4} value={meals} onChange={(e) => setMeals(Number(e.target.value))} />
          </div>
          <div>
            <Label>Готовок</Label>
            <Input type="number" min={1} max={7} value={sessions} onChange={(e) => setSessions(Number(e.target.value))} />
          </div>
        </div>
        <div>
          <Label>Макс. время готовки</Label>
          <Input type="number" value={cookTime} onChange={(e) => setCookTime(Number(e.target.value))} />
        </div>
        <div>
          <Label>Разнообразие</Label>
          <Select value={variety} onChange={(e) => setVariety(e.target.value as typeof variety)}>
            <option value="low">Попроще, больше повторов</option>
            <option value="medium">Обычное</option>
            <option value="high">Максимум разнообразия</option>
          </Select>
        </div>
        <label className="flex items-start gap-3 rounded-2xl bg-cream px-3 py-3 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={quickBreakfasts}
            onChange={(e) => setQuickBreakfasts(e.target.checked)}
          />
          <span>
            <span className="font-semibold">Быстрые завтраки</span>
            <span className="mt-1 block text-muted">
              До 10 минут: творог, йогурт, овсянка без долгой варки — без сырников, каш на плите и омлетов.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-3 rounded-2xl bg-cream px-3 py-3 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={quickLunches}
            onChange={(e) => setQuickLunches(e.target.checked)}
          />
          <span>
            <span className="font-semibold">Нет времени готовить обеды</span>
            <span className="mt-1 block text-muted">
              Обед — блюдо до 20 минут или остатки вчерашнего ужина (готовим ужин с запасом).
            </span>
          </span>
        </label>
        <div>
          <Label>Магазины</Label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {STORES.map((store) => (
              <label key={store.id} className="flex items-center gap-2 rounded-2xl bg-cream px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={selectedStores.has(store.id)}
                  onChange={(e) => {
                    setStores((prev) =>
                      e.target.checked ? [...prev, store.id] : prev.filter((id) => id !== store.id),
                    );
                  }}
                />
                {store.name}
              </label>
            ))}
          </div>
        </div>
      </Card>

      {members.length < 2 && (
        <Card className="mt-4 space-y-3">
          <h2 className="font-display text-xl">Партнёр пока без аккаунта</h2>
          <p className="text-sm text-muted">
            Можно всё равно считать на двоих: укажите имя и калории партнёра. Точные цели появятся, когда он подключится
            кодом из Профиля.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Имя партнёра</Label>
              <Input value={partnerName} onChange={(e) => setPartnerName(e.target.value)} />
            </div>
            <div>
              <Label>Калории партнёра</Label>
              <Input
                type="number"
                min={1200}
                value={partnerCalories}
                onChange={(e) => setPartnerCalories(Number(e.target.value))}
              />
            </div>
          </div>
        </Card>
      )}

      <Card className="mt-4">
        <h2 className="font-display text-xl">Ем не дома</h2>
        <p className="mt-1 text-sm text-muted">
          Два отдельных расписания — можно заполнить за обоих. Отмеченный приём не входит в корзину только для этого
          человека; если оба вне дома — блюдо целиком пропускается.
        </p>
        <div className="mt-4 space-y-5">
          {planners.map((member) => (
            <div key={member.id}>
              <h3 className="mb-2 text-sm font-semibold">
                {member.name}
                {member.isDraft ? " (черновик)" : ""}
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr>
                      <th className="py-1 pr-2">День</th>
                      {mealTypes.map((type) => (
                        <th key={type} className="px-1 py-1 text-center">
                          {mealLabels[type]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: Number(days) }).map((_, dayIndex) => (
                      <tr key={dayIndex}>
                        <td className="py-2 pr-2 font-semibold">{dayLabelForPlan(weekStartDate, dayIndex, "short")}</td>
                        {mealTypes.map((type) => {
                          const key = slotKey(member.id, dayIndex, type);
                          return (
                            <td key={key} className="px-1 py-2 text-center">
                              <input
                                type="checkbox"
                                checked={eatingOut.has(key)}
                                onChange={() => toggleSlot(member.id, dayIndex, type)}
                                aria-label={`${member.name}: ${dayLabelForPlan(weekStartDate, dayIndex, "short")} ${mealLabels[type]} не дома`}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </Card>
      {error && <p className="mt-4 text-sm text-clay">{error}</p>}
      <Button className="mt-4 w-full" disabled={pending} onClick={run}>
        {pending ? "Считаем…" : "Рассчитать меню на пару"}
      </Button>
    </Screen>
  );
}
