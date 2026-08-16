import { Screen } from "@/components/layout/Shell";
import { WeightGoalCard } from "@/components/WeightGoalCard";
import { WeightTracker } from "@/components/WeightTracker";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/field";
import { useApp } from "@/context/AppContext";
import { catalog } from "@/lib/catalog/repository";
import {
  deleteCustomProduct,
  slugifyProductName,
  upsertCustomProduct,
  withMacroDefaults,
  type CustomProduct,
} from "@/lib/catalog/custom-products";
import { STORES } from "@/lib/optimizer";
import type { ProductCategory } from "@/lib/optimizer/types";
import {
  ageFromBirthDate,
  calculateNutritionTargets,
  type Goal,
} from "@/lib/nutrition/calculator";
import { calculateWeightPlan, suggestedWeeks } from "@/lib/nutrition/weight-goal";
import { DEFAULT_EXCLUDED_PRODUCT_IDS } from "@/lib/planning/from-profiles";
import { saveCashback, updateHousehold, upsertProfile, upsertWeightLog } from "@/lib/supabase/api";
import { supabase } from "@/lib/supabase/client";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

export function ProfilePage() {
  const { profile, household, members, cashback, weightLogs, customProducts, refresh, user } = useApp();
  const navigate = useNavigate();
  const [budget, setBudget] = useState(household?.default_budget ?? 6000);
  const [percents, setPercents] = useState<Record<string, number>>(
    Object.fromEntries(cashback.map((row) => [row.store_id, Number(row.percent)])),
  );
  const [goal, setGoal] = useState<Goal>(profile?.goal ?? "lose");
  const [weight, setWeight] = useState(Number(profile?.weight_kg ?? 62));
  const [target, setTarget] = useState(Number(profile?.target_weight_kg ?? profile?.weight_kg ?? 58));
  const [weeks, setWeeks] = useState(
    profile?.goal_weeks ??
      suggestedWeeks(Number(profile?.weight_kg ?? 62), Number(profile?.target_weight_kg ?? 58)),
  );
  const excludedIds = useMemo(
    () => [...new Set([...(profile?.excluded_products ?? []), ...DEFAULT_EXCLUDED_PRODUCT_IDS])],
    [profile?.excluded_products],
  );
  const [customList, setCustomList] = useState<CustomProduct[]>(customProducts);
  const [customName, setCustomName] = useState("");
  const [customPrice, setCustomPrice] = useState(199);
  const [customPack, setCustomPack] = useState(400);
  const [customCategory, setCustomCategory] = useState<ProductCategory>("protein");
  const [customStore, setCustomStore] = useState(household?.preferred_stores?.[0] ?? "magnit");
  const [customCal, setCustomCal] = useState<number | "">("");
  const [customProtein, setCustomProtein] = useState<number | "">("");
  const [customPending, setCustomPending] = useState(false);
  const [pending, setPending] = useState(false);
  const [weightPending, setWeightPending] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setCustomList(customProducts);
  }, [customProducts]);

  useEffect(() => {
    if (household?.preferred_stores?.[0]) setCustomStore(household.preferred_stores[0]);
  }, [household?.id, household?.preferred_stores]);

  const products = useMemo(() => {
    const base = catalog.getProducts();
    const extras = customList.map((item) => ({
      id: item.id,
      canonical_name: item.name,
      category: item.category,
      calories_per_100g: item.calories_per_100g,
      protein_per_100g: item.protein_per_100g,
      fat_per_100g: item.fat_per_100g,
      carbs_per_100g: item.carbs_per_100g,
      fiber_per_100g: item.fiber_per_100g ?? 0,
      iron_per_100g: item.iron_per_100g ?? 0,
      package_weight: item.package_weight,
      unit: item.unit,
      tags: ["custom"] as string[],
    }));
    return [...base, ...extras];
  }, [customList]);
  const excludedProducts = useMemo(
    () =>
      excludedIds
        .map((id) => products.find((product) => product.id === id))
        .filter(Boolean) as typeof products,
    [excludedIds, products],
  );

  const nutrition = useMemo(() => {
    if (!profile) return null;
    const targetKg = goal === "maintain" ? Number(weight) : Number(target);
    return calculateNutritionTargets({
      gender: profile.gender,
      ageYears: ageFromBirthDate(profile.birth_date),
      heightCm: Number(profile.height_cm),
      weightKg: Number(weight),
      activityLevel: profile.activity_level,
      goal,
      targetWeightKg: targetKg,
      goalWeeks: goal === "maintain" ? undefined : Number(weeks) || undefined,
    });
  }, [profile, goal, weight, target, weeks]);

  const weightPlan = useMemo(() => {
    if (!profile || !nutrition) return null;
    return calculateWeightPlan({
      currentKg: Number(weight),
      targetKg: goal === "maintain" ? Number(weight) : Number(target),
      tdee: nutrition.tdee,
      calorieTarget: nutrition.calorieTarget,
      goal,
      goalWeeks: goal === "maintain" ? undefined : Number(weeks) || undefined,
      menuDays: household?.default_days ?? 7,
    });
  }, [profile, nutrition, goal, weight, target, weeks, household?.default_days]);

  async function saveHousehold() {
    if (!household) return;
    await updateHousehold(household.id, { default_budget: Number(budget) });
    for (const store of STORES) {
      await saveCashback(household.id, store.id, Number(percents[store.id] ?? 0));
    }
    await refresh();
  }

  async function addCustomProduct() {
    if (!household || !customName.trim()) return;
    setCustomPending(true);
    setMessage("");
    try {
      const macros = withMacroDefaults(customCategory, {
        calories_per_100g: customCal === "" ? undefined : Number(customCal),
        protein_per_100g: customProtein === "" ? undefined : Number(customProtein),
      });
      const item: CustomProduct = {
        id: slugifyProductName(customName),
        household_id: household.id,
        name: customName.trim(),
        category: customCategory,
        package_weight: Math.max(1, Number(customPack) || 400),
        unit: "g",
        price: Math.max(1, Number(customPrice) || 1),
        store_id: customStore,
        ...macros,
      };
      const next = await upsertCustomProduct(item);
      setCustomList(next);
      setCustomName("");
      setCustomCal("");
      setCustomProtein("");
      await refresh();
      setMessage("Продукт добавлен — модель сможет брать его в меню.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Не удалось добавить продукт");
    } finally {
      setCustomPending(false);
    }
  }

  async function removeCustomProduct(productId: string) {
    if (!household) return;
    const next = await deleteCustomProduct(household.id, productId);
    setCustomList(next);
    await refresh();
  }

  async function saveGoal() {
    if (!profile || !nutrition) return;
    setPending(true);
    setMessage("");
    try {
      const targetKg = goal === "maintain" ? Number(weight) : Number(target);
      await upsertProfile({
        ...profile,
        goal,
        weight_kg: Number(weight),
        target_weight_kg: targetKg,
        goal_weeks: goal === "maintain" ? null : Number(weeks) || null,
        calorie_target: nutrition.calorieTarget,
        protein_target: nutrition.proteinTarget,
        fat_target: nutrition.fatTarget,
        carbs_target: nutrition.carbsTarget,
        fiber_target: nutrition.fiberTarget,
        iron_target: nutrition.ironTarget,
      });
      await refresh();
      setMessage("Цель сохранена. Меню и тренировки будут считать от неё, пока не измените здесь.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Не удалось сохранить цель");
    } finally {
      setPending(false);
    }
  }

  async function saveWeightLog(loggedAt: string, weightKg: number) {
    if (!user || !profile || !nutrition) return;
    setWeightPending(true);
    try {
      const nextLogs = await upsertWeightLog({ user_id: user.id, logged_at: loggedAt, weight_kg: weightKg });
      const latest = [...nextLogs].sort((a, b) => a.logged_at.localeCompare(b.logged_at)).at(-1);
      if (latest && latest.logged_at === loggedAt) {
        const latestKg = Number(latest.weight_kg);
        setWeight(latestKg);
        const targetKg = goal === "maintain" ? latestKg : Number(target);
        const nextNutrition = calculateNutritionTargets({
          gender: profile.gender,
          ageYears: ageFromBirthDate(profile.birth_date),
          heightCm: Number(profile.height_cm),
          weightKg: latestKg,
          activityLevel: profile.activity_level,
          goal,
          targetWeightKg: targetKg,
          goalWeeks: goal === "maintain" ? undefined : Number(weeks) || undefined,
        });
        await upsertProfile({
          ...profile,
          goal,
          weight_kg: latestKg,
          target_weight_kg: targetKg,
          goal_weeks: goal === "maintain" ? null : Number(weeks) || null,
          calorie_target: nextNutrition.calorieTarget,
          protein_target: nextNutrition.proteinTarget,
          fat_target: nextNutrition.fatTarget,
          carbs_target: nextNutrition.carbsTarget,
          fiber_target: nextNutrition.fiberTarget,
          iron_target: nextNutrition.ironTarget,
        });
      }
      await refresh();
    } finally {
      setWeightPending(false);
    }
  }

  return (
    <Screen title="Профиль">
      <Card>
        <div className="font-display text-2xl">{profile?.name}</div>
        <p className="mt-2 text-sm text-muted">
          {nutrition?.calorieTarget ?? profile?.calorie_target} kcal ·{" "}
          {nutrition?.proteinTarget ?? profile?.protein_target} g белка · клетчатка{" "}
          {nutrition?.fiberTarget ?? profile?.fiber_target ?? 25} г · железо{" "}
          {nutrition?.ironTarget ?? profile?.iron_target ?? 8} мг
        </p>
        <p className="mt-3 text-xs text-muted">Расчёт ориентировочный и не является медицинской рекомендацией.</p>
        <Button className="mt-4 w-full" variant="secondary" onClick={() => navigate("/onboarding")}>
          Изменить анкету
        </Button>
      </Card>

      <Card className="mt-4 space-y-4">
        <h2 className="font-display text-xl">Цель</h2>
        <p className="text-sm text-muted">
          Похудение, поддержание или набор задаются здесь, а не каждую неделю при расчёте меню.
        </p>
        <div>
          <Label>Режим</Label>
          <Select value={goal} onChange={(e) => setGoal(e.target.value as Goal)}>
            <option value="lose">Похудение</option>
            <option value="maintain">Поддержание</option>
            <option value="gain">Массонабор</option>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Текущий вес, кг</Label>
            <Input type="number" step="0.1" value={weight} onChange={(e) => setWeight(Number(e.target.value))} />
          </div>
          {goal !== "maintain" && (
            <div>
              <Label>Целевой вес, кг</Label>
              <Input type="number" step="0.1" value={target} onChange={(e) => setTarget(Number(e.target.value))} />
            </div>
          )}
        </div>
        {goal !== "maintain" && (
          <div>
            <Label>За сколько недель выйти на цель</Label>
            <Input type="number" min={4} max={52} value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} />
            <p className="mt-2 text-xs text-muted">
              {goal === "gain"
                ? "Массонабор: безопасный темп до ~0.4 кг/нед."
                : "Похудение: 0.25–0.75 кг/нед. Калории пересчитаются под этот срок."}
            </p>
          </div>
        )}
        {goal === "maintain" && (
          <p className="text-sm text-muted">
            Поддержание: калории около расхода, без дефицита и профицита. Целевой вес = текущий.
          </p>
        )}
        <Button className="w-full" disabled={pending} onClick={saveGoal}>
          {pending ? "Сохраняем…" : "Сохранить цель"}
        </Button>
        {message && <p className="text-sm text-muted">{message}</p>}
      </Card>

      <Card className="mt-4 space-y-3">
        <h2 className="font-display text-xl">Не едим</h2>
        <p className="text-sm text-muted">
          Исключения ставятся крестиками на странице продуктов. Чечевица уже исключена по умолчанию. Для пары
          суммируются исключения обоих профилей.
        </p>
        <div className="flex flex-wrap gap-2">
          {excludedProducts.slice(0, 12).map((product) => (
            <span key={product.id} className="rounded-full border border-line bg-white px-3 py-1 text-sm text-muted">
              {product.canonical_name}
            </span>
          ))}
          {excludedProducts.length > 12 && (
            <span className="rounded-full border border-line bg-cream px-3 py-1 text-sm text-muted">
              +{excludedProducts.length - 12}
            </span>
          )}
          {excludedProducts.length === 0 && <p className="text-sm text-muted">Пока ничего не исключено.</p>}
        </div>
        <Button className="w-full" variant="secondary" onClick={() => navigate("/products")}>
          Открыть каталог и поставить крестики
        </Button>
      </Card>

      <Card className="mt-4 space-y-3">
        <h2 className="font-display text-xl">Свои продукты</h2>
        <p className="text-sm text-muted">
          Добавьте то, чего нет в каталоге: название, цену упаковки и вес. КБЖУ можно не заполнять — подставим
          типичные значения по категории. Эти позиции попадут в меню и корзину.
        </p>
        {customList.length > 0 && (
          <ul className="space-y-2">
            {customList.map((item) => (
              <li
                key={item.id}
                className="flex items-start justify-between gap-3 rounded-2xl border border-line bg-white px-3 py-2 text-sm"
              >
                <div>
                  <div className="font-semibold">{item.name}</div>
                  <div className="text-muted">
                    {item.price} ₽ / {item.package_weight} г · {item.category}
                  </div>
                </div>
                <button type="button" className="text-sage font-semibold" onClick={() => removeCustomProduct(item.id)}>
                  Удалить
                </button>
              </li>
            ))}
          </ul>
        )}
        <div>
          <Label>Название</Label>
          <Input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="Например: сырники с/м" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Цена упаковки, ₽</Label>
            <Input type="number" value={customPrice} onChange={(e) => setCustomPrice(Number(e.target.value))} />
          </div>
          <div>
            <Label>Вес упаковки, г</Label>
            <Input type="number" value={customPack} onChange={(e) => setCustomPack(Number(e.target.value))} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Категория</Label>
            <Select value={customCategory} onChange={(e) => setCustomCategory(e.target.value as ProductCategory)}>
              <option value="protein">Белок</option>
              <option value="dairy">Молочка</option>
              <option value="grain">Крупы/гарнир</option>
              <option value="vegetable">Овощи</option>
              <option value="fruit">Фрукты</option>
              <option value="fat">Жиры</option>
              <option value="pantry">Бакалея</option>
              <option value="snack">Перекус</option>
            </Select>
          </div>
          <div>
            <Label>Магазин цены</Label>
            <Select value={customStore} onChange={(e) => setCustomStore(e.target.value)}>
              {STORES.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Ккал / 100 г (опц.)</Label>
            <Input
              type="number"
              value={customCal}
              onChange={(e) => setCustomCal(e.target.value === "" ? "" : Number(e.target.value))}
              placeholder="авто"
            />
          </div>
          <div>
            <Label>Белок / 100 г (опц.)</Label>
            <Input
              type="number"
              value={customProtein}
              onChange={(e) => setCustomProtein(e.target.value === "" ? "" : Number(e.target.value))}
              placeholder="авто"
            />
          </div>
        </div>
        <Button className="w-full" disabled={customPending || !household || !customName.trim()} onClick={addCustomProduct}>
          {customPending ? "Добавляем…" : "Добавить продукт"}
        </Button>
      </Card>

      {weightPlan && (
        <div className="mt-4">
          <WeightGoalCard plan={weightPlan} />
        </div>
      )}

      {user && (
        <div className="mt-4">
          <WeightTracker
            logs={weightLogs}
            currentKg={Number(weight)}
            targetKg={goal === "maintain" ? Number(weight) : Number(target)}
            goal={goal}
            pending={weightPending}
            onSave={saveWeightLog}
          />
        </div>
      )}

      <Card className="mt-4">
        <h2 className="font-display text-xl">Куда вставить Gemini</h2>
        <p className="mt-2 text-sm font-semibold text-clay">
          Ключ Gemini в GitHub вставлять нельзя. Сайт github.io открыт всем — ключ украдут.
        </p>
        <p className="mt-3 text-sm">
          В GitHub кладётся только адрес воркера. Путь: репозиторий{" "}
          <span className="font-semibold">menu_for_us</span> → вкладка{" "}
          <span className="font-semibold">Settings</span> →{" "}
          <span className="font-semibold">Secrets and variables</span> →{" "}
          <span className="font-semibold">Actions</span> →{" "}
          <span className="font-semibold">New repository secret</span>.
        </p>
        <p className="mt-2 text-sm">
          Имя секрета: <span className="font-semibold">VITE_API_URL</span>
          <br />
          Значение: URL после `npx wrangler deploy`, например https://menu-for-us-llm.XXXX.workers.dev
        </p>
        <p className="mt-3 text-sm">
          Сам ключ Gemini: на компьютере в папке cloudflare-worker выполните{" "}
          <span className="font-semibold">npx wrangler secret put GEMINI_API_KEY</span> и вставьте ключ в терминал.
        </p>
      </Card>

      <Card className="mt-4">
        <h2 className="font-display text-xl">Пара</h2>
        <p className="mt-2 text-sm">{household?.name}</p>
        <p className="mt-1 text-sm text-muted">Код приглашения: {household?.invite_code}</p>
        <ul className="mt-3 space-y-1 text-sm">
          {members.map((member) => (
            <li key={member.id}>
              {member.name} · {member.calorie_target} kcal ·{" "}
              {member.goal === "maintain" ? "поддержание" : member.goal === "gain" ? "набор" : "похудение"}
            </li>
          ))}
        </ul>
        {members.length < 2 && (
          <p className="mt-2 text-sm text-muted">Отправьте код второму человеку — меню станет на двоих автоматически.</p>
        )}
      </Card>

      <Card className="mt-4 space-y-3">
        <h2 className="font-display text-xl">Настройки</h2>
        <div>
          <Label>Бюджет по умолчанию</Label>
          <Input type="number" value={budget} onChange={(e) => setBudget(Number(e.target.value))} />
        </div>
        {STORES.map((store) => (
          <div key={store.id}>
            <Label>Cashback {store.name}, %</Label>
            <Input
              type="number"
              value={percents[store.id] ?? 0}
              onChange={(e) => setPercents((prev) => ({ ...prev, [store.id]: Number(e.target.value) }))}
            />
          </div>
        ))}
        <Button className="w-full" onClick={saveHousehold}>
          Сохранить
        </Button>
      </Card>

      <Button
        className="mt-4 w-full"
        variant="ghost"
        onClick={async () => {
          await supabase?.auth.signOut();
        }}
      >
        Выйти
      </Button>
    </Screen>
  );
}
