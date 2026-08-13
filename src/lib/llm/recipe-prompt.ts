export const RECIPE_GUIDE_JSON_SHAPE = `{
  "guides": [
    {
      "recipe_id": "id_из_списка",
      "title": "Аппетитное название",
      "subtitle": "1 фраза зачем это блюдо",
      "time_minutes": 30,
      "servings": 2,
      "steps": [
        { "order": 1, "title": "Подготовка", "text": "Что сделать руками, 2–4 предложения.", "minutes": 5 },
        { "order": 2, "title": "На огне", "text": "Температура, время, как понять что готово.", "minutes": 12 },
        { "order": 3, "title": "Сборка", "text": "Как соединить и посолить.", "minutes": 3 }
      ],
      "tips": ["Практичный совет", "Ещё один"],
      "plating": "Как подать тарелку"
    }
  ]
}`;

export function buildRecipeGuidesPrompt(input: {
  peopleCount: number;
  recipes: Array<{
    id: string;
    name: string;
    meal_type: string;
    cooking_time: number;
    ingredients: Array<{ name: string; grams: number }>;
    instructions: string[];
  }>;
}): string {
  return `Ты шеф-повар и нутрициолог. Напиши пошаговые гиды приготовления.

Жёсткие правила:
- Верни ТОЛЬКО JSON, без markdown.
- Форма: ${RECIPE_GUIDE_JSON_SHAPE}
- Только recipe_id из списка. Не выдумывай продукты вне списка.
- Минимум 4 шага на блюдо. Пиши конкретно: минуты, огонь, текстура.
- Порций: ${input.peopleCount}.
- Ужин всегда звучит как горячее мясо/рыба + салат, если это dinner.
- Язык: русский, живой, без воды.

Рецепты:
${JSON.stringify(input.recipes)}`;
}

export function buildSingleRecipePrompt(recipe: {
  id: string;
  name: string;
  meal_type: string;
  cooking_time: number;
  ingredients: Array<{ name: string; grams: number }>;
  instructions: string[];
  peopleCount: number;
}): string {
  return `${buildRecipeGuidesPrompt({ peopleCount: recipe.peopleCount, recipes: [recipe] })}

Сгенерируй заново гид для этого одного блюда. Можно другое название и другие шаги, но те же продукты.`;
}
