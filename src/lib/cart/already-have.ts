import type { CartLine } from "@/lib/optimizer/types";

export type CartLineStatus = "have" | "partial" | "buy";

export function lineToBuyGrams(line: CartLine): number {
  if (typeof line.toBuyGrams === "number") return Math.max(0, line.toBuyGrams);
  const fromFridge = Number(line.fromFridgeGrams ?? 0);
  return Math.max(0, line.quantityGrams - fromFridge);
}

export function lineFridgeStatus(line: CartLine): CartLineStatus {
  const fromFridge = Number(line.fromFridgeGrams ?? 0);
  const toBuy = lineToBuyGrams(line);
  if (fromFridge > 0 && toBuy > 0) return "partial";
  if (toBuy <= 0 && (fromFridge > 0 || line.haveAtHome)) return "have";
  if (line.haveAtHome) return "have";
  return "buy";
}

export function lineAlreadyHave(line: CartLine): boolean {
  return lineFridgeStatus(line) === "have";
}

export function groupCartLines(cart: CartLine[]): {
  buy: CartLine[];
  partial: CartLine[];
  have: CartLine[];
} {
  const buy: CartLine[] = [];
  const partial: CartLine[] = [];
  const have: CartLine[] = [];
  for (const line of cart) {
    const status = lineFridgeStatus(line);
    if (status === "have") have.push(line);
    else if (status === "partial") partial.push(line);
    else buy.push(line);
  }
  return { buy, partial, have };
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
