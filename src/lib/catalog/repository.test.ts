import { describe, expect, it } from "vitest";
import { catalog } from "./repository";

describe("catalog seed", () => {
  it("contains at least 100 products and 50 recipes", () => {
    expect(catalog.getProducts().length).toBeGreaterThanOrEqual(100);
    expect(catalog.getRecipes().length).toBeGreaterThanOrEqual(50);
    expect(catalog.getStores().length).toBe(4);
    expect(catalog.getStoreProducts().length).toBe(catalog.getProducts().length * 4);
  });
});
