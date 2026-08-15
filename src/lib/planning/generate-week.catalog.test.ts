import { describe, expect, it } from "vitest";
import type { OptimizationInput, Product, StoreProduct } from "@/lib/optimizer";
import { pricedCatalogForLlm } from "./generate-week";

function product(id: string, category: Product["category"], name = id): Product {
  return {
    id,
    canonical_name: name,
    category,
    calories_per_100g: 100,
    protein_per_100g: 10,
    fat_per_100g: 5,
    carbs_per_100g: 10,
    fiber_per_100g: 2,
    iron_per_100g: 1,
    package_weight: 500,
    unit: "g",
    tags: [],
  };
}

function price(productId: string, priceRub: number): StoreProduct {
  return {
    id: `${productId}_p`,
    canonical_product_id: productId,
    store_id: "magnit",
    external_id: productId,
    name: productId,
    brand: "",
    package_weight: 500,
    price: priceRub,
    available: true,
    url: "",
    updated_at: "",
  };
}

describe("pricedCatalogForLlm", () => {
  it("keeps a wide mixed slice, not only the cheapest items", () => {
    const products: Product[] = [];
    const prices: StoreProduct[] = [];
    for (let i = 0; i < 40; i += 1) {
      const id = `protein_${i}`;
      products.push(product(id, "protein", `Белок ${i}`));
      prices.push(price(id, 50 + i * 10));
    }
    products.push(product("chicken_breast", "protein", "Курица"));
    prices.push(price("chicken_breast", 300));

    const input = {
      products,
      prices,
      people: [{ id: "a", name: "A", calorieTarget: 2000, proteinTarget: 100, fatTarget: 70, carbsTarget: 200, fiberTarget: 25, ironTarget: 12 }],
      days: 7,
      budget: 6000,
      constraints: {
        preferredStoreIds: ["magnit"],
        varietyPreference: "high",
        maxCookingTime: 40,
        maxCookingSessions: 3,
        mealsPerDay: 3,
        snacks: true,
        excludedProductIds: [],
        allergies: [],
        dietType: "omnivore",
        maxStores: 2,
      },
    } as OptimizationInput;

    const catalog = pricedCatalogForLlm(input);
    expect(catalog.length).toBeGreaterThan(20);
    expect(catalog.some((item) => item.id === "chicken_breast")).toBe(true);
    // не только топ дешёвых: в срез попадает и более дорогой белок
    expect(catalog.some((item) => (item.rub_per_100g ?? 0) > 20)).toBe(true);
  });
});
