import type { CartLine } from "@/lib/optimizer/types";

export function lineAlreadyHave(line: CartLine): boolean {
  if (line.haveAtHome) return true;
  const toBuy = line.toBuyGrams ?? line.quantityGrams;
  return toBuy <= 0 && Number(line.fromFridgeGrams ?? 0) > 0;
}

export function fridgeStockAfterToggle(
  fridge: Array<{ productId: string; grams: number }>,
  line: CartLine,
  have: boolean,
): Array<{ productId: string; grams: number }> {
  const rest = fridge.filter((item) => item.productId !== line.productId);
  if (!have) return rest;
  return [...rest, { productId: line.productId, grams: Number(line.quantityGrams) || 0 }];
}
