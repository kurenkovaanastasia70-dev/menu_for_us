import type { FridgeItem } from "@/lib/supabase/types";
import type { CustomProduct } from "@/lib/catalog/custom-products";

export function mergeFridgeItems(remote: FridgeItem[], local: FridgeItem[]): FridgeItem[] {
  const byId = new Map<string, FridgeItem>();
  for (const item of remote) {
    if (Number(item.grams) > 0) byId.set(item.product_id, item);
  }
  for (const item of local) {
    if (Number(item.grams) <= 0) continue;
    const existing = byId.get(item.product_id);
    if (!existing) {
      byId.set(item.product_id, item);
      continue;
    }
    if (Number(item.grams) > Number(existing.grams)) {
      byId.set(item.product_id, { ...existing, grams: item.grams });
    }
  }
  return [...byId.values()];
}

export function mergeCustomProducts(remote: CustomProduct[], local: CustomProduct[]): CustomProduct[] {
  const byId = new Map<string, CustomProduct>();
  for (const item of remote) byId.set(item.id, item);
  for (const item of local) {
    if (!byId.has(item.id)) byId.set(item.id, item);
  }
  return [...byId.values()];
}

export function fridgeSignature(items: FridgeItem[]): string {
  return items
    .filter((item) => Number(item.grams) > 0)
    .map((item) => `${item.product_id}:${Math.round(Number(item.grams))}`)
    .sort()
    .join("|");
}
