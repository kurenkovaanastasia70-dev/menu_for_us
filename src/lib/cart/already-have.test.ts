import { describe, expect, it } from "vitest";
import type { CartLine } from "@/lib/optimizer/types";
import { fridgeStockAfterToggle, lineAlreadyHave } from "./already-have";

function line(patch: Partial<CartLine>): CartLine {
  return {
    productId: "chicken_breast",
    productName: "Курица",
    storeId: "magnit",
    storeName: "Магнит",
    quantityGrams: 900,
    packageCount: 1,
    packageWeight: 900,
    price: 300,
    cashbackPercent: 0,
    cashback: 0,
    effectivePrice: 300,
    leftoverGrams: 0,
    fromFridgeGrams: 0,
    toBuyGrams: 900,
    ...patch,
  };
}

describe("already have cart toggle", () => {
  it("treats a fully covered line as already have", () => {
    expect(lineAlreadyHave(line({ toBuyGrams: 0, fromFridgeGrams: 900, packageCount: 0, price: 0 }))).toBe(true);
    expect(lineAlreadyHave(line({ haveAtHome: true, toBuyGrams: 900 }))).toBe(true);
    expect(lineAlreadyHave(line({}))).toBe(false);
  });

  it("adds and removes the product from fridge stock", () => {
    const added = fridgeStockAfterToggle([], line({}), true);
    expect(added).toEqual([{ productId: "chicken_breast", grams: 900 }]);
    expect(fridgeStockAfterToggle(added, line({}), false)).toEqual([]);
  });
});
