const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export interface Env {
  GEMINI_API_KEY?: string;
  GROQ_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
  LLM_PROVIDER?: string;
}

const GUIDE_SHAPE = `{
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
        { "order": 3, "title": "Сборка", "text": "Как соединить и посолить.", "minutes": 3 },
        { "order": 4, "title": "Подача", "text": "Как выглядит готовая тарелка.", "minutes": 2 }
      ],
      "tips": ["Практичный совет", "Ещё один"],
      "plating": "Как подать тарелку"
    }
  ]
}`;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    const url = new URL(request.url);
    if (request.method === "GET" && (url.pathname === "/api/health" || url.pathname === "/")) {
      return json({ ok: true, provider: env.LLM_PROVIDER || "auto" });
    }

    if (request.method !== "POST") {
      return json({ ok: false, error: "Method not allowed" }, 405);
    }

    let body: unknown = {};
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: "Некорректный JSON" }, 400);
    }

    if (url.pathname.endsWith("/api/generate-menu")) {
      return handleMenu(body, env);
    }
    if (url.pathname.endsWith("/api/generate-recipe")) {
      return handleRecipe(body, env);
    }
    if (url.pathname.endsWith("/api/generate-alternatives")) {
      return handleAlternatives(body, env);
    }
    return json({ ok: false, error: "Not found" }, 404);
  },
};

async function handleMenu(body: unknown, env: Env): Promise<Response> {
  const prompt = `Ты шеф-повар и нутрициолог. СОСТАВЬ меню на неделю и пошаговые гиды. Верни ТОЛЬКО JSON без markdown.

Форма:
{
  "days":[
    {"day":1,"meals":[
      {"meal_type":"breakfast","recipe_id":"...","name":"...","leftover":false},
      {"meal_type":"lunch","recipe_id":"...","name":"...","leftover":false},
      {"meal_type":"dinner","recipe_id":"...","name":"...","leftover":false}
    ]}
  ],
  "guides": ${GUIDE_SHAPE}
}

Жёсткие правила:
- Только recipe_id из списка recipes. Не выдумывай id.
- meal_type обязателен и должен совпадать с типом рецепта (ужин — dinner).
- Ужин: горячее мясо/рыба (или без мяса, если dietType=vegetarian). Салат приложит приложение.
- Если quickLunches=true: обед либо leftover:true (остатки вчерашнего ужина, recipe_id того ужина), либо очень быстрый lunch ≤20 минут. Чередуй: день 1 быстрый, день 2 остатки, день 3 быстрый...
- Каждый день обязателен перекус. К перекусу всегда дополнительная порция фруктов — название фрукта можно вписать в name, id фрукта приложение добавит само.
- Для leftover:true гид — как разогреть за 5–8 минут, не как готовить с нуля.
- Для каждого НЕ leftover блюда — гид минимум из 4 шагов: огонь, минуты, текстура.
- Язык русский, живой, без воды.
- Не меняй граммовки продуктов — приложение само возьмёт состав из каталога.

Вход: ${JSON.stringify(body)}`;
  const parsed = await completeJson(prompt, env);
  if (!parsed) return json({ ok: false, source: "fallback", error: "LLM недоступна" }, 200);
  if (!isMenu(parsed)) return json({ ok: false, source: "fallback", error: "Невалидный JSON модели" }, 200);
  return json({ ok: true, source: "llm", menu: parsed, guides: parsed.guides ?? [] });
}

async function handleRecipe(body: unknown, env: Env): Promise<Response> {
  const prompt = `Ты шеф-повар. Перепиши гид приготовления заново. Верни ТОЛЬКО JSON без markdown.

Форма: ${GUIDE_SHAPE}

Правила:
- Только этот recipe_id.
- Минимум 4 шага. Можно другое название и другие формулировки, но те же продукты.
- Если это ужин — горячее + салат.
- Язык русский.

Вход: ${JSON.stringify(body)}`;
  const parsed = await completeJson(prompt, env);
  if (!parsed) return json({ ok: false, source: "fallback", error: "LLM недоступна" }, 200);
  const guides = Array.isArray(parsed.guides) ? parsed.guides : parsed.recipe_id ? [parsed] : [];
  if (guides.length === 0) return json({ ok: false, source: "fallback", error: "Невалидный JSON модели" }, 200);
  return json({ ok: true, source: "llm", guides });
}

async function handleAlternatives(body: unknown, env: Env): Promise<Response> {
  const prompt = `Верни ТОЛЬКО JSON {"alternatives":[{"name":"...","recipe_id":"...","reason":"..."}]} максимум 3 варианта.
Только recipe_id из candidates. Вход: ${JSON.stringify(body)}`;
  const parsed = await completeJson(prompt, env);
  if (!parsed || !parsed.alternatives) {
    return json({ ok: false, source: "fallback", error: "LLM недоступна" }, 200);
  }
  return json({ ok: true, source: "llm", alternatives: parsed.alternatives });
}

async function completeJson(prompt: string, env: Env): Promise<any | null> {
  const order = providerOrder(env);
  for (const provider of order) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const text = await callProvider(provider, prompt, env);
        const parsed = extractJson(text);
        if (parsed) return parsed;
      } catch {
        // try next
      }
    }
  }
  return null;
}

function providerOrder(env: Env): Array<"gemini" | "groq" | "openrouter"> {
  const preferred = (env.LLM_PROVIDER || "gemini").toLowerCase();
  const all: Array<"gemini" | "groq" | "openrouter"> = ["gemini", "groq", "openrouter"];
  return [preferred, ...all.filter((item) => item !== preferred)].filter((item) => {
    if (item === "gemini") return Boolean(env.GEMINI_API_KEY);
    if (item === "groq") return Boolean(env.GROQ_API_KEY);
    return Boolean(env.OPENROUTER_API_KEY);
  }) as Array<"gemini" | "groq" | "openrouter">;
}

async function callProvider(provider: "gemini" | "groq" | "openrouter", prompt: string, env: Env): Promise<string> {
  if (provider === "gemini") {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, responseMimeType: "application/json" },
        }),
      },
    );
    const json = (await response.json()) as any;
    return json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  }

  const url =
    provider === "groq"
      ? "https://api.groq.com/openai/v1/chat/completions"
      : "https://openrouter.ai/api/v1/chat/completions";
  const key = provider === "groq" ? env.GROQ_API_KEY : env.OPENROUTER_API_KEY;
  const model = provider === "groq" ? "llama-3.1-8b-instant" : "openai/gpt-4o-mini";
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.7,
      messages: [
        { role: "system", content: "Отвечай только валидным JSON." },
        { role: "user", content: prompt },
      ],
    }),
  });
  const json = (await response.json()) as any;
  return json.choices?.[0]?.message?.content ?? "";
}

function extractJson(text: string): any | null {
  if (!text) return null;
  const trimmed = text.trim().replace(/^```json\s*/i, "").replace(/```$/i, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function isMenu(value: any): boolean {
  return Array.isArray(value?.days) && value.days.every((day: any) => Array.isArray(day.meals));
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}
