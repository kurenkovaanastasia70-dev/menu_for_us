import { describe, expect, it } from "vitest";
import { parseGuides } from "./recipe-guide";

describe("recipe guides", () => {
  it("parses a batch of cooking guides from LLM JSON", () => {
    const guides = parseGuides({
      guides: [
        {
          recipe_id: "dinner_chicken",
          title: "Курица с травами",
          subtitle: "Горячее на ужин",
          time_minutes: 30,
          servings: 2,
          steps: [
            { order: 1, title: "Подготовка", text: "Промойте курицу и обсушите бумажным полотенцем." },
            { order: 2, title: "Жарка", text: "Обжарьте 6–7 минут с каждой стороны на среднем огне." },
            { order: 3, title: "Салат", text: "Соберите овощной салат и заправьте маслом." },
          ],
          tips: ["Не накрывайте крышкой — корочка пропадет."],
          plating: "Мясо слева, салат справа.",
        },
      ],
    });
    expect(guides).toHaveLength(1);
    expect(guides[0].steps.length).toBeGreaterThanOrEqual(3);
  });

  it("rejects empty steps", () => {
    expect(parseGuides({ recipe_id: "x", title: "A", subtitle: "B", time_minutes: 1, servings: 1, steps: [] })).toEqual(
      [],
    );
  });
});
