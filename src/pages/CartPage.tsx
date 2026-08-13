import { Screen } from "@/components/layout/Shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useApp } from "@/context/AppContext";
import { formatGrams, formatRub } from "@/lib/cn";
import { catalog } from "@/lib/catalog/repository";
import { materializeFromMenu, type CartLine, type OptimizationResult } from "@/lib/optimizer";
import { makeOptimizationInput } from "@/lib/planning/from-profiles";
import { replaceProduct } from "@/lib/planning/alternatives";
import {
  deleteFridgeItem,
  fetchCartItems,
  fetchFridge,
  fetchMealPlan,
  replaceCartItems,
  togglePurchased,
  updateMealPlanResult,
  upsertFridgeItem,
} from "@/lib/supabase/api";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

function alreadyHave(line: CartLine): boolean {
  return (line.toBuyGrams ?? line.quantityGrams) <= 0 && (line.fromFridgeGrams ?? 0) > 0;
}

export function CartPage() {
  const { planId } = useParams();
  const { latestPlan, household, members, cashback, fridge, refresh } = useApp();
  const navigate = useNavigate();
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [purchased, setPurchased] = useState<Record<string, boolean>>({});
  const [itemIds, setItemIds] = useState<Record<string, string>>({});
  const [swapFrom, setSwapFrom] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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
      if ((line.toBuyGrams ?? line.quantityGrams) <= 0) continue;
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

  async function persistCart(next: OptimizationResult) {
    setResult(next);
    if (!id || !household) return;
    await updateMealPlanResult(id, next);
    await replaceCartItems(id, household.id, next);
    await refresh();
  }

  async function toggleBought(productId: string) {
    const next = !purchased[productId];
    setPurchased((prev) => ({ ...prev, [productId]: next }));
    if (itemIds[productId]) await togglePurchased(itemIds[productId], next);
  }

  async function toggleHave(line: CartLine) {
    if (!household || !result || !input || !id) return;
    setSaving(true);
    try {
      if (alreadyHave(line)) {
        await deleteFridgeItem(household.id, line.productId);
      } else {
        await upsertFridgeItem({
          household_id: household.id,
          product_id: line.productId,
          grams: line.quantityGrams,
        });
      }
      const nextFridge = await fetchFridge(household.id);
      const next = materializeFromMenu(
        result.menu,
        {
          ...input,
          fridge: nextFridge.map((item) => ({ productId: item.product_id, grams: item.grams })),
        },
        { trainingPlans: result.trainingPlans },
      );
      await persistCart(next);
    } finally {
      setSaving(false);
    }
  }

  async function applyProductSwap(toId: string) {
    if (!swapFrom || !result || !input || !id || !household) return;
    const next = replaceProduct(result, swapFrom, toId, input);
    setSwapFrom(null);
    await persistCart(next);
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
          Отметьте «уже есть» — продукт не покупаем, сумма корзины пересчитается. «Купили» — галочка для магазина.
        </p>
        <div className="mt-3 space-y-1 text-sm">
          <Row label="Стоимость" value={formatRub(result.totalCost)} />
          <Row label="Cashback" value={formatRub(result.cashback)} />
          <Row label="Итого к покупке" value={formatRub(result.effectiveCost)} strong />
        </div>
        <div className="mt-4 space-y-1 text-sm text-muted">
          {byStore.map(([store, sum]) => (
            <Row key={store} label={store} value={formatRub(sum)} />
          ))}
        </div>
      </Card>

      <div className="mt-4 space-y-3">
        {result.cart.map((line) => {
          const have = alreadyHave(line);
          return (
            <Card key={line.productId} className={have ? "opacity-70" : ""}>
              <div className="font-semibold">{line.productName}</div>
              <div className="mt-1 text-sm text-muted">
                нужно {formatGrams(line.quantityGrams)}
                {have
                  ? " · покупать не нужно"
                  : ` · купить ${line.packageCount} × ${formatGrams(line.packageWeight)} · ${line.storeName}`}
              </div>
              {!have && (
                <div className="mt-1 text-sm">
                  {formatRub(line.price)} · cashback {line.cashbackPercent}% · итого {formatRub(line.effectivePrice)}
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2 font-semibold">
                  <input
                    type="checkbox"
                    className="h-5 w-5"
                    checked={have}
                    disabled={saving}
                    onChange={() => toggleHave(line)}
                  />
                  уже есть
                </label>
                <label className="flex items-center gap-2 text-muted">
                  <input
                    type="checkbox"
                    className="h-5 w-5"
                    checked={Boolean(purchased[line.productId])}
                    onChange={() => toggleBought(line.productId)}
                    disabled={have}
                  />
                  купили
                </label>
              </div>
              <button className="mt-2 text-sm font-semibold text-sage" onClick={() => setSwapFrom(line.productId)}>
                Заменить продукт
              </button>
            </Card>
          );
        })}
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
