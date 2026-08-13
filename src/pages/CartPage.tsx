import { Screen } from "@/components/layout/Shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useApp } from "@/context/AppContext";
import { formatGrams, formatRub } from "@/lib/cn";
import { catalog } from "@/lib/catalog/repository";
import type { OptimizationResult } from "@/lib/optimizer";
import { makeOptimizationInput } from "@/lib/planning/from-profiles";
import { replaceProduct } from "@/lib/planning/alternatives";
import { fetchCartItems, fetchMealPlan, replaceCartItems, togglePurchased, updateMealPlanResult } from "@/lib/supabase/api";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

export function CartPage() {
  const { planId } = useParams();
  const { latestPlan, household, members, cashback, fridge, refresh } = useApp();
  const navigate = useNavigate();
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [purchased, setPurchased] = useState<Record<string, boolean>>({});
  const [itemIds, setItemIds] = useState<Record<string, string>>({});
  const [swapFrom, setSwapFrom] = useState<string | null>(null);

  const id = planId ?? latestPlan?.id;

  useEffect(() => {
    if (!id) return;
    const row = latestPlan && latestPlan.id === id ? latestPlan : null;
    const load = row ? Promise.resolve(row) : fetchMealPlan(id);
    load.then(async (plan) => {
      if (!plan) return;
      setResult(plan.result_json as OptimizationResult);
      const items = await fetchCartItems(plan.id);
      const map: Record<string, boolean> = {};
      const ids: Record<string, string> = {};
      for (const item of items as Array<{ id: string; product_id: string; purchased: boolean }>) {
        map[item.product_id] = item.purchased;
        ids[item.product_id] = item.id;
      }
      setPurchased(map);
      setItemIds(ids);
    });
  }, [id, latestPlan]);

  const byStore = useMemo(() => {
    const groups = new Map<string, number>();
    for (const line of result?.cart ?? []) {
      groups.set(line.storeName, (groups.get(line.storeName) ?? 0) + line.effectivePrice);
    }
    return [...groups.entries()];
  }, [result]);

  const input = useMemo(() => {
    if (!household || !members.length || !latestPlan) return null;
    return makeOptimizationInput({
      profiles: members,
      household,
      cashback,
      days: latestPlan.days,
      budget: Number(latestPlan.budget),
      fridge,
    });
  }, [household, members, cashback, latestPlan, fridge]);

  async function toggle(productId: string) {
    const next = !purchased[productId];
    setPurchased((prev) => ({ ...prev, [productId]: next }));
    if (itemIds[productId]) await togglePurchased(itemIds[productId], next);
  }

  async function applyProductSwap(toId: string) {
    if (!swapFrom || !result || !input || !id || !household) return;
    const next = replaceProduct(result, swapFrom, toId, input);
    setResult(next);
    setSwapFrom(null);
    await updateMealPlanResult(id, next);
    await replaceCartItems(id, household.id, next);
    await refresh();
  }

  if (!result) {
    return (
      <Screen title="Корзина">
        <p className="text-muted">Корзина появится после расчёта недели.</p>
        <Button className="mt-4 w-full" onClick={() => navigate("/plan")}>
          Составить неделю
        </Button>
      </Screen>
    );
  }

  const swaps = catalog.getProducts().filter((product) => product.id !== swapFrom).slice(0, 8);

  return (
    <Screen title="Корзина">
      <Card>
        <p className="text-sm text-muted">
          Цены из каталога приложения на 1 августа 2026: типичные ценники Пятёрочки, Магнита, Перекрёстка и Дикси плюс
          ваш cashback. Это не онлайн-витрина магазина.
        </p>
        <div className="mt-3 space-y-1 text-sm">
          <Row label="Стоимость" value={formatRub(result.totalCost)} />
          <Row label="Cashback" value={formatRub(result.cashback)} />
          <Row label="Итого" value={formatRub(result.effectiveCost)} strong />
        </div>
        <div className="mt-4 space-y-1 text-sm text-muted">
          {byStore.map(([store, sum]) => (
            <Row key={store} label={store} value={formatRub(sum)} />
          ))}
        </div>
      </Card>

      <div className="mt-4 space-y-3">
        {result.cart.map((line) => (
          <Card key={line.productId} className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 h-5 w-5"
              checked={Boolean(purchased[line.productId])}
              onChange={() => toggle(line.productId)}
              disabled={(line.toBuyGrams ?? line.quantityGrams) <= 0}
            />
            <div className="flex-1">
              <div className="font-semibold">{line.productName}</div>
              <div className="text-sm text-muted">
                нужно {formatGrams(line.quantityGrams)}
                {line.fromFridgeGrams
                  ? ` · из холодильника ${formatGrams(line.fromFridgeGrams)}`
                  : ""}
                {(line.toBuyGrams ?? line.quantityGrams) > 0
                  ? ` · купить ${line.packageCount} × ${formatGrams(line.packageWeight)} · ${line.storeName}`
                  : " · покупать не нужно"}
              </div>
              {(line.toBuyGrams ?? line.quantityGrams) > 0 && (
                <div className="mt-1 text-sm">
                  {formatRub(line.price)} · cashback {line.cashbackPercent}% · итого {formatRub(line.effectivePrice)}
                </div>
              )}
              <button className="mt-2 text-sm font-semibold text-sage" onClick={() => setSwapFrom(line.productId)}>
                Заменить продукт
              </button>
            </div>
          </Card>
        ))}
      </div>

      {swapFrom && (
        <div className="fixed inset-0 z-30 bg-ink/40 p-4" onClick={() => setSwapFrom(null)}>
          <div className="mx-auto mt-16 max-w-lg rounded-3xl bg-paper p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-2xl">Замена продукта</h3>
            <div className="mt-3 max-h-80 space-y-2 overflow-auto">
              {swaps.map((product) => (
                <button
                  key={product.id}
                  className="w-full rounded-2xl border border-line bg-white p-3 text-left"
                  onClick={() => applyProductSwap(product.id)}
                >
                  {product.canonical_name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </Screen>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? "text-base font-semibold" : ""}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
