import { z } from "zod";

export const llmMealSchema = z.object({
  name: z.string().min(2),
  recipe_id: z.string().min(1),
  meal_type: z.enum(["breakfast", "lunch", "dinner", "snack"]).optional(),
  leftover: z.boolean().optional(),
  ingredients: z
    .array(
      z.object({
        product_id: z.string(),
        grams: z.number().positive(),
      }),
    )
    .optional(),
});

export const llmMenuSchema = z.object({
  days: z
    .array(
      z.object({
        day: z.number().int().positive(),
        meals: z.array(llmMealSchema).min(1),
      }),
    )
    .min(1),
});

export const llmAlternativesSchema = z.object({
  alternatives: z
    .array(
      z.object({
        name: z.string(),
        recipe_id: z.string(),
        reason: z.string(),
      }),
    )
    .min(1)
    .max(5),
});

export type LLMMenu = z.infer<typeof llmMenuSchema>;

export interface MenuGenerationInput {
  days: number;
  peopleCount: number;
  calorieTarget: number;
  recipes: Array<{ id: string; name: string; meal_type: string }>;
  selectedRecipeIds: string[];
}

export interface AlternativeInput {
  currentRecipeId: string;
  currentName: string;
  cartProductIds: string[];
  candidates: Array<{ id: string; name: string; meal_type: string }>;
}

export interface LLMProvider {
  generateMenu(input: MenuGenerationInput): Promise<LLMMenu>;
  generateAlternatives(
    input: AlternativeInput,
  ): Promise<Array<{ name: string; recipe_id: string; reason: string }>>;
}

export interface WorkerGenerateResponse {
  ok: boolean;
  source: "llm" | "fallback";
  menu?: LLMMenu;
  guides?: Array<{
    recipe_id: string;
    title: string;
    subtitle: string;
    time_minutes: number;
    servings: number;
    steps: Array<{ order: number; title: string; text: string; minutes?: number }>;
    tips: string[];
    plating: string;
  }>;
  alternatives?: Array<{ name: string; recipe_id: string; reason: string }>;
  error?: string;
}
