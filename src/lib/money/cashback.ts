export function effectivePrice(price: number, cashbackPercent: number): number {
  const safePercent = Math.min(100, Math.max(0, cashbackPercent));
  return roundMoney(price * (1 - safePercent / 100));
}

export function cashbackAmount(price: number, cashbackPercent: number): number {
  return roundMoney(price - effectivePrice(price, cashbackPercent));
}

export function packagesNeeded(requiredGrams: number, packageWeightGrams: number): number {
  if (requiredGrams <= 0) return 0;
  if (packageWeightGrams <= 0) {
    throw new Error("Вес упаковки должен быть больше нуля");
  }
  return Math.ceil(requiredGrams / packageWeightGrams);
}

export function purchasedGrams(packageCount: number, packageWeightGrams: number): number {
  return packageCount * packageWeightGrams;
}

export function leftoverGrams(requiredGrams: number, purchasedGramsValue: number): number {
  return Math.max(0, purchasedGramsValue - requiredGrams);
}

export function lineTotal(packageCount: number, packagePrice: number): number {
  return roundMoney(packageCount * packagePrice);
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
