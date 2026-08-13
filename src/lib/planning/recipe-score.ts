import type { Recipe } from "@/lib/optimizer";

export function recipeUsesCart(recipe: Recipe, cartIds: Set<string>): boolean {
  if (cartIds.size === 0) return false;
  const used = recipe.ingredients.filter((ing) => cartIds.has(ing.product_id)).length;
  return used / recipe.ingredients.length >= 0.5;
}
