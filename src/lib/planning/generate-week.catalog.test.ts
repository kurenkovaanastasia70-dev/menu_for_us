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
  it("sends the full catalog, not a cheap slice", () => {
    const products: Product[] = [];
    const prices: StoreProduct[] = [];
    for (let i = 0; i < 80; i += 1) {
      const id = `protein_${i}`;
      products.push(product(id, "protein", `Белок ${i}`));
      prices.push(price(id, 50 + i * 10));
    }
    products.push(product("chicken_breast", "protein", "Курица"));
    prices.push(price("chicken_breast", 300));
    products.push(product("shrimp", "protein", "Креветки"));
    prices.push(price("shrimp", 399));

    const input = {
      products,
      prices,
      people: [{ id: "a", name: "A", calorieTarget: 2000, proteinTarget: 100, fatTarget: 70, carbsTarget: 200, fiberTarget: 25, ironTarget: 12 }],
      days: 7,
      budget: 6000,
      constraints: {
        preferredStoreIds: ["magnit"],
        varietyPreference: "low",
        maxCookingTime: 40,
        maxCookingSessions: 3,
        mealsPerDay: 3,
        snacks: true,
        excludedProductIds: ["protein_0"],
        allergies: [],
        dietType: "omnivore",
        maxStores: 2,
      },
    } as OptimizationInput;

    const catalog = pricedCatalogForLlm(input);
    expect(catalog.length).toBe(products.length - 1);
    expect(catalog.some((item) => item.id === "chicken_breast")).toBe(true);
    expect(catalog.some((item) => item.id === "shrimp")).toBe(true);
    expect(catalog.some((item) => item.id === "protein_0")).toBe(false);
  });
});
