import { describe, expect, it } from "vitest";
import type { Product } from "@/lib/optimizer/types";
import { resolveLlmIngredients, resolveProductId } from "./resolve-product";

function product(id: string, name: string): Product {
  return {
    id,
    canonical_name: name,
    category: "protein",
    calories_per_100g: 100,
    protein_per_100g: 10,
    fat_per_100g: 5,
    carbs_per_100g: 0,
    fiber_per_100g: 0,
    iron_per_100g: 1,
    package_weight: 400,
    unit: "g",
    tags: [],
  };
}

const catalog = [
  product("chicken_breast", "Куриная грудка"),
  product("chicken_thigh", "Куриное бедро"),
  product("turkey_fillet", "Филе индейки"),
  product("rice", "Рис"),
  product("oats", "Овсянка"),
  product("cottage_cheese", "Творог"),
  product("olive_oil", "Оливковое масло"),
];

describe("resolveProductId", () => {
  it("keeps canonical ids and maps Russian names", () => {
    expect(resolveProductId("chicken_breast", catalog)).toBe("chicken_breast");
    expect(resolveProductId("Куриное бедро", catalog)).toBe("chicken_thigh");
    expect(resolveProductId("овсянка", catalog)).toBe("oats");
    expect(resolveProductId("творог", catalog)).toBe("cottage_cheese");
  });

  it("does not treat generic chicken as thighs", () => {
    expect(resolveProductId("курица", catalog)).toBe("chicken_breast");
    expect(resolveProductId("chicken", catalog)).toBe("chicken_breast");
  });

  it("maps compact rows, Russian names, and gram strings", () => {
    const resolved = resolveLlmIngredients(
      [
        { n: "Рис", g: "80 г" },
        { product_id: "Куриная грудка", grams: 200 },
        { id: "unknown_xyz", grams: 50 },
        { name: "Оливковое масло", amount: "10" },
      ],
      catalog,
    );
    expect(resolved).toEqual([
      { product_id: "rice", grams: 80 },
      { product_id: "chicken_breast", grams: 200 },
      { product_id: "olive_oil", grams: 10 },
    ]);
  });
});
