import { isEveryoneEatingOut } from "../planning/portions";
import { macrosFromGrams } from "../nutrition/calculator";
import type {
  OptimizationConstraints,
  PersonTargets,
  PlannedMeal,
  Product,
  Recipe,
  RecipeGuide,
  SideFruit,
  SideSalad,
} from "./types";

const MEAT_SOURCES = new Set(["chicken", "beef", "pork", "turkey", "fish"]);
export const QUICK_LUNCH_MINUTES = 20;

export function isQuickLunch(recipe: Recipe): boolean {
  return recipe.meal_type === "lunch" && recipe.cooking_time <= QUICK_LUNCH_MINUTES && !isSideSalad(recipe);
}

export function slotKey(dayIndex: number, mealType: string): string {
  return `${dayIndex}:${mealType}`;
}

/** true, если никто из пары не ест дома этот приём (корзину пропускаем целиком). */
export function isEatingOutSlot(
  constraints: OptimizationConstraints,
  dayIndex: number,
  mealType: Recipe["meal_type"],
  people?: PersonTargets[],
): boolean {
  if (people && people.length > 0) {
    return isEveryoneEatingOut(people, constraints, dayIndex, mealType);
  }
  const slots = constraints.eatingOutSlots ?? [];
  const matching = slots.filter((slot) => slot.dayIndex === dayIndex && slot.mealType === mealType);
  if (matching.length === 0) return false;
  // legacy: слот без personId = вся семья вне дома
  if (matching.some((slot) => !(slot as { personId?: string }).personId)) return true;
  // без списка людей не знаем «всех» — считаем out только если слотов ≥ 2
  return matching.length >= 2;
}

export function isSideSalad(recipe: Recipe): boolean {
  return recipe.tags.includes("salad") && recipe.tags.includes("side");
}

export function isHotDinnerMain(recipe: Recipe, vegetarian: boolean): boolean {
  if (isSideSalad(recipe) || recipe.meal_type !== "dinner") return false;
  if (vegetarian) return !MEAT_SOURCES.has(recipe.protein_source);
  return MEAT_SOURCES.has(recipe.protein_source);
}

export function scaleIngredients(recipe: Recipe, peopleCount: number) {
  const servings = peopleCount / Math.max(1, recipe.servings);
  return {
    servings: peopleCount,
    factor: servings,
    ingredients: recipe.ingredients.map((ing) => ({
      product_id: ing.product_id,
      grams: Math.round(ing.grams * servings),
    })),
    calories: round1(recipe.calories * servings),
    protein: round1(recipe.protein * servings),
    fat: round1(recipe.fat * servings),
    carbs: round1(recipe.carbs * servings),
    fiber: round1((recipe.fiber ?? 0) * servings),
    iron: round1((recipe.iron ?? 0) * servings),
  };
}

export function plannedMealFromRecipe(
  recipe: Recipe,
  meal: Pick<PlannedMeal, "dayIndex" | "mealType" | "cookingSession" | "eatingOut">,
  peopleCount: number,
): PlannedMeal {
  const scaled = scaleIngredients(recipe, peopleCount);
  return {
    dayIndex: meal.dayIndex,
    mealType: meal.mealType,
    recipeId: recipe.id,
    recipeName: recipe.name,
    cookingSession: meal.cookingSession,
    servings: scaled.servings,
    ingredients: scaled.ingredients,
    calories: scaled.calories,
    protein: scaled.protein,
    fat: scaled.fat,
    carbs: scaled.carbs,
    fiber: scaled.fiber,
    iron: scaled.iron,
    instructions: [...recipe.instructions],
    eatingOut: meal.eatingOut,
  };
}

