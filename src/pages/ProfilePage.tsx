import { Screen } from "@/components/layout/Shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/field";
import { useApp } from "@/context/AppContext";
import { STORES } from "@/lib/optimizer";
import { saveCashback, updateHousehold } from "@/lib/supabase/api";
import { supabase } from "@/lib/supabase/client";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

export function ProfilePage() {
  const { profile, household, members, cashback, refresh } = useApp();
  const navigate = useNavigate();
  const [budget, setBudget] = useState(household?.default_budget ?? 6000);
  const [percents, setPercents] = useState<Record<string, number>>(
    Object.fromEntries(cashback.map((row) => [row.store_id, Number(row.percent)])),
  );

  async function save() {
    if (!household) return;
    await updateHousehold(household.id, { default_budget: Number(budget) });
    for (const store of STORES) {
      await saveCashback(household.id, store.id, Number(percents[store.id] ?? 0));
    }
    await refresh();
  }

  return (
    <Screen title="Профиль">
      <Card>
        <div className="font-display text-2xl">{profile?.name}</div>
        <p className="mt-2 text-sm text-muted">
          {profile?.calorie_target} kcal · {profile?.protein_target} g белка · {profile?.fat_target} g жиров ·{" "}
          {profile?.carbs_target} g углеводов
        </p>
        <p className="mt-3 text-xs text-muted">Расчёт ориентировочный и не является медицинской рекомендацией.</p>
        <Button className="mt-4 w-full" variant="secondary" onClick={() => navigate("/onboarding")}>
          Изменить профиль
        </Button>
      </Card>

      <Card className="mt-4">
        <h2 className="font-display text-xl">Пара</h2>
        <p className="mt-2 text-sm">{household?.name}</p>
        <p className="mt-1 text-sm text-muted">Код приглашения: {household?.invite_code}</p>
        <ul className="mt-3 space-y-1 text-sm">
          {members.map((member) => (
            <li key={member.id}>
              {member.name} · {member.calorie_target} kcal
            </li>
          ))}
        </ul>
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
        <Button className="w-full" onClick={save}>
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
