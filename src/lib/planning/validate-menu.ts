import type { OptimizationInput, OptimizationResult } from "@/lib/optimizer";

export function validateMenuNutrition(
  result: OptimizationResult,
  input: OptimizationInput,
): OptimizationResult {
  const warnings = [...result.warnings];
  const { nutritionSummary } = result;

  if (nutritionSummary.caloriesPerDay < input.calorieTargets * 0.8) {
    warnings.push("После проверки калории ниже цели.");
  }
  if (nutritionSummary.proteinPerDay < input.macroTargets.protein * 0.85) {
    warnings.push("Белка меньше целевого уровня.");
  }
  if (result.effectiveCost > input.budget) {
    warnings.push("Итоговая стоимость превышает бюджет после пересчёта.");
  }

  const unknown = result.menu.flatMap((meal) =>
    meal.ingredients.filter((ing) => !input.products.some((product) => product.id === ing.product_id)),
  );
  if (unknown.length > 0) {
    warnings.push("В меню есть неизвестные продукты — они исключены из расчёта.");
  }

  return {
    ...result,
    warnings: [...new Set(warnings)],
    feasible: result.effectiveCost <= input.budget && nutritionSummary.proteinPerDay >= input.macroTargets.protein * 0.85,
  };
}
