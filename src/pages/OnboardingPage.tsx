import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { WeightGoalCard } from "@/components/WeightGoalCard";
import { Input, Label, Select } from "@/components/ui/field";
import { useApp } from "@/context/AppContext";
import { catalog } from "@/lib/catalog/repository";
import {
  ageFromBirthDate,
  calculateNutritionTargets,
  type ActivityLevel,
  type Gender,
  type Goal,
} from "@/lib/nutrition/calculator";
import { calculateWeightPlan, suggestedWeeks } from "@/lib/nutrition/weight-goal";
import { createHousehold, joinHousehold, upsertProfile } from "@/lib/supabase/api";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

const activityOptions: Array<{ id: ActivityLevel; label: string }> = [
  { id: "sedentary", label: "Сидячий" },
  { id: "light", label: "Лёгкая активность" },
  { id: "moderate", label: "Умеренная" },
  { id: "active", label: "Высокая" },
  { id: "very_active", label: "Очень высокая" },
];

export function OnboardingPage() {
  const { user, profile, refresh } = useApp();
  const navigate = useNavigate();
  const [step, setStep] = useState(profile ? 2 : 1);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [invite, setInvite] = useState("");
  const [householdName, setHouseholdName] = useState("Наша пара");
  const [form, setForm] = useState({
    name: profile?.name ?? "",
    gender: (profile?.gender ?? "female") as Gender,
    birth_date: profile?.birth_date ?? "1998-01-01",
    height_cm: profile?.height_cm ?? 168,
    weight_kg: profile?.weight_kg ?? 62,
    target_weight_kg: profile?.target_weight_kg ?? 58,
    activity_level: (profile?.activity_level ?? "light") as ActivityLevel,
    goal: (profile?.goal ?? "lose") as Goal,
    meals_per_day: profile?.meals_per_day ?? 3,
    snacks: profile?.snacks ?? false,
    allergies: profile?.allergies.join(", ") ?? "",
    excluded: profile?.excluded_products.join(", ") ?? "",
    diet_type: profile?.diet_type ?? "omnivore",
    max_cooking_time: profile?.max_cooking_time ?? 40,
    cooking_sessions: profile?.cooking_sessions ?? 3,
    batch_meals: profile?.batch_meals ?? true,
    goal_weeks: profile?.goal_weeks ?? suggestedWeeks(profile?.weight_kg ?? 62, profile?.target_weight_kg ?? 58),
  });

  const nutrition = useMemo(
    () =>
      calculateNutritionTargets({
        gender: form.gender,
        ageYears: ageFromBirthDate(form.birth_date),
        heightCm: Number(form.height_cm),
        weightKg: Number(form.weight_kg),
        activityLevel: form.activity_level,
        goal: form.goal,
        targetWeightKg: form.goal === "maintain" ? Number(form.weight_kg) : Number(form.target_weight_kg),
        goalWeeks: form.goal === "maintain" ? undefined : Number(form.goal_weeks) || undefined,
      }),
    [form],
  );

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function saveProfile() {
    if (!user) return;
    setPending(true);
    setError("");
    try {
      const excluded = form.excluded
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .map((name) => catalog.getProducts().find((p) => p.canonical_name.toLowerCase() === name.toLowerCase())?.id ?? name);
      await upsertProfile({
        user_id: user.id,
        household_id: profile?.household_id ?? null,
        name: form.name,
        gender: form.gender,
        birth_date: form.birth_date,
        height_cm: Number(form.height_cm),
        weight_kg: Number(form.weight_kg),
        activity_level: form.activity_level,
        goal: form.goal,
        target_weight_kg: form.goal === "maintain" ? Number(form.weight_kg) : Number(form.target_weight_kg),
        calorie_target: nutrition.calorieTarget,
        protein_target: nutrition.proteinTarget,
        fat_target: nutrition.fatTarget,
        carbs_target: nutrition.carbsTarget,
        fiber_target: nutrition.fiberTarget,
        iron_target: nutrition.ironTarget,
        goal_weeks: form.goal === "maintain" ? null : Number(form.goal_weeks) || null,
        meals_per_day: Number(form.meals_per_day),
        snacks: form.snacks,
        preferences: [],
        excluded_products: excluded,
        allergies: form.allergies.split(",").map((item) => item.trim()).filter(Boolean),
        diet_type: form.diet_type,
        max_cooking_time: Number(form.max_cooking_time),
        cooking_sessions: Number(form.cooking_sessions),
        batch_meals: form.batch_meals,
      });
      await refresh();
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить профиль");
    } finally {
      setPending(false);
    }
  }

  async function create() {
    setPending(true);
    setError("");
    try {
      await createHousehold(householdName);
      await refresh();
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось создать пару");
    } finally {
      setPending(false);
    }
  }

  async function join() {
    setPending(true);
    setError("");
    try {
      await joinHousehold(invite);
      await refresh();
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось присоединиться");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto max-w-lg px-5 py-8">
      <p className="text-sm font-semibold text-sage">Шаг {step} из 2</p>
      <h1 className="font-display mt-1 text-3xl">{step === 1 ? "Ваш профиль" : "Пара"}</h1>
      {step === 1 ? (
        <div className="mt-6 space-y-4">
          <Card className="space-y-4">
            <div>
              <Label>Имя</Label>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Пол</Label>
                <Select value={form.gender} onChange={(e) => set("gender", e.target.value as Gender)}>
                  <option value="female">Женский</option>
                  <option value="male">Мужской</option>
                </Select>
              </div>
              <div>
                <Label>Дата рождения</Label>
                <Input type="date" value={form.birth_date} onChange={(e) => set("birth_date", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Рост, см</Label>
                <Input type="number" value={form.height_cm} onChange={(e) => set("height_cm", Number(e.target.value))} />
              </div>
              <div>
                <Label>Вес, кг</Label>
                <Input type="number" value={form.weight_kg} onChange={(e) => set("weight_kg", Number(e.target.value))} />
              </div>
            </div>
            <div>
              <Label>Активность</Label>
              <Select value={form.activity_level} onChange={(e) => set("activity_level", e.target.value as ActivityLevel)}>
                {activityOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Цель</Label>
              <Select value={form.goal} onChange={(e) => set("goal", e.target.value as Goal)}>
                <option value="lose">Похудение</option>
                <option value="maintain">Поддержание</option>
                <option value="gain">Массонабор (мышцы)</option>
              </Select>
            </div>
            {form.goal === "maintain" && (
              <p className="text-sm text-muted">
                Поддержание: калории около расхода, без дефицита. Целевой вес = текущий. Менять цель потом можно в
                Профиле, не каждую неделю.
              </p>
            )}
            {form.goal === "gain" && (
              <p className="text-sm text-muted">
                Массонабор: профицит 250–450 ккал, белок 2.0 г/кг. Срок цели задаёт темп набора (до ~0.4 кг/нед).
              </p>
            )}
            {form.goal === "lose" && (
              <p className="text-sm text-muted">
                Похудение: дефицит в безопасном темпе. Срок и вес потом редактируются в Профиле.
              </p>
            )}
            {form.goal !== "maintain" && (
              <>
                <div>
                  <Label>Целевой вес, кг</Label>
                  <Input type="number" value={form.target_weight_kg} onChange={(e) => set("target_weight_kg", Number(e.target.value))} />
                </div>
                <div>
                  <Label>За сколько недель хотите выйти на цель</Label>
                  <Input
                    type="number"
                    min={4}
                    max={52}
                    value={form.goal_weeks}
                    onChange={(e) => set("goal_weeks", Number(e.target.value))}
                  />
                </div>
              </>
            )}
          </Card>
          <WeightGoalCard
            plan={calculateWeightPlan({
              currentKg: Number(form.weight_kg),
              targetKg: form.goal === "maintain" ? Number(form.weight_kg) : Number(form.target_weight_kg),
              tdee: nutrition.tdee,
              calorieTarget: nutrition.calorieTarget,
              goal: form.goal,
              goalWeeks: Number(form.goal_weeks) || undefined,
              menuDays: 7,
            })}
          />
          <Card>
            <p className="text-sm text-muted">Ориентировочный расчёт, не медицинская рекомендация</p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <Stat label="BMR" value={`${Math.round(nutrition.bmr)}`} />
              <Stat label="TDEE" value={`${Math.round(nutrition.tdee)}`} />
              <Stat label="Ккал/день" value={`${nutrition.calorieTarget}`} />
            </div>
            <p className="mt-3 text-sm">
              {nutrition.proteinTarget} г белка · {nutrition.fatTarget} г жиров · {nutrition.carbsTarget} г углеводов
            </p>
            <p className="mt-1 text-sm">
              Клетчатка {nutrition.fiberTarget} г · железо {nutrition.ironTarget} мг в день
            </p>
          </Card>
          <Card className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Приёмы пищи</Label>
                <Input type="number" min={2} max={4} value={form.meals_per_day} onChange={(e) => set("meals_per_day", Number(e.target.value))} />
              </div>
              <div>
                <Label>Готовок в неделю</Label>
                <Input type="number" min={1} max={7} value={form.cooking_sessions} onChange={(e) => set("cooking_sessions", Number(e.target.value))} />
              </div>
            </div>
            <div>
              <Label>Макс. время готовки, мин</Label>
              <Input type="number" value={form.max_cooking_time} onChange={(e) => set("max_cooking_time", Number(e.target.value))} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.snacks} onChange={(e) => set("snacks", e.target.checked)} />
              Перекусы
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.batch_meals} onChange={(e) => set("batch_meals", e.target.checked)} />
              Можно готовить заранее
            </label>
            <div>
              <Label>Тип питания</Label>
              <Select value={form.diet_type} onChange={(e) => set("diet_type", e.target.value)}>
                <option value="omnivore">Обычное</option>
                <option value="vegetarian">Вегетарианское</option>
              </Select>
            </div>
            <div>
              <Label>Аллергии</Label>
              <Input value={form.allergies} onChange={(e) => set("allergies", e.target.value)} placeholder="орехи, молоко" />
            </div>
            <div>
              <Label>Исключить продукты</Label>
              <Input value={form.excluded} onChange={(e) => set("excluded", e.target.value)} placeholder="Лосось, творог" />
            </div>
          </Card>
          {error && <p className="text-sm text-clay">{error}</p>}
          <Button className="w-full" disabled={pending || !form.name} onClick={saveProfile}>
            Дальше
          </Button>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          <Card className="space-y-4">
            <p className="text-muted">
              Меню всегда считается на всех в паре. Создайте пару и отправьте код второму человеку — или введите его код.
            </p>
            <div>
              <Label>Название</Label>
              <Input value={householdName} onChange={(e) => setHouseholdName(e.target.value)} />
            </div>
            <Button className="w-full" disabled={pending} onClick={create}>
              Создать пару
            </Button>
          </Card>
          <Card className="space-y-4">
            <div>
              <Label>Код приглашения</Label>
              <Input value={invite} onChange={(e) => setInvite(e.target.value.toUpperCase())} placeholder="A1B2C3" />
            </div>
            <Button className="w-full" variant="secondary" disabled={pending || invite.length < 4} onClick={join}>
              Присоединиться
            </Button>
          </Card>
          {error && <p className="text-sm text-clay">{error}</p>}
        </div>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-cream px-2 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
