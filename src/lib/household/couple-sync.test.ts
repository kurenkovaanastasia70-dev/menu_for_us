import { describe, expect, it } from "vitest";
import { fridgeSignature, mergeCustomProducts, mergeFridgeItems } from "./couple-sync";
import type { FridgeItem } from "@/lib/supabase/types";
import type { CustomProduct } from "@/lib/catalog/custom-products";

function fridge(productId: string, grams: number): FridgeItem {
  return { household_id: "h", product_id: productId, grams };
}

function custom(id: string, name: string): CustomProduct {
  return {
    id,
    household_id: "h",
    name,
    category: "pantry",
    package_weight: 400,
    unit: "g",
    price: 99,
    store_id: "magnit",
    calories_per_100g: 200,
    protein_per_100g: 5,
    fat_per_100g: 5,
    carbs_per_100g: 30,
  };
}

describe("couple fridge and catalog merge", () => {
  it("unions local and remote fridge and keeps the larger stock", () => {
    const merged = mergeFridgeItems(
      [fridge("chicken_thigh", 400), fridge("oats", 0)],
      [fridge("chicken_thigh", 900), fridge("rice", 500)],
    );
    expect(merged).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ product_id: "chicken_thigh", grams: 900 }),
        expect.objectContaining({ product_id: "rice", grams: 500 }),
      ]),
    );
    expect(merged.some((item) => item.product_id === "oats")).toBe(false);
  });

  it("adds partner custom products without dropping local ones", () => {
    const merged = mergeCustomProducts([custom("a", "Хумус")], [custom("b", "Сырники")]);
    expect(merged.map((item) => item.id).sort()).toEqual(["a", "b"]);
  });

  it("builds a stable fridge signature for change detection", () => {
    expect(fridgeSignature([fridge("rice", 200), fridge("oats", 100)])).toBe(
      fridgeSignature([fridge("oats", 100), fridge("rice", 200)]),
    );
    expect(fridgeSignature([fridge("rice", 200)])).not.toBe(fridgeSignature([fridge("rice", 201)]));
  });
});
