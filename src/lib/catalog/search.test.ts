import { describe, expect, it } from "vitest";
import type { Product } from "@/lib/optimizer/types";
import { searchProducts } from "./search";

function product(id: string, name: string, tags: string[] = []): Product {
  return {
    id,
    canonical_name: name,
    category: "vegetable",
    calories_per_100g: 20,
    protein_per_100g: 1,
    fat_per_100g: 0,
    carbs_per_100g: 4,
    fiber_per_100g: 1,
    iron_per_100g: 0.3,
    package_weight: 400,
    unit: "g",
    tags,
  };
}

describe("searchProducts", () => {
  const catalog = [
    product("corn", "Кукуруза сладкая", ["corn"]),
    product("canned_corn", "Кукуруза консервированная"),
    product("chicken_breast", "Куриная грудка", ["chicken"]),
  ];

  it("ranks prefix matches first and understands ё", () => {
    const hits = searchProducts(catalog, "кукуруза");
    expect(hits[0]?.id).toBe("corn");
    expect(hits.map((item) => item.id)).toContain("canned_corn");
    expect(searchProducts(catalog, "куриная").map((item) => item.id)).toContain("chicken_breast");
  });

  it("returns empty for unknown names so UI can offer Add", () => {
    expect(searchProducts(catalog, "хумус домашняя").length).toBe(0);
  });
});