export function leftoverFromDinner(dinner: PlannedMeal, dayIndex: number, eatingOut: boolean): PlannedMeal {
  const name = dinner.recipeName.replace(/^Остатки:\s*/, "");
  return {
    ...dinner,
    dayIndex,
    mealType: "lunch",
    eatingOut,
    leftover: true,
    leftoverFrom: name,
    recipeName: `Остатки: ${name}`,
    ingredients: dinner.ingredients.map((ing) => ({ ...ing })),
    instructions: [
      "Достаньте вчерашний ужин из холодильника за 20 минут.",
      "Разогрейте горячее на сковороде или в микроволновке до горячего.",
      "Салат ешьте холодным, не разогревайте.",
    ],
    sideSalad: dinner.sideSalad
      ? {
          ...dinner.sideSalad,
          ingredients: dinner.sideSalad.ingredients.map((ing) => ({ ...ing })),
        }
      : undefined,
    guide: {
      recipe_id: dinner.recipeId,
      title: `Остатки: ${name}`,
      subtitle: "Вчерашний ужин, 5–8 минут",
      time_minutes: 8,
      servings: dinner.servings,
      steps: [
        {
          order: 1,
          title: "Достать",
          text: "Контейнер с ужином достаньте заранее. Мясо и гарнир разогревайте, салат оставьте холодным.",
          minutes: 2,
        },
        {
          order: 2,
          title: "Разогреть",
          text: "Сковорода 3–4 минуты или микроволновка 2–3 минуты до горячего пара. Не разогревайте дважды.",
          minutes: 5,
        },
        {
          order: 3,
          title: "Подать",
          text: "Горячее на тарелку, салат сбоку. Если сухо — ложка воды или масла при разогреве.",
          minutes: 1,
        },
      ],
      tips: ["Вечером кладите сразу две порции.", "В холодильнике не дольше суток."],
      plating: "Разогретое горячее и холодный салат.",
    },
  };
}

export function attachSideSalad(meal: PlannedMeal, salad: Recipe, peopleCount: number): PlannedMeal {
  const scaled = scaleIngredients(salad, peopleCount);
  const sideSalad: SideSalad = {
    recipeId: salad.id,
    name: salad.name,
    ingredients: scaled.ingredients,
    instructions: [...salad.instructions],
  };
  return {
    ...meal,
    recipeName: `${meal.recipeName} + ${salad.name}`,
    sideSalad,
    ingredients: [...meal.ingredients, ...scaled.ingredients],
    calories: round1(meal.calories + scaled.calories),
    protein: round1(meal.protein + scaled.protein),
    fat: round1(meal.fat + scaled.fat),
    carbs: round1(meal.carbs + scaled.carbs),
    fiber: round1(meal.fiber + scaled.fiber),
    iron: round1(meal.iron + scaled.iron),
    instructions: [...meal.instructions, `Салат «${salad.name}»:`, ...salad.instructions],
  };
}

const SNACK_FRUIT_IDS = ["apple", "banana", "pear", "orange", "kiwi", "berries"] as const;
const SNACK_FRUIT_GRAMS: Record<string, number> = {
  apple: 150,
  banana: 120,
  pear: 160,
  orange: 150,
  kiwi: 80,
  berries: 100,
};

export function pickSnackFruit(products: Product[], selected: PlannedMeal[]): Product | null {
  const fruits = SNACK_FRUIT_IDS.map((id) => products.find((product) => product.id === id)).filter(
    (product): product is Product => Boolean(product),
  );
  if (fruits.length === 0) return null;
  const used = selected.map((meal) => meal.sideFruit?.productId).filter(Boolean);
  const unused = fruits.filter((product) => !used.includes(product.id));
  const pool = unused.length > 0 ? unused : fruits;
  const snacks = selected.filter((meal) => meal.mealType === "snack").length;
  return pool[snacks % pool.length] ?? pool[0] ?? null;
}

export function attachSnackFruit(meal: PlannedMeal, fruit: Product, peopleCount: number): PlannedMeal {
  const grams = Math.round((SNACK_FRUIT_GRAMS[fruit.id] ?? 120) * peopleCount);
  const macros = macrosFromGrams({
    grams,
    caloriesPer100g: fruit.calories_per_100g,
    proteinPer100g: fruit.protein_per_100g,
    fatPer100g: fruit.fat_per_100g,
    carbsPer100g: fruit.carbs_per_100g,
    fiberPer100g: fruit.fiber_per_100g,
    ironPer100g: fruit.iron_per_100g,
  });
  const sideFruit: SideFruit = { productId: fruit.id, name: fruit.canonical_name, grams };
  return {
    ...meal,
    recipeName: `${meal.recipeName} + ${fruit.canonical_name}`,
    sideFruit,
    ingredients: [...meal.ingredients, { product_id: fruit.id, grams }],
    calories: round1(meal.calories + macros.calories),
    protein: round1(meal.protein + macros.protein),
    fat: round1(meal.fat + macros.fat),
    carbs: round1(meal.carbs + macros.carbs),
    fiber: round1(meal.fiber + macros.fiber),
    iron: round1(meal.iron + macros.iron),
    instructions: [...meal.instructions, `Дополнительно: ${fruit.canonical_name}, ${grams} г.`],
  };
}

