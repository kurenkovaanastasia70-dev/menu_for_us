import { Screen } from "@/components/layout/Shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useApp } from "@/context/AppContext";
import { fridgeStockAfterToggle, lineAlreadyHave } from "@/lib/cart/already-have";
import { formatGrams, formatRub } from "@/lib/cn";
import { catalog } from "@/lib/catalog/repository";
import { materializeFromMenu, syncCartWithMenu, type CartLine, type OptimizationResult } from "@/lib/optimizer";
import { makeOptimizationInput } from "@/lib/planning/from-profiles";
import { replaceProduct } from "@/lib/planning/alternatives";
import {
  deleteFridgeItem,
  fetchCartItems,
  fetchMealPlan,
  replaceCartItems,
  togglePurchased,
  updateMealPlanResult,
  upsertFridgeItem,
} from "@/lib/supabase/api";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

export function CartPage() {
  const { planId } = useParams();
  const { latestPlan, household, members, cashback, fridge, customProducts, refresh } = useApp();
  const navigate = useNavigate();
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [purchased, setPurchased] = useState<Record<string, boolean>>({});
  const [itemIds, setItemIds] = useState<Record<string, string>>({});
  const [swapFrom, setSwapFrom] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const id = planId ?? latestPlan?.id;

  const input = useMemo(() => {
    if (!household || !members.length || (!latestPlan && !result && !id)) return null;
    const days = latestPlan?.days ?? (result ? Math.max(0, ...result.menu.map((meal) => meal.dayIndex)) + 1 : 7);
    return makeOptimizationInput({
      profiles: members,
      household,
      cashback,
      days,
      budget: Number(latestPlan?.budget ?? household.default_budget),
      fridge,
      customProducts,
    });
  }, [household, members, cashback, latestPlan, fridge, result, id, customProducts]);

  useEffect(() => {
    if (!id || !household || members.length === 0) return;
    const row = latestPlan && latestPlan.id === id ? latestPlan : null;
    const load = row ? Promise.resolve(row) : fetchMealPlan(id);
    let cancelled = false;
    load.then(async (plan) => {
      if (!plan || cancelled) return;
      const raw = plan.result_json as OptimizationResult;
      const planInput = makeOptimizationInput({
        profiles: members,
        household,
        cashback,
        days: plan.days,
        budget: Number(plan.budget),
        fridge,
        customProducts,
      });
      const synced = syncCartWithMenu(raw, planInput);
      const before = raw.cart.map((line) => line.productId).sort().join(",");
      const after = synced.cart.map((line) => line.productId).sort().join(",");
      setResult(synced);
      if (before !== after) {
        await updateMealPlanResult(plan.id, synced);
        await replaceCartItems(plan.id, household.id, synced);
        await refresh();
      }
      const items = await fetchCartItems(plan.id);
      if (cancelled) return;
      const map: Record<string, boolean> = {};
      const ids: Record<string, string> = {};
      for (const item of items as Array<{ id: string; product_id: string; purchased: boolean }>) {
        map[item.product_id] = item.purchased;
        ids[item.product_id] = item.id;
      }
      setPurchased(map);
      setItemIds(ids);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync when plan/fridge/catalog context changes
  }, [id, latestPlan?.id, household?.id, members, cashback, fridge, customProducts]);

  const byStore = useMemo(() => {
    const groups = new Map<string, number>();
    for (const line of result?.cart ?? []) {
      if ((line.toBuyGrams ?? line.quantityGrams) <= 0) continue;
      groups.set(line.storeName, (groups.get(line.storeName) ?? 0) + line.effectivePrice);
    }
    return [...groups.entries()];
  }, [result]);

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
    if (!household || !result || !id) return;
    const markHave = !lineAlreadyHave(line);
    setSaving(true);
    setError("");
    try {
      const nextFridge = markHave
        ? await upsertFridgeItem({
            household_id: household.id,
            product_id: line.productId,
            grams: line.quantityGrams,
          })
        : await deleteFridgeItem(household.id, line.productId);
      const stock = fridgeStockAfterToggle(
        nextFridge.map((item) => ({ productId: item.product_id, grams: Number(item.grams) })),
        line,
        markHave,
      );
      let next: OptimizationResult;
      if (input) {
        next = materializeFromMenu(
          result.menu,
          { ...input, fridge: stock },
          { trainingPlans: result.trainingPlans },
        );
      } else {
        next = {
          ...result,
          cart: result.cart.map((item) =>
            item.productId === line.productId
              ? {
                  ...item,
                  haveAtHome: markHave,
                  fromFridgeGrams: markHave ? item.quantityGrams : 0,
                  toBuyGrams: markHave ? 0 : item.quantityGrams,
                  packageCount: markHave ? 0 : item.packageCount,
                  price: markHave ? 0 : item.price,
                  cashback: markHave ? 0 : item.cashback,
                  effectivePrice: markHave ? 0 : item.effectivePrice,
                }
              : item,
          ),
        };
        next.totalCost = next.cart.reduce((sum, item) => sum + item.price, 0);
        next.cashback = next.cart.reduce((sum, item) => sum + item.cashback, 0);
        next.effectiveCost = next.cart.reduce((sum, item) => sum + item.effectivePrice, 0);
      }
      next = {
        ...next,
        cart: next.cart.map((item) => ({
          ...item,
          haveAtHome: item.productId === line.productId ? markHave : lineAlreadyHave(item),
        })),
      };
      await persistCart(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось отметить продукт");
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
      {error && <p className="mt-4 text-sm text-clay">{error}</p>}

      <div className="mt-4 space-y-3">
        {result.cart.map((line) => {
          const have = lineAlreadyHave(line);
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
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button variant={have ? "primary" : "secondary"} disabled={saving} onClick={() => toggleHave(line)}>
                  {have ? "Уже есть ✓" : "Уже есть"}
                </Button>
                <Button
                  variant={purchased[line.productId] ? "primary" : "secondary"}
                  disabled={have || saving}
                  onClick={() => toggleBought(line.productId)}
                >
                  {purchased[line.productId] ? "Купили ✓" : "Купили"}
                </Button>
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
