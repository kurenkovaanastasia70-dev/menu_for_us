export interface Product {
  id: string;
  canonical_name: string;
  category: ProductCategory;
  calories_per_100g: number;
  protein_per_100g: number;
  fat_per_100g: number;
  carbs_per_100g: number;
  fiber_per_100g: number;
  iron_per_100g: number;
  package_weight: number;
  unit: "g" | "ml" | "pcs";
  tags: string[];
}

export type ProductCategory =
  | "protein"
  | "dairy"
  | "grain"
  | "vegetable"
  | "fruit"
  | "fat"
  | "pantry"
  | "snack";

export interface Store {
  id: string;
  name: string;
  slug: string;
}

export interface StoreProduct {
  id: string;
  canonical_product_id: string;
  store_id: string;
  external_id: string;
  name: string;
  brand: string;
  package_weight: number;
  price: number;
  available: boolean;
  url: string;
  updated_at: string;
}

export interface RecipeIngredient {
  product_id: string;
  grams: number;
}

export interface Recipe {
  id: string;
  name: string;
  cuisine: string;
  meal_type: "breakfast" | "lunch" | "dinner" | "snack";
  cooking_time: number;
  difficulty: "easy" | "medium";
  servings: number;
  ingredients: RecipeIngredient[];
  instructions: string[];
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  fiber: number;
  iron: number;
  protein_source: string;
  tags: string[];
}

export interface CashbackRule {
  store_id: string;
  percent: number;
}

export interface PersonTargets {
  id: string;
  name: string;
  calorieTarget: number;
  proteinTarget: number;
  fatTarget: number;
  carbsTarget: number;
  fiberTarget: number;
  ironTarget: number;
}

export interface EatingOutSlot {
  personId: string;
  dayIndex: number;
  mealType: Recipe["meal_type"];
}

export interface MealPersonPortion {
  personId: string;
  name: string;
  share: number;
  eatingOut: boolean;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  ingredients: RecipeIngredient[];
}

export interface OptimizationConstraints {
  maxCookingTime: number;
  maxCookingSessions: number;
  mealsPerDay: number;
  snacks: boolean;
  excludedProductIds: string[];
  allergies: string[];
  dietType: string;
  preferredStoreIds: string[];
  maxStores: number;
  varietyPreference: "low" | "medium" | "high";
  eatingOutSlots?: EatingOutSlot[];
  quickLunches?: boolean;
  /** Завтраки без готовки: до ~10 минут (йогурт, творог, быстрая овсянка). */
  quickBreakfasts?: boolean;
}

export interface FridgeStock {
  productId: string;
  grams: number;
}

export interface OptimizationInput {
  people: PersonTargets[];
  days: number;
  calorieTargets: number;
  macroTargets: {
    protein: number;
    fat: number;
    carbs: number;
    fiber: number;
    iron: number;
  };
  budget: number;
  products: Product[];
  prices: StoreProduct[];
  recipes: Recipe[];
  cashback: CashbackRule[];
  fridge: FridgeStock[];
  constraints: OptimizationConstraints;
}

export interface RecipeGuideStep {
  order: number;
  title: string;
  text: string;
  minutes?: number;
}

export interface RecipeGuide {
  recipe_id: string;
  title: string;
  subtitle: string;
  time_minutes: number;
  servings: number;
  steps: RecipeGuideStep[];
  tips: string[];
  plating: string;
}

export interface SideSalad {
  recipeId: string;
  name: string;
  ingredients: RecipeIngredient[];
  instructions: string[];
}

export interface SideFruit {
  productId: string;
  name: string;
  grams: number;
}

export interface PlannedMeal {
  dayIndex: number;
  mealType: Recipe["meal_type"];
  recipeId: string;
  recipeName: string;
  cookingSession: number;
  servings: number;
  ingredients: RecipeIngredient[];
  /** Полные граммы на всю семью до учёта «ем не дома». */
  fullIngredients?: RecipeIngredient[];
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  fiber: number;
  iron: number;
  instructions: string[];
  eatingOut?: boolean;
  eatingOutPersonIds?: string[];
  portions?: MealPersonPortion[];
  leftover?: boolean;
  leftoverFrom?: string;
  sideSalad?: SideSalad;
  sideFruit?: SideFruit;
  guide?: RecipeGuide;
  llmEstimate?: { calories: number; protein: number; fat: number; carbs: number };
  /** Блюдо придумано моделью (не из фиксированного каталога рецептов). */
  fromLlm?: boolean;
}

export interface CartLine {
  productId: string;
  productName: string;
  storeId: string;
  storeName: string;
  quantityGrams: number;
  packageCount: number;
  packageWeight: number;
  price: number;
  cashbackPercent: number;
  cashback: number;
  effectivePrice: number;
  leftoverGrams: number;
  fromFridgeGrams: number;
  toBuyGrams: number;
  haveAtHome?: boolean;
}

export interface NutritionSummary {
  caloriesPerDay: number;
  proteinPerDay: number;
  fatPerDay: number;
  carbsPerDay: number;
  fiberPerDay: number;
  ironPerDay: number;
  calorieTarget: number;
  proteinTarget: number;
  fatTarget: number;
  carbsTarget: number;
  fiberTarget: number;
  ironTarget: number;
}

export interface OptimizationResult {
  menu: PlannedMeal[];
  cart: CartLine[];
  totalCost: number;
  cashback: number;
  effectiveCost: number;
  /** Стоимость той же корзины, если бы ничего не было в холодильнике. */
  grossCost: number;
  /** Экономия за счёт уже имеющихся продуктов (grossCost − effectiveCost). */
  fridgeDiscount: number;
  nutritionSummary: NutritionSummary;
  varietyScore: number;
  wasteScore: number;
  cookingPlan: CookingSession[];
  feasible: boolean;
  warnings: string[];
  trainingPlans?: import("../training/plan").PersonTrainingPlan[];
}

export interface CookingSession {
  index: number;
  dayIndex: number;
  label: string;
  recipeIds: string[];
  recipeNames: string[];
}

export interface OptimizationEngine {
  optimize(input: OptimizationInput): OptimizationResult;
}

export const OPTIMIZER_WEIGHTS = {
  cost: 1,
  uniqueProducts: 35,
  cookingTime: 1.5,
  waste: 0.4,
  repetition: 90,
};
