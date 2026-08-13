import { Screen } from "@/components/layout/Shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/field";
import { useApp } from "@/context/AppContext";
import { catalog } from "@/lib/catalog/repository";
import { formatGrams } from "@/lib/cn";
import { deleteFridgeItem, upsertFridgeItem } from "@/lib/supabase/api";
import { useMemo, useState } from "react";

export function FridgePage() {
  const { household, fridge, refresh } = useApp();
  const [query, setQuery] = useState("");
  const [grams, setGrams] = useState(300);
  const [selected, setSelected] = useState("chicken_breast");

  const products = catalog.getProducts();
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products.slice(0, 12);
    return products.filter((item) => item.canonical_name.toLowerCase().includes(q)).slice(0, 12);
  }, [products, query]);

  async function add() {
    if (!household) return;
    await upsertFridgeItem({ household_id: household.id, product_id: selected, grams: Number(grams) });
    await refresh();
  }

  async function remove(productId: string) {
    if (!household) return;
    await deleteFridgeItem(household.id, productId);
    await refresh();
  }

  return (
    <Screen title="Холодильник">
      <p className="mb-4 text-sm text-muted">
        Отметьте, что уже есть дома. Эти продукты вычтутся из корзины, когда составите меню на пару.
      </p>
      <Card className="space-y-3">
        <div>
          <Label>Найти продукт</Label>
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="курица, рис, яйца" />
        </div>
        <div className="flex max-h-40 flex-col gap-1 overflow-auto">
          {filtered.map((product) => (
            <button
              key={product.id}
              className={`rounded-2xl px-3 py-2 text-left text-sm ${selected === product.id ? "bg-sage text-white" : "bg-cream"}`}
              onClick={() => setSelected(product.id)}
            >
              {product.canonical_name}
            </button>
          ))}
        </div>
        <div>
          <Label>Сколько есть, г</Label>
          <Input type="number" min={1} value={grams} onChange={(e) => setGrams(Number(e.target.value))} />
        </div>
        <Button className="w-full" onClick={add}>
          Добавить в холодильник
        </Button>
      </Card>
      <div className="mt-4 space-y-2">
        {fridge.length === 0 ? (
          <p className="text-sm text-muted">Пока пусто — корзина будет полной.</p>
        ) : (
          fridge.map((item) => {
            const product = catalog.getProduct(item.product_id);
            return (
              <Card key={item.product_id} className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-semibold">{product?.canonical_name ?? item.product_id}</div>
                  <div className="text-sm text-muted">{formatGrams(item.grams)}</div>
                </div>
                <button className="text-sm font-semibold text-clay" onClick={() => remove(item.product_id)}>
                  Убрать
                </button>
              </Card>
            );
          })
        )}
      </div>
    </Screen>
  );
}