export function fallbackGuide(recipe: Recipe, meal: PlannedMeal): RecipeGuide {
  const steps = (recipe.instructions.length ? recipe.instructions : ["Приготовьте блюдо по составу продуктов."]).map(
    (text, index) => ({
      order: index + 1,
      title: `Шаг ${index + 1}`,
      text,
      minutes: Math.max(2, Math.round(recipe.cooking_time / Math.max(recipe.instructions.length, 1))),
    }),
  );
  while (steps.length < 3) {
    steps.push({
      order: steps.length + 1,
      title: "Подача",
      text: "Посолите по вкусу и подавайте сразу.",
      minutes: 2,
    });
  }
  if (meal.sideSalad) {
    steps.push({
      order: steps.length + 1,
      title: "Салат",
      text: meal.sideSalad.instructions.join(" "),
      minutes: 8,
    });
  }
  if (meal.sideFruit) {
    steps.push({
      order: steps.length + 1,
      title: "Фрукт",
      text: `К перекусу обязательно ${meal.sideFruit.name}, ${meal.sideFruit.grams} г. Можно целиком или нарезать.`,
      minutes: 1,
    });
  }
  return {
    recipe_id: recipe.id,
    title: meal.recipeName || recipe.name,
    subtitle: meal.leftover
      ? "Остатки вчерашнего ужина"
      : meal.mealType === "dinner"
        ? "Горячее + свежий салат"
        : meal.mealType === "snack"
          ? "Перекус + фрукт"
          : "Пошаговый гид",
    time_minutes: recipe.cooking_time + (meal.sideSalad ? 10 : 0) + (meal.sideFruit ? 1 : 0),
    servings: meal.servings,
    steps,
    tips: [
      ...(meal.sideSalad ? [`Салат «${meal.sideSalad.name}» соберите перед подачей, чтобы зелень не дала сок.`] : []),
      ...(meal.sideFruit ? [`Фрукт к перекусу не пропускайте — клетчатка и калий.`] : []),
      ...(!meal.sideSalad && !meal.sideFruit ? ["Не пережаривайте белок — сочность важнее корочки."] : []),
    ],
    plating: meal.sideSalad
      ? `Горячее сбоку, салат «${meal.sideSalad.name}» отдельной горкой.`
      : meal.sideFruit
        ? `Перекус в миске, ${meal.sideFruit.name} рядом.`
        : "Подавайте сразу, пока горячее.",
  };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function nutritionFromIngredients(
  ingredients: Array<{ product_id: string; grams: number }>,
  products: Product[],
) {
  return ingredients.reduce(
    (acc, ing) => {
      const product = products.find((item) => item.id === ing.product_id);
      if (!product) return acc;
      const macros = macrosFromGrams({
        grams: ing.grams,
        caloriesPer100g: product.calories_per_100g,
        proteinPer100g: product.protein_per_100g,
        fatPer100g: product.fat_per_100g,
        carbsPer100g: product.carbs_per_100g,
        fiberPer100g: product.fiber_per_100g,
        ironPer100g: product.iron_per_100g,
      });
      return {
        calories: round1(acc.calories + macros.calories),
        protein: round1(acc.protein + macros.protein),
        fat: round1(acc.fat + macros.fat),
        carbs: round1(acc.carbs + macros.carbs),
        fiber: round1(acc.fiber + macros.fiber),
        iron: round1(acc.iron + macros.iron),
      };
    },
    { calories: 0, protein: 0, fat: 0, carbs: 0, fiber: 0, iron: 0 },
  );
}

export function scalePlannedMeal(meal: PlannedMeal, factor: number, products: Product[]): PlannedMeal {
  const ingredients = meal.ingredients.map((ing) => ({
    ...ing,
    grams: Math.max(1, Math.round(ing.grams * factor)),
  }));
  const fullIngredients = (meal.fullIngredients ?? meal.ingredients).map((ing) => ({
    ...ing,
    grams: Math.max(1, Math.round(ing.grams * factor)),
  }));
  const nutrition = nutritionFromIngredients(ingredients, products);
  return {
    ...meal,
    ingredients,
    fullIngredients,
    ...nutrition,
    sideFruit: meal.sideFruit
      ? { ...meal.sideFruit, grams: Math.max(1, Math.round(meal.sideFruit.grams * factor)) }
      : meal.sideFruit,
    portions: meal.portions?.map((portion) => ({
      ...portion,
      calories: Math.round(portion.calories * factor * 10) / 10,
      protein: Math.round(portion.protein * factor * 10) / 10,
      fat: Math.round(portion.fat * factor * 10) / 10,
      carbs: Math.round(portion.carbs * factor * 10) / 10,
      ingredients: portion.ingredients.map((ing) => ({
        ...ing,
        grams: Math.max(0, Math.round(ing.grams * factor)),
      })),
    })),
  };
}
