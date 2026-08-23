import { Screen } from "@/components/layout/Shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useApp } from "@/context/AppContext";
import {
  fridgeStockAfterToggle,
  groupCartLines,
  lineAlreadyHave,
  lineFridgeStatus,
  lineToBuyGrams,
} from "@/lib/cart/already-have";
import { cn, formatGrams, formatRub } from "@/lib/cn";
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
      const cartSignature = (cart: OptimizationResult["cart"]) =>
        cart
          .map((line) => `${line.productId}:${line.toBuyGrams ?? line.quantityGrams}:${line.fromFridgeGrams ?? 0}`)
          .sort()
          .join(",");
      setResult(synced);
      if (cartSignature(raw.cart) !== cartSignature(synced.cart)) {
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

  const grouped = useMemo(() => groupCartLines(result?.cart ?? []), [result]);

  const byStore = useMemo(() => {
    const groups = new Map<string, number>();
    for (const line of [...grouped.partial, ...grouped.buy]) {
      if (lineToBuyGrams(line) <= 0) continue;
      groups.set(line.storeName, (groups.get(line.storeName) ?? 0) + line.effectivePrice);
    }
    return [...groups.entries()];
  }, [grouped]);

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
        next.grossCost = Math.max(next.grossCost ?? next.effectiveCost, next.effectiveCost);
        next.fridgeDiscount = Math.max(0, (next.grossCost ?? next.effectiveCost) - next.effectiveCost);
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
          Что полностью есть дома, сразу уходит вниз — на это можно не смотреть. Если запаса не хватает, позиция
          помечена «докупить». Запас правится в{" "}
          <button type="button" className="font-semibold text-sage" onClick={() => navigate("/fridge")}>
            холодильнике
          </button>
          .
        </p>
        <div className="mt-3 space-y-1 text-sm">
          {(result.grossCost ?? result.effectiveCost) > result.effectiveCost && (
            <Row label="Без холодильника" value={formatRub(result.grossCost ?? result.effectiveCost)} />
          )}
          {(result.fridgeDiscount ?? 0) > 0 && (
            <Row label="Скидка холодильника" value={`−${formatRub(result.fridgeDiscount ?? 0)}`} />
          )}
          <Row label="Стоимость покупок" value={formatRub(result.totalCost)} />
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

      {grouped.partial.length + grouped.buy.length > 0 && (
        <div className="mt-4 space-y-3">
          {grouped.partial.map((line) => (
            <CartItemCard
              key={line.productId}
              line={line}
              purchased={Boolean(purchased[line.productId])}
              saving={saving}
              onHave={() => toggleHave(line)}
              onBought={() => toggleBought(line.productId)}
              onSwap={() => setSwapFrom(line.productId)}
            />
          ))}
          {grouped.buy.map((line) => (
            <CartItemCard
              key={line.productId}
              line={line}
              purchased={Boolean(purchased[line.productId])}
              saving={saving}
              onHave={() => toggleHave(line)}
              onBought={() => toggleBought(line.productId)}
              onSwap={() => setSwapFrom(line.productId)}
            />
          ))}
        </div>
      )}

      {grouped.have.length > 0 && (
        <details className="mt-6 rounded-3xl border border-dashed border-line bg-white/60 p-4">
          <summary className="cursor-pointer list-none font-semibold text-muted">
            Уже есть — не покупаем · {grouped.have.length}
            <span className="mt-1 block text-sm font-normal">Можно не смотреть, запас покрывает меню.</span>
          </summary>
          <div className="mt-3 space-y-2">
            {grouped.have.map((line) => (
              <div key={line.productId} className="flex items-start justify-between gap-3 rounded-2xl bg-cream/80 px-3 py-2">
                <div>
                  <div className="font-semibold text-muted">{line.productName}</div>
                  <div className="text-sm text-muted">
                    нужно {formatGrams(line.quantityGrams)} · есть {formatGrams(line.fromFridgeGrams || line.quantityGrams)}
                  </div>
                </div>
                <button
                  type="button"
                  className="shrink-0 text-sm font-semibold text-sage"
                  disabled={saving}
                  onClick={() => toggleHave(line)}
                >
                  Вернуть
                </button>
              </div>
            ))}
          </div>
        </details>
      )}

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

function CartItemCard({
  line,
  purchased,
  saving,
  onHave,
  onBought,
  onSwap,
}: {
  line: CartLine;
  purchased: boolean;
  saving: boolean;
  onHave: () => void;
  onBought: () => void;
  onSwap: () => void;
}) {
  const status = lineFridgeStatus(line);
  const have = status === "have";
  const partial = status === "partial";
  const fromFridge = Number(line.fromFridgeGrams ?? 0);
  const toBuy = lineToBuyGrams(line);

  return (
    <Card className={cn(partial && "border-clay/50 bg-clay/5")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="font-semibold">{line.productName}</div>
        {partial && (
          <span className="rounded-full bg-clay px-2.5 py-1 text-xs font-semibold text-white">
            Докупить {formatGrams(toBuy)}
          </span>
        )}
      </div>
      <div className="mt-1 text-sm text-muted">
        нужно {formatGrams(line.quantityGrams)}
        {partial && fromFridge > 0 ? ` · дома уже ${formatGrams(fromFridge)}` : ""}
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
        <Button variant={have ? "primary" : "secondary"} disabled={saving} onClick={onHave}>
          {have ? "Уже есть ✓" : partial ? "Есть целиком" : "Уже есть"}
        </Button>
        <Button variant={purchased ? "primary" : "secondary"} disabled={have || saving} onClick={onBought}>
          {purchased ? "Купили ✓" : "Купили"}
        </Button>
      </div>
      <button className="mt-2 text-sm font-semibold text-sage" onClick={onSwap}>
        Заменить продукт
      </button>
    </Card>
  );
}
