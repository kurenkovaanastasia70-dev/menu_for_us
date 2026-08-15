import { describe, expect, it } from "vitest";
import { catalog } from "./repository";

describe("catalog seed", () => {
  it("contains a broad Magnit-style catalog with prices in four stores", () => {
    expect(catalog.getProducts().length).toBeGreaterThanOrEqual(250);
    expect(catalog.getRecipes().length).toBeGreaterThanOrEqual(50);
    expect(catalog.getStores().length).toBe(4);
    expect(catalog.getStoreProducts().length).toBe(catalog.getProducts().length * 4);
  });
});
