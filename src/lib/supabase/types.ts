export type Gender = "female" | "male";
export type ActivityLevel = "sedentary" | "light" | "moderate" | "active" | "very_active";
export type Goal = "lose" | "maintain" | "gain";

export interface Profile {
  id: string;
  user_id: string;
  household_id: string | null;
  name: string;
  gender: Gender;
  birth_date: string;
  height_cm: number;
  weight_kg: number;
  activity_level: ActivityLevel;
  goal: Goal;
  target_weight_kg: number | null;
  calorie_target: number;
  protein_target: number;
  fat_target: number;
  carbs_target: number;
  fiber_target?: number;
  iron_target?: number;
  goal_weeks?: number | null;
  meals_per_day: number;
  snacks: boolean;
  preferences: string[];
  excluded_products: string[];
  allergies: string[];
  diet_type: string;
  max_cooking_time: number;
  cooking_sessions: number;
  batch_meals: boolean;
}

export interface Household {
  id: string;
  name: string;
  invite_code: string;
  default_budget: number;
  default_days: number;
  preferred_stores: string[];
  max_stores: number;
}

export interface CashbackRuleRow {
  id: string;
  household_id: string;
  store_id: string;
  percent: number;
}

export interface MealPlanRow {
  id: string;
  household_id: string;
  start_date: string;
  end_date: string;
  days: number;
  budget: number;
  total_price: number;
  total_cashback: number;
  effective_price: number;
  calories_per_day: number;
  protein_per_day: number;
  variety_score: number;
  result_json: unknown;
  created_at: string;
}

export interface FridgeItem {
  id?: string;
  household_id: string;
  product_id: string;
  grams: number;
}

export interface WeightLog {
  id?: string;
  user_id: string;
  logged_at: string;
  weight_kg: number;
}
