import type { Product, ProductCategory, StoreProduct } from "@/lib/optimizer/types";
import { catalog } from "./repository";

export interface CustomProduct {
  id: string;
  household_id: string;
  name: string;
  category: ProductCategory;
  package_weight: number;
  unit: "g" | "ml";
  price: number;
  store_id: string;
  calories_per_100g: number;
  protein_per_100g: number;
  fat_per_100g: number;
  carbs_per_100g: number;
  fiber_per_100g?: number;
  iron_per_100g?: number;
}

const KEY = (householdId: string) => `menu-for-us-custom-products-${householdId}`;

export function readCustomProducts(householdId: string): CustomProduct[] {
  try {
    const raw = localStorage.getItem(KEY(householdId));
    return raw ? (JSON.parse(raw) as CustomProduct[]) : [];
  } catch {
    return [];
  }
}

export function writeCustomProducts(householdId: string, items: CustomProduct[]) {
  localStorage.setItem(KEY(householdId), JSON.stringify(items));
}

export function slugifyProductName(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return `custom_${base || "product"}_${Math.random().toString(36).slice(2, 7)}`;
}

const MACRO_DEFAULTS: Record<
  ProductCategory,
  { cal: number; p: number; f: number; c: number; fiber: number; iron: number }
> = {
  protein: { cal: 150, p: 20, f: 8, c: 0, fiber: 0, iron: 1.5 },
  dairy: { cal: 100, p: 8, f: 4, c: 6, fiber: 0, iron: 0.2 },
  grain: { cal: 340, p: 10, f: 2, c: 70, fiber: 4, iron: 1.5 },
  vegetable: { cal: 30, p: 1.5, f: 0.2, c: 5, fiber: 2, iron: 0.5 },
  fruit: { cal: 55, p: 0.5, f: 0.2, c: 12, fiber: 2, iron: 0.3 },
  fat: { cal: 750, p: 0, f: 82, c: 0, fiber: 0, iron: 0 },
  pantry: { cal: 200, p: 5, f: 5, c: 30, fiber: 2, iron: 1 },
  snack: { cal: 400, p: 8, f: 20, c: 40, fiber: 3, iron: 1 },
};

export function withMacroDefaults(
  category: ProductCategory,
  overrides?: Partial<Pick<CustomProduct, "calories_per_100g" | "protein_per_100g" | "fat_per_100g" | "carbs_per_100g">>,
): Pick<CustomProduct, "calories_per_100g" | "protein_per_100g" | "fat_per_100g" | "carbs_per_100g" | "fiber_per_100g" | "iron_per_100g"> {
  const d = MACRO_DEFAULTS[category] ?? MACRO_DEFAULTS.pantry;
  return {
    calories_per_100g: overrides?.calories_per_100g ?? d.cal,
    protein_per_100g: overrides?.protein_per_100g ?? d.p,
    fat_per_100g: overrides?.fat_per_100g ?? d.f,
    carbs_per_100g: overrides?.carbs_per_100g ?? d.c,
    fiber_per_100g: d.fiber,
    iron_per_100g: d.iron,
  };
}

export function customToProduct(item: CustomProduct): Product {
  return {
    id: item.id,
    canonical_name: item.name,
    category: item.category,
    calories_per_100g: item.calories_per_100g,
    protein_per_100g: item.protein_per_100g,
    fat_per_100g: item.fat_per_100g,
    carbs_per_100g: item.carbs_per_100g,
    fiber_per_100g: item.fiber_per_100g ?? 0,
    iron_per_100g: item.iron_per_100g ?? 0,
    package_weight: item.package_weight,
    unit: item.unit,
    tags: ["custom"],
  };
}

export function customToStoreProduct(item: CustomProduct): StoreProduct {
  return {
    id: `${item.store_id}_${item.id}`,
    canonical_product_id: item.id,
    store_id: item.store_id,
    external_id: item.id,
    name: item.name,
    brand: "Свой продукт",
    package_weight: item.package_weight,
    price: item.price,
    available: true,
    url: "",
    updated_at: new Date().toISOString().slice(0, 10),
  };
}

/** Базовый каталог + пользовательские продукты и их цены. */
export function catalogWithCustom(custom: CustomProduct[]): {
  products: Product[];
  prices: StoreProduct[];
} {
  const baseProducts = catalog.getProducts();
  const basePrices = catalog.getStoreProducts();
  if (custom.length === 0) return { products: baseProducts, prices: basePrices };

  const byId = new Map(baseProducts.map((item) => [item.id, item]));
  for (const item of custom) byId.set(item.id, customToProduct(item));

  const prices = [
    ...basePrices.filter((offer) => !custom.some((item) => item.id === offer.canonical_product_id)),
    ...custom.map(customToStoreProduct),
  ];

  return { products: [...byId.values()], prices };
}

export async function fetchCustomProducts(householdId: string): Promise<CustomProduct[]> {
  return readCustomProducts(householdId);
}

export async function upsertCustomProduct(item: CustomProduct): Promise<CustomProduct[]> {
  const current = readCustomProducts(item.household_id);
  const next = [...current.filter((row) => row.id !== item.id), item];
  writeCustomProducts(item.household_id, next);
  return next;
}

export async function deleteCustomProduct(householdId: string, productId: string): Promise<CustomProduct[]> {
  const next = readCustomProducts(householdId).filter((row) => row.id !== productId);
  writeCustomProducts(householdId, next);
  return next;
}
