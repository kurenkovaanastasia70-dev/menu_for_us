import { describe, expect, it } from "vitest";
import {
  cashbackAmount,
  effectivePrice,
  leftoverGrams,
  lineTotal,
  packagesNeeded,
  purchasedGrams,
} from "./cashback";

describe("money", () => {
  it("calculates effective price with cashback", () => {
    expect(effectivePrice(599, 5)).toBe(569.05);
    expect(effectivePrice(1000, 7)).toBe(930);
    expect(effectivePrice(100, 0)).toBe(100);
  });

  it("clamps cashback percent", () => {
    expect(effectivePrice(100, -10)).toBe(100);
    expect(effectivePrice(100, 150)).toBe(0);
  });

  it("calculates cashback amount", () => {
    expect(cashbackAmount(1000, 5)).toBe(50);
  });

  it("rounds packages up to cover required grams", () => {
    expect(packagesNeeded(700, 900)).toBe(1);
    expect(packagesNeeded(901, 900)).toBe(2);
    expect(packagesNeeded(0, 900)).toBe(0);
  });

  it("calculates purchased grams and leftovers", () => {
    expect(purchasedGrams(1, 900)).toBe(900);
    expect(leftoverGrams(700, 900)).toBe(200);
    expect(leftoverGrams(900, 900)).toBe(0);
  });

  it("calculates package line totals", () => {
    expect(lineTotal(2, 89.9)).toBe(179.8);
  });
});
