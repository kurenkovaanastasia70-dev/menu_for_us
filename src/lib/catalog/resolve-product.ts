import type { Product } from "@/lib/optimizer/types";
import { searchProducts } from "./search";

function normalizeKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "");
}

/** Частые подписи модели, когда вместо id приходит имя. */
const ALIASES: Record<string, string> = {
  chicken: "chicken_breast",
  курица: "chicken_breast",
  куриц: "chicken_breast",
  грудка: "chicken_breast",
  куриная_грудка: "chicken_breast",
  куриное_филе: "chicken_breast",
  филе_курицы: "chicken_breast",
  филе_куриное: "chicken_breast",
  бедро: "chicken_thigh",
  бедра: "chicken_thigh",
  бедрышко: "chicken_thigh",
  куриное_бедро: "chicken_thigh",
  индейка: "turkey_fillet",
  turkey: "turkey_fillet",
  филе_индейки: "turkey_fillet",
  стейк_индейки: "turkey_steak",
  говядина: "beef",
  beef: "beef",
  свинина: "pork_tenderloin",
  pork: "pork_tenderloin",
  фарш: "ground_chicken",
  фарш_куриный: "ground_chicken",
  фарш_индейки: "ground_turkey",
  овсянка: "oats",
  овес: "oats",
  oatmeal: "oats",
  хлопья: "oats",
  творог: "cottage_cheese",
  молоко: "milk",
  йогурт: "yogurt",
  греческий_йогурт: "greek_yogurt",
  сметана: "sour_cream",
  сыр: "cheese",
  картошка: "potato",
  картофель: "potato",
  помидор: "tomato",
  помидоры: "tomato",
  томат: "tomato",
  огурец: "cucumber",
  огурцы: "cucumber",
  рис: "rice",
  гречка: "buckwheat",
  гречневая: "buckwheat",
  яйцо: "eggs",
  яйца: "eggs",
  яйца_куриные: "eggs",
  лук: "onion",
  морковь: "carrot",
  капуста: "cabbage",
  хлеб: "bread",
  макароны: "pasta",
  масло: "sunflower_oil",
  подсолнечное: "sunflower_oil",
  подсолнечное_масло: "sunflower_oil",
  оливковое: "olive_oil",
  оливковое_масло: "olive_oil",
  сливочное_масло: "butter",
  olive_oil: "olive_oil",
  мед: "honey",
  ягоды: "berries",
  ягодный_микс: "berries",
  чеснок: "garlic",
  перец: "bell_pepper",
  болгарский_перец: "bell_pepper",
  кабачок: "zucchini",
  кабачки: "zucchini",
  шампиньоны: "mushroom",
  грибы: "mushroom",
  свёкла: "beet",
  свекла: "beet",
  минтай: "pollock",
  лосось: "salmon",
  тунец: "tuna_can",
};

export function resolveProductId(raw: string | undefined, products: Product[]): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (products.some((item) => item.id === trimmed)) return trimmed;

  const key = normalizeKey(trimmed);
  if (!key) return null;

  const byId = products.find((item) => item.id === key || normalizeKey(item.id) === key);
  if (byId) return byId.id;

  const byName = products.find((item) => normalizeKey(item.canonical_name) === key);
  if (byName) return byName.id;

  const alias = ALIASES[key];
  if (alias && products.some((item) => item.id === alias)) return alias;

  const contains = products.filter((item) => {
    const name = normalizeKey(item.canonical_name);
    const id = normalizeKey(item.id);
    return name === key || id === key || name.startsWith(`${key}_`) || id.startsWith(`${key}_`);
  });
  if (contains.length === 1) return contains[0].id;

  const included = products.filter((item) => {
    const name = normalizeKey(item.canonical_name);
    return name.includes(key) || (key.length >= 5 && key.includes(name));
  });
  if (included.length === 1) return included[0].id;

  const hits = searchProducts(products, trimmed, 4);
  if (hits.length === 1) return hits[0].id;
  if (hits.length > 1) {
    const top = normalizeKey(hits[0].canonical_name);
    const second = normalizeKey(hits[1].canonical_name);
    if (top.startsWith(key) && !second.startsWith(key)) return hits[0].id;
    if (top === key) return hits[0].id;
  }
  return null;
}

function parseGrams(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.round(raw);
  if (typeof raw === "string") {
    const match = raw.replace(",", ".").match(/(\d+(?:\.\d+)?)/);
    return match ? Math.round(Number(match[1])) : 0;
  }
  return 0;
}

export interface LlmIngredientLike {
  product_id?: string;
  id?: string;
  n?: string;
  name?: string;
  grams?: number | string;
  g?: number | string;
  amount?: number | string;
  weight?: number | string;
}

export function resolveLlmIngredients(
  raw: LlmIngredientLike[] | undefined,
  products: Product[],
  excluded: string[] = [],
): Array<{ product_id: string; grams: number }> {
  const blocked = new Set(excluded);
  const out: Array<{ product_id: string; grams: number }> = [];
  const seen = new Map<string, number>();
  for (const item of raw ?? []) {
    const grams = parseGrams(item.grams ?? item.g ?? item.amount ?? item.weight);
    if (grams <= 0) continue;
    const resolved =
      resolveProductId(item.product_id, products) ??
      resolveProductId(item.id, products) ??
      resolveProductId(item.n, products) ??
      resolveProductId(item.name, products);
    if (!resolved || blocked.has(resolved)) continue;
    seen.set(resolved, (seen.get(resolved) ?? 0) + grams);
  }
  for (const [product_id, grams] of seen) {
    out.push({ product_id, grams });
  }
  return out;
}
