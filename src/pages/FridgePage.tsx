import { Screen } from "@/components/layout/Shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/field";
import { useApp } from "@/context/AppContext";
import { catalogWithCustom, slugifyProductName, upsertCustomProduct, withMacroDefaults } from "@/lib/catalog/custom-products";
import { searchProducts } from "@/lib/catalog/search";
import { formatGrams, formatRub } from "@/lib/cn";
import type { Product, ProductCategory } from "@/lib/optimizer/types";
import { deleteFridgeItem, upsertFridgeItem } from "@/lib/supabase/api";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

const CATEGORY_LABELS: Record<ProductCategory, string> = {
  protein: "Белок",
  dairy: "Молочка",
  grain: "Крупы",
  vegetable: "Овощи",
  fruit: "Фрукты",
  fat: "Жиры",
  pantry: "Бакалея",
  snack: "Перекусы",
};

export function FridgePage() {
  const { household, fridge, customProducts, refresh } = useApp();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [grams, setGrams] = useState(400);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [addingNew, setAddingNew] = useState(false);
  const [newCategory, setNewCategory] = useState<ProductCategory>("pantry");
  const [newPrice, setNewPrice] = useState(99);
  const [newPack, setNewPack] = useState(400);

  const catalog = useMemo(() => catalogWithCustom(customProducts), [customProducts]);
  const products = catalog.products;
  const prices = catalog.prices;
  const productById = useMemo(() => new Map(products.map((item) => [item.id, item])), [products]);
  const hits = useMemo(() => searchProducts(products, query, 10), [products, query]);
  const exactHit = hits.some(
    (item) => item.canonical_name.toLowerCase() === query.trim().toLowerCase() || item.id === query.trim(),
  );

  const rows = useMemo(
    () =>
      fridge
        .filter((item) => item.grams > 0)
        .map((item) => {
          const product = productById.get(item.product_id);
          const offer = prices
            .filter((row) => row.canonical_product_id === item.product_id && row.available)
            .sort((a, b) => a.price / a.package_weight - b.price / b.package_weight)[0];
          const value =
            offer && offer.package_weight > 0
              ? (item.grams / offer.package_weight) * offer.price
              : 0;
          return {
            ...item,
            name: product?.canonical_name ?? item.product_id,
            value,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name, "ru")),
    [fridge, productById, prices],
  );
  const fridgeValue = rows.reduce((sum, row) => sum + row.value, 0);

  async function putInFridge(product: Product, amount = grams) {
    if (!household) return;
    const qty = Math.max(1, Math.round(Number(amount) || product.package_weight || 400));
    setPending(true);
    setMessage("");
    try {
      const existing = fridge.find((item) => item.product_id === product.id);
      await upsertFridgeItem({
        household_id: household.id,
        product_id: product.id,
        grams: (existing?.grams ?? 0) + qty,
      });
      setQuery("");
      setGrams(product.package_weight || 400);
      setAddingNew(false);
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Не удалось сохранить");
    } finally {
      setPending(false);
    }
  }

  async function addMissingProduct() {
    if (!household || !query.trim()) return;
    const name = query.trim();
    setPending(true);
    setMessage("");
    try {
      const macros = withMacroDefaults(newCategory);
      const created = {
        id: slugifyProductName(name),
        household_id: household.id,
        name,
        category: newCategory,
        package_weight: Math.max(1, Number(newPack) || 400),
        unit: "g" as const,
        price: Math.max(0, Number(newPrice) || 0),
        store_id: household.preferred_stores?.[0] ?? "magnit",
        ...macros,
      };
      await upsertCustomProduct(created);
      await upsertFridgeItem({
        household_id: household.id,
        product_id: created.id,
        grams: Math.max(1, Math.round(Number(grams) || created.package_weight)),
      });
      setQuery("");
      setAddingNew(false);
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Не удалось добавить продукт");
    } finally {
      setPending(false);
    }
  }

  async function removeItem(productId: string) {
    if (!household) return;
    setPending(true);
    try {
      await deleteFridgeItem(household.id, productId);
      await refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <Screen title="Холодильник">
      <Card className="space-y-3">
        <p className="text-sm text-muted">
          То, что уже дома, попадёт в меню на неделю. В бюджете это скидка: эти граммы не покупаем.
        </p>
        {rows.length > 0 && (
          <p className="text-sm">
            Сейчас в запасе на ~{formatRub(fridgeValue)} — столько можно сэкономить, если блюда это используют.
          </p>
        )}
        <div>
          <Label>Найти продукт</Label>
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setAddingNew(false);
            }}
            placeholder="Курица, творог, кукуруза…"
            autoComplete="off"
          />
        </div>
        <div>
          <Label>Сколько есть, г</Label>
          <Input type="number" min={1} value={grams} onChange={(e) => setGrams(Number(e.target.value))} />
        </div>
        {hits.length > 0 && (
          <ul className="max-h-56 space-y-1 overflow-y-auto rounded-2xl border border-line bg-white p-2">
            {hits.map((product) => (
              <li key={product.id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm hover:bg-paper"
                  disabled={pending}
                  onClick={() => void putInFridge(product)}
                >
                  <span>
                    {product.canonical_name}
                    {product.tags.includes("custom") && (
                      <span className="ml-2 text-xs text-sage">свой</span>
                    )}
                  </span>
                  <span className="text-xs text-muted">
                    {product.package_weight}
                    {product.unit === "ml" ? " мл" : " г"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {query.trim().length >= 2 && !exactHit && (
          <div className="space-y-3 rounded-2xl border border-dashed border-line bg-cream/70 p-3">
            <p className="text-sm text-muted">
              «{query.trim()}» нет в каталоге. Добавьте как свой продукт — он сразу попадёт в холодильник и в меню.
            </p>
            {!addingNew ? (
              <Button className="w-full" variant="secondary" disabled={pending} onClick={() => setAddingNew(true)}>
                Добавить «{query.trim()}»
              </Button>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Категория</Label>
                    <Select
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value as ProductCategory)}
                    >
                      {Object.entries(CATEGORY_LABELS).map(([id, label]) => (
                        <option key={id} value={id}>
                          {label}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label>Цена упаковки, ₽</Label>
                    <Input type="number" min={0} value={newPrice} onChange={(e) => setNewPrice(Number(e.target.value))} />
                  </div>
                </div>
                <div>
                  <Label>Вес упаковки, г</Label>
                  <Input type="number" min={1} value={newPack} onChange={(e) => setNewPack(Number(e.target.value))} />
                </div>
                <Button className="w-full" disabled={pending || !household} onClick={() => void addMissingProduct()}>
                  {pending ? "Добавляем…" : "Сохранить в холодильник"}
                </Button>
              </>
            )}
          </div>
        )}
        {message && <p className="text-sm text-clay">{message}</p>}
      </Card>

      <div className="mt-4 space-y-2">
        {rows.length === 0 && (
          <p className="text-sm text-muted">Пока пусто. Найдите продукт сверху и нажмите на него.</p>
        )}
        {rows.map((item) => (
          <Card key={item.product_id} className="flex items-center justify-between gap-3">
            <div>
              <div className="font-semibold">{item.name}</div>
              <div className="text-sm text-muted">
                {formatGrams(item.grams)}
                {item.value > 0 ? ` · запас ~${formatRub(item.value)}` : ""}
              </div>
            </div>
            <button
              type="button"
              className="text-sm font-semibold text-sage"
              disabled={pending}
              onClick={() => void removeItem(item.product_id)}
            >
              Убрать
            </button>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-2">
        <Button onClick={() => navigate("/plan")}>Составить меню с холодильником</Button>
        <Button variant="secondary" onClick={() => navigate("/cart")}>
          К корзине
        </Button>
      </div>
    </Screen>
  );
}
