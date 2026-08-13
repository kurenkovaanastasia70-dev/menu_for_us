import { z } from "zod";
import { fallbackGuide } from "@/lib/optimizer/meals";
import type { RecipeGuide } from "@/lib/optimizer/types";

export const recipeGuideSchema = z.object({
  recipe_id: z.string().min(1),
  title: z.string().min(2),
  subtitle: z.string().min(2),
  time_minutes: z.number().positive(),
  servings: z.number().positive(),
  steps: z
    .array(
      z.object({
        order: z.number().int().positive(),
        title: z.string().min(1),
        text: z.string().min(8),
        minutes: z.number().optional(),
      }),
    )
    .min(3),
  tips: z.array(z.string()).default([]),
  plating: z.string().default(""),
});

export const recipeGuidesResponseSchema = z.object({
  guides: z.array(recipeGuideSchema).min(1),
});

export type { RecipeGuide };

export function parseGuides(payload: unknown): RecipeGuide[] {
  const parsed = recipeGuidesResponseSchema.safeParse(payload);
  if (parsed.success) return parsed.data.guides;
  const one = recipeGuideSchema.safeParse(payload);
  return one.success ? [one.data] : [];
}

export { fallbackGuide };
