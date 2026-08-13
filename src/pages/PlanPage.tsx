import { Screen } from "@/components/layout/Shell";
import { WeightGoalCard } from "@/components/WeightGoalCard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/field";
import { useApp } from "@/context/AppContext";
import { ageFromBirthDate, calculateNutritionTargets } from "@/lib/nutrition/calculator";
import { calculateWeightPlan, suggestedWeeks } from "@/lib/nutrition/weight-goal";
import { STORES } from "@/lib/optimizer";
import type { EatingOutSlot } from "@/lib/optimizer/types";
import { generateWeek } from "@/lib/planning/generate-week";
import { cashbackInput, constraintsFromProfiles, peopleFromProfiles } from "@/lib/planning/from-profiles";
import { saveMealPlan, upsertProfile } from "@/lib/supabase/api";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

const dayNames = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const mealLabels: Record<string, string> = {
  breakfast: "Завтрак",
  lunch: "Обед",
  dinner: "Ужин",
  snack: "Перекус",
};

export function PlanPage() {
  const { household, members, cashback, profile, fridge, refresh } = useApp();
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
  const [goalWeeks, setGoalWeeks] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      members.map((member) => [
        member.id,
        member.goal_weeks ??
          suggestedWeeks(Number(member.weight_kg), Number(member.target_weight_kg ?? member.weight_kg)),
      ]),
    ),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const selectedStores = useMemo(() => new Set(stores), [stores]);
  const names = members.map((member) => member.name).join(" и ");
  const mealTypes = useMemo(() => {
    const types: Array<"breakfast" | "lunch" | "dinner" | "snack"> = ["breakfast", "lunch", "dinner"].slice(
      0,
      Math.min(3, Math.max(2, Number(meals))),
    ) as Array<"breakfast" | "lunch" | "dinner" | "snack">;
    types.push("snack");
    return types;
  }, [meals]);

  function toggleSlot(dayIndex: number, mealType: string) {
    const key = `${dayIndex}:${mealType}`;
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
      const patched = members.map((member) => {
        const weeks = Number(goalWeeks[member.id] || member.goal_weeks || 0) || undefined;
        const nutrition = calculateNutritionTargets({
          gender: member.gender,
          ageYears: ageFromBirthDate(member.birth_date),
          heightCm: Number(member.height_cm),
          weightKg: Number(member.weight_kg),
          activityLevel: member.activity_level,
          goal: member.goal,
          targetWeightKg: Number(member.target_weight_kg ?? member.weight_kg),
          goalWeeks: weeks,
        });
        return {
          ...member,
          goal_weeks: weeks ?? null,
          calorie_target: nutrition.calorieTarget,
          protein_target: nutrition.proteinTarget,
          fat_target: nutrition.fatTarget,
          carbs_target: nutrition.carbsTarget,
          fiber_target: nutrition.fiberTarget,
          iron_target: nutrition.ironTarget,
        };
      });
      const self = patched.find((member) => member.id === profile?.id);
      if (self) {
        try {
          await upsertProfile(self);
        } catch {
          // RLS может не пустить чужой профиль — считаем неделю с локальными цифрами.
        }
      }
      const eatingOutSlots: EatingOutSlot[] = [...eatingOut].map((key) => {
        const [day, mealType] = key.split(":");
        return { dayIndex: Number(day), mealType: mealType as EatingOutSlot["mealType"] };
      });
      const constraints = constraintsFromProfiles(patched, household);
      const result = await generateWeek({
        people: peopleFromProfiles(patched),
        days: Number(days),
        budget: Number(budget),
        cashback: cashbackInput(cashback),
        fridge: fridge.map((item) => ({ productId: item.product_id, grams: item.grams })),
        useLlm: true,
        trainingPeople: patched.map((member) => ({ id: member.id, name: member.name, goal: member.goal })),
        constraints: {
          ...constraints,
          mealsPerDay: Number(meals),
          maxCookingTime: Number(cookTime),
          maxCookingSessions: Number(sessions),
          preferredStoreIds: [...selectedStores],
          varietyPreference: variety,
          eatingOutSlots,
          quickLunches,
        },
      });
      const start = new Date();
      const end = new Date();
      end.setDate(start.getDate() + Number(days) - 1);
      const id = await saveMealPlan({
        householdId: household.id,
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
        days: Number(days),
        budget: Number(budget),
        result,
      });
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
          Нажмите «Рассчитать» — блюда и граммовки будут на {members.length < 2 ? "одного человека" : `двоих: ${names}`}.
          Второй человек подключается кодом в Профиле.
        </p>
        <p className="mt-2 text-sm text-muted">
          Цены берутся из каталога приложения (типичные ценники на 1 августа 2026, Пятёрочка / Магнит / Перекрёсток /
          Дикси) плюс ваш cashback. Это не парсинг сайта магазина.
        </p>
        <p className="mt-2 text-sm text-muted">
          Срок меню ({days} дн.) — это длина корзины. Срок цели по весу задаёте ниже, отдельно.
        </p>
        <p className="mt-2 text-sm text-muted">
          Ужин всегда горячее мясо/рыба + салат. Вегетарианцам — горячее без мяса + салат. Меню и тексты рецептов пишет
          модель, корзину и калории считает приложение.
        </p>
      </Card>

      <div className="mb-4 space-y-3">
        {members.map((member) => {
          const weeks = Number(goalWeeks[member.id] || member.goal_weeks || 0) || undefined;
          const nutrition = calculateNutritionTargets({
            gender: member.gender,
            ageYears: ageFromBirthDate(member.birth_date),
            heightCm: Number(member.height_cm),
            weightKg: Number(member.weight_kg),
            activityLevel: member.activity_level,
            goal: member.goal,
            targetWeightKg: Number(member.target_weight_kg ?? member.weight_kg),
            goalWeeks: weeks,
          });
          return (
            <div key={member.id}>
              <p className="mb-2 text-sm font-semibold">{member.name}</p>
              {member.goal !== "maintain" && (
                <Card className="mb-3">
                  <Label>Срок цели, недель</Label>
                  <Input
                    type="number"
                    min={4}
                    max={52}
                    value={goalWeeks[member.id] ?? member.goal_weeks ?? 8}
                    onChange={(e) =>
                      setGoalWeeks((prev) => ({ ...prev, [member.id]: Number(e.target.value) }))
                    }
                  />
                  <p className="mt-2 text-xs text-muted">
                    {member.goal === "gain"
                      ? "Массонабор: безопасный темп до ~0.4 кг/нед, белок 2.0 г/кг, профицит 250–450 ккал."
                      : "Похудение: 0.25–0.75 кг/нед. Калории пересчитаются под этот срок."}
                  </p>
                </Card>
              )}
              <WeightGoalCard
                plan={calculateWeightPlan({
                  currentKg: Number(member.weight_kg),
                  targetKg: Number(member.target_weight_kg ?? member.weight_kg),
                  tdee: nutrition.tdee,
                  calorieTarget: nutrition.calorieTarget,
                  goal: member.goal,
                  goalWeeks: weeks,
                  menuDays: Number(days),
                })}
              />
            </div>
          );
        })}
      </div>

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

      <Card className="mt-4">
        <h2 className="font-display text-xl">Ем не дома</h2>
        <p className="mt-1 text-sm text-muted">Отметьте приём — его не будет в корзине и в домашней готовке.</p>
        <div className="mt-3 overflow-x-auto">
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
                  <td className="py-2 pr-2 font-semibold">{dayNames[dayIndex % 7]}</td>
                  {mealTypes.map((type) => {
                    const key = `${dayIndex}:${type}`;
                    return (
                      <td key={key} className="px-1 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={eatingOut.has(key)}
                          onChange={() => toggleSlot(dayIndex, type)}
                          aria-label={`${dayNames[dayIndex % 7]} ${mealLabels[type]} не дома`}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {error && <p className="mt-4 text-sm text-clay">{error}</p>}
      <Button className="mt-4 w-full" disabled={pending} onClick={run}>
        {pending ? "Считаем…" : "Рассчитать меню на пару"}
      </Button>
    </Screen>
  );
}
