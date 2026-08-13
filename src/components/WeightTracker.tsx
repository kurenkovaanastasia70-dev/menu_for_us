import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/field";
import type { Goal } from "@/lib/nutrition/calculator";
import { progressPercent } from "@/lib/nutrition/weight-goal";
import type { WeightLog } from "@/lib/supabase/types";
import { useMemo, useState } from "react";

export function WeightTracker({
  logs,
  currentKg,
  targetKg,
  goal,
  pending,
  onSave,
}: {
  logs: WeightLog[];
  currentKg: number;
  targetKg: number;
  goal: Goal;
  pending?: boolean;
  onSave: (loggedAt: string, weightKg: number) => Promise<void>;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [weight, setWeight] = useState(currentKg);
  const sorted = useMemo(
    () => [...logs].sort((a, b) => a.logged_at.localeCompare(b.logged_at)),
    [logs],
  );
  const startKg = sorted[0]?.weight_kg ?? currentKg;
  const lastKg = sorted[sorted.length - 1]?.weight_kg ?? currentKg;
  const percent = progressPercent({ startKg, currentKg: lastKg, targetKg, goal });

  return (
    <Card>
      <h2 className="font-display text-xl">Трекер веса</h2>
      <p className="mt-1 text-sm text-muted">
        {goal === "maintain"
          ? "Отмечайте вес, чтобы видеть, держится ли коридор поддержания."
          : "Цель и срок задаются в профиле. Здесь только динамика."}
      </p>
      {sorted.length >= 2 && <Sparkline logs={sorted} />}
      {percent != null && (
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-xs text-muted">
            <span>Старт {startKg} кг</span>
            <span>{percent}%</span>
            <span>Цель {targetKg} кг</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-cream">
            <div className="h-full rounded-full bg-sage" style={{ width: `${percent}%` }} />
          </div>
        </div>
      )}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <Label>Дата</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <Label>Вес, кг</Label>
          <Input type="number" step="0.1" value={weight} onChange={(e) => setWeight(Number(e.target.value))} />
        </div>
      </div>
      <Button className="mt-3 w-full" disabled={pending || !weight} onClick={() => onSave(date, Number(weight))}>
        {pending ? "Сохраняем…" : "Записать вес"}
      </Button>
      {sorted.length > 0 && (
        <ul className="mt-4 max-h-40 space-y-1 overflow-auto text-sm">
          {[...sorted].reverse().slice(0, 12).map((log) => (
            <li key={`${log.logged_at}-${log.weight_kg}`} className="flex justify-between rounded-xl bg-cream px-3 py-2">
              <span className="text-muted">{log.logged_at}</span>
              <span className="font-semibold">{log.weight_kg} кг</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Sparkline({ logs }: { logs: WeightLog[] }) {
  const values = logs.map((log) => Number(log.weight_kg));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(0.4, max - min);
  const w = 280;
  const h = 64;
  const points = values
    .map((value, index) => {
      const x = values.length === 1 ? w / 2 : (index / (values.length - 1)) * w;
      const y = h - 8 - ((value - min) / span) * (h - 16);
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-3 w-full text-sage" role="img" aria-label="График веса">
      <polyline fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" points={points} />
    </svg>
  );
}
