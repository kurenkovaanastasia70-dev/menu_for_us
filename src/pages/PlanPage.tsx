import { Screen } from "@/components/layout/Shell";
import { WeightGoalCard } from "@/components/WeightGoalCard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/field";
import { useApp } from "@/context/AppContext";
import { ageFromBirthDate, calculateNutritionTargets } from "@/lib/nutrition/calculator";
import { calculateWeightPlan } from "@/lib/nutrition/weight-goal";
import { STORES } from "@/lib/optimizer";
import { generateWeek } from "@/lib/planning/generate-week";
import { cashbackInput, constraintsFromProfiles, peopleFromProfiles } from "@/lib/planning/from-profiles";
import { saveMealPlan } from "@/lib/supabase/api";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

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
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const selectedStores = useMemo(() => new Set(stores), [stores]);
  const names = members.map((member) => member.name).join(" и ");

  async function run() {
    if (!household || members.length === 0) {
      setError("Сначала заполните профили пары.");
      return;
    }
    setPending(true);
    setError("");
    try {
      const constraints = constraintsFromProfiles(members, household);
      const result = await generateWeek({
        people: peopleFromProfiles(members),
        days: Number(days),
        budget: Number(budget),
        cashback: cashbackInput(cashback),
        fridge: fridge.map((item) => ({ productId: item.product_id, grams: item.grams })),
        useLlm: true,
        constraints: {
          ...constraints,
          mealsPerDay: Number(meals),
          maxCookingTime: Number(cookTime),
          maxCookingSessions: Number(sessions),
          preferredStoreIds: [...selectedStores],
          varietyPreference: variety,
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
          Срок меню ({days} дн.) — это длина корзины. Срок цели по весу считается отдельно в профиле.
        </p>
      </Card>

      <div className="mb-4 space-y-3">
        {members.map((member) => {
          const nutrition = calculateNutritionTargets({
            gender: member.gender,
            ageYears: ageFromBirthDate(member.birth_date),
            heightCm: Number(member.height_cm),
            weightKg: Number(member.weight_kg),
            activityLevel: member.activity_level,
            goal: member.goal,
            targetWeightKg: Number(member.target_weight_kg ?? member.weight_kg),
            goalWeeks: member.goal_weeks ?? undefined,
          });
          return (
            <div key={member.id}>
              <p className="mb-2 text-sm font-semibold">{member.name}</p>
              <WeightGoalCard
                plan={calculateWeightPlan({
                  currentKg: Number(member.weight_kg),
                  targetKg: Number(member.target_weight_kg ?? member.weight_kg),
                  tdee: nutrition.tdee,
                  calorieTarget: member.calorie_target,
                  goal: member.goal,
                  goalWeeks: member.goal_weeks ?? undefined,
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
        <p className="text-sm text-muted">
          Холодильник: {fridge.length} позиций.{" "}
          <button className="font-semibold text-sage" onClick={() => navigate("/fridge")}>
            Отметить, что уже есть
          </button>
        </p>
      </Card>
      {error && <p className="mt-4 text-sm text-clay">{error}</p>}
      <Button className="mt-4 w-full" disabled={pending} onClick={run}>
        {pending ? "Считаем…" : "Рассчитать меню на пару"}
      </Button>
    </Screen>
  );
}
