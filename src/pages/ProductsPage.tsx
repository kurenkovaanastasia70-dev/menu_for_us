import { Screen } from "@/components/layout/Shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { useApp } from "@/context/AppContext";
import { catalogWithCustom } from "@/lib/catalog/custom-products";
import { cn } from "@/lib/cn";
import type { ProductCategory } from "@/lib/optimizer/types";
import { DEFAULT_EXCLUDED_PRODUCT_IDS } from "@/lib/planning/from-profiles";
import { upsertProfile } from "@/lib/supabase/api";
import { X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const CATEGORY_ORDER: ProductCategory[] = [
  "protein",
  "dairy",
  "grain",
  "vegetable",
  "fruit",
  "fat",
  "pantry",
  "snack",
];

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

type FilterMode = "all" | "active" | "excluded";

export function ProductsPage() {
  const { profile, customProducts, refresh } = useApp();
  const [excludedIds, setExcludedIds] = useState<string[]>(() =>
    [...new Set([...(profile?.excluded_products ?? []), ...DEFAULT_EXCLUDED_PRODUCT_IDS])],
  );
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterMode>("all");
  const [category, setCategory] = useState<ProductCategory | "all">("all");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setExcludedIds(
      [...new Set([...(profile?.excluded_products ?? []), ...DEFAULT_EXCLUDED_PRODUCT_IDS])],
    );
  }, [profile?.id, profile?.excluded_products]);

  const products = useMemo(() => catalogWithCustom(customProducts).products, [customProducts]);
  const excludedSet = useMemo(() => new Set(excludedIds), [excludedIds]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products
      .filter((product) => {
        if (category !== "all" && product.category !== category) return false;
        const isExcluded = excludedSet.has(product.id);
        if (filter === "active" && isExcluded) return false;
        if (filter === "excluded" && !isExcluded) return false;
        if (!q) return true;
        return (
          product.canonical_name.toLowerCase().includes(q) ||
          product.id.toLowerCase().includes(q) ||
          product.tags.some((tag) => tag.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => a.canonical_name.localeCompare(b.canonical_name, "ru"));
  }, [products, category, filter, excludedSet, query]);

  const byCategory = useMemo(() => {
    const map = new Map<ProductCategory, typeof filtered>();
    for (const product of filtered) {
      const list = map.get(product.category) ?? [];
      list.push(product);
      map.set(product.category, list);
    }
    return CATEGORY_ORDER.filter((key) => (map.get(key)?.length ?? 0) > 0).map((key) => ({
      key,
      label: CATEGORY_LABELS[key],
      items: map.get(key) ?? [],
    }));
  }, [filtered]);

  const stats = useMemo(() => {
    const total = products.length;
    const excluded = products.filter((product) => excludedSet.has(product.id)).length;
    const perCategory = CATEGORY_ORDER.map((key) => ({
      key,
      label: CATEGORY_LABELS[key],
      total: products.filter((product) => product.category === key).length,
      active: products.filter((product) => product.category === key && !excludedSet.has(product.id)).length,
    })).filter((row) => row.total > 0);
    return { total, excluded, active: total - excluded, perCategory };
  }, [products, excludedSet]);

  async function persistExcluded(nextIds: string[]) {
    if (!profile) return;
    const merged = [...new Set([...DEFAULT_EXCLUDED_PRODUCT_IDS, ...nextIds])];
    setExcludedIds(merged);
    setMessage("");
    try {
      await upsertProfile({
        ...profile,
        excluded_products: merged,
      });
      await refresh();
    } catch (err) {
      setExcludedIds(
        [...new Set([...(profile.excluded_products ?? []), ...DEFAULT_EXCLUDED_PRODUCT_IDS])],
      );
      setMessage(err instanceof Error ? err.message : "Не удалось сохранить");
    }
  }

  async function toggleExcluded(productId: string) {
    if (!profile || DEFAULT_EXCLUDED_PRODUCT_IDS.includes(productId)) return;
    setPendingId(productId);
    const next = excludedSet.has(productId)
      ? excludedIds.filter((id) => id !== productId)
      : [...excludedIds, productId];
    try {
      await persistExcluded(next);
    } finally {
      setPendingId(null);
    }
  }

  return (
    <Screen title="Продукты">
      <Card className="space-y-3">
        <p className="text-sm text-muted">
          Весь каталог для оценки разнообразия. Крестик — продукт не попадёт в меню и корзину. Сохраняется сразу.
        </p>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl bg-cream px-2 py-3">
            <div className="font-display text-2xl">{stats.total}</div>
            <div className="text-xs text-muted">всего</div>
          </div>
          <div className="rounded-2xl bg-cream px-2 py-3">
            <div className="font-display text-2xl">{stats.active}</div>
            <div className="text-xs text-muted">в меню</div>
          </div>
          <div className="rounded-2xl bg-cream px-2 py-3">
            <div className="font-display text-2xl">{stats.excluded}</div>
            <div className="text-xs text-muted">крестик</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {stats.perCategory.map((row) => (
            <button
              key={row.key}
              type="button"
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-semibold",
                category === row.key ? "border-sage bg-sage text-white" : "border-line bg-white text-muted",
              )}
              onClick={() => setCategory((prev) => (prev === row.key ? "all" : row.key))}
            >
              {row.label} {row.active}/{row.total}
            </button>
          ))}
        </div>
      </Card>

      <div className="mt-4 space-y-3">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск: курица, творог, овсянка…"
        />
        <div className="flex gap-2">
          {(
            [
              ["all", "Все"],
              ["active", "В меню"],
              ["excluded", "С крестиком"],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              type="button"
              variant={filter === value ? "primary" : "secondary"}
              className="flex-1 py-2"
              onClick={() => setFilter(value)}
            >
              {label}
            </Button>
          ))}
        </div>
        {message && <p className="text-sm text-clay">{message}</p>}
      </div>

      <div className="mt-6 space-y-6">
        {byCategory.length === 0 && (
          <p className="text-sm text-muted">Ничего не найдено. Смените фильтр или поиск.</p>
        )}
        {byCategory.map((group) => (
          <section key={group.key}>
            <h2 className="mb-2 font-display text-xl">
              {group.label}{" "}
              <span className="text-base text-muted">({group.items.length})</span>
            </h2>
            <ul className="space-y-2">
              {group.items.map((product) => {
                const isExcluded = excludedSet.has(product.id);
                const isDefault = DEFAULT_EXCLUDED_PRODUCT_IDS.includes(product.id);
                const busy = pendingId === product.id;
                return (
                  <li
                    key={product.id}
                    className={cn(
                      "flex items-center gap-3 rounded-2xl border border-line bg-white px-3 py-2",
                      isExcluded && "bg-cream/80",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className={cn("truncate text-sm font-semibold", isExcluded && "text-muted line-through")}>
                        {product.canonical_name}
                        {product.tags.includes("custom") && (
                          <span className="ml-2 text-xs font-normal text-sage">свой</span>
                        )}
                      </div>
                      <div className="text-xs text-muted">
                        {product.package_weight}
                        {product.unit === "ml" ? " мл" : " г"}
                        {isDefault ? " · всегда исключено" : ""}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={!profile || busy || isDefault}
                      aria-label={isExcluded ? "Вернуть в меню" : "Исключить"}
                      title={
                        isDefault
                          ? "Исключено по умолчанию"
                          : isExcluded
                            ? "Вернуть в меню"
                            : "Поставить крестик"
                      }
                      className={cn(
                        "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition",
                        isExcluded
                          ? "border-clay bg-clay text-white"
                          : "border-line bg-white text-muted hover:border-clay hover:text-clay",
                        (busy || isDefault) && "opacity-60",
                      )}
                      onClick={() => void toggleExcluded(product.id)}
                    >
                      <X size={18} strokeWidth={2.5} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </Screen>
  );
}
