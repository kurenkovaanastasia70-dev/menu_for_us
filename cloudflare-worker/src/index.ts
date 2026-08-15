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
      const detail = url.searchParams.get("probe") === "1";
      if (!detail) {
        return json({ ok: true, provider: env.LLM_PROVIDER || "auto", hasGemini: Boolean(env.GEMINI_API_KEY) });
      }
      if (!env.GEMINI_API_KEY) {
        return json({ ok: false, provider: "gemini", error: "GEMINI_API_KEY отсутствует на воркере" });
      }
      try {
        const models = await resolveGeminiModels(env.GEMINI_API_KEY);
        const probe = await callProvider("gemini", 'Верни JSON {"ping":true}', env);
        return json({ ok: true, provider: "gemini", models: models.slice(0, 8), probe: probe.slice(0, 200) });
      } catch (error) {
        return json({
          ok: false,
          provider: "gemini",
          error: error instanceof Error ? error.message : String(error),
        });
      }
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
    if (url.pathname.endsWith("/api/generate-training")) {
      return handleTraining(body, env);
    }
    return json({ ok: false, error: "Not found" }, 404);
  },
};

async function handleMenu(body: unknown, env: Env): Promise<Response> {
  const input = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const totalDays = Math.min(14, Math.max(1, Number(input.days) || 7));
  const chunkSize = 2;
  const ranges: Array<[number, number]> = [];
  for (let start = 1; start <= totalDays; start += chunkSize) {
    ranges.push([start, Math.min(totalDays, start + chunkSize - 1)]);
  }

  // Последовательно: параллель часто ловит 429/таймаут и валит всю неделю.
  const days: any[] = [];
  let lastError = "";
  for (const [fromDay, toDay] of ranges) {
    let part = await generateMenuChunk(input, fromDay, toDay, env);
    if (!part.data) {
      part = await generateMenuChunk(input, fromDay, toDay, env);
    }
    if (part.data?.days && Array.isArray(part.data.days)) {
      days.push(...part.data.days.filter((day: any) => day && Array.isArray(day.meals)));
    } else {
      lastError = part.error || lastError;
    }
  }

  days.sort((a, b) => Number(a.day) - Number(b.day));
  if (days.length === 0) {
    return json({ ok: false, source: "fallback", error: lastError || "LLM недоступна" }, 200);
  }

  const menu = { days };
  if (!isMenu(menu)) return json({ ok: false, source: "fallback", error: "Невалидный JSON модели" }, 200);
  return json({
    ok: true,
    source: "llm",
    menu,
    guides: [],
    partial: days.length < totalDays,
    error: days.length < totalDays ? `Собрано ${days.length} из ${totalDays} дней` : undefined,
  });
}

async function generateMenuChunk(
  input: Record<string, unknown>,
  fromDay: number,
  toDay: number,
  env: Env,
): Promise<{ data: any | null; error?: string }> {
  const dayCount = toDay - fromDay + 1;
  const compactInput = {
    ...input,
    days: dayCount,
    fromDay,
    toDay,
    products: Array.isArray(input.products) ? input.products.slice(0, 90) : input.products,
  };
  const prompt = `Ты шеф-повар. Меню на дни ${fromDay}–${toDay} (всего ${dayCount} дня). Верни ТОЛЬКО JSON.

Форма:
{"days":[{"day":${fromDay},"meals":[{"meal_type":"breakfast","recipe_id":"day${fromDay}_breakfast","name":"...","leftover":false,"calories":800,"protein":50,"fat":20,"carbs":90,"ingredients":[{"product_id":"oats","grams":80}],"steps":[{"order":1,"title":"A","text":"Коротко.","minutes":5},{"order":2,"title":"B","text":"Коротко.","minutes":5},{"order":3,"title":"C","text":"Коротко.","minutes":3}]}]}]}

Правила:
- day номера строго ${fromDay}..${toDay}.
- Каждый день: breakfast, lunch, dinner, snack.
- product_id только из products. Не выдумывай id. Если нужен продукт «из головы» — замени ближайшим из списка.
- Разнообразие: не повторяй одно и то же блюдо каждый день; чередуй белок и гарниры из разных позиций products.
- 2–5 ingredients, ровно 3 коротких steps.
- Бюджет недели budget ₽ критичен: бери дешёвые product_id (низкий rub_per_100g), повторяй одни продукты, 2–4 ingredient на блюдо, без дорогой рыбы/сыра/масел.
- quickLunches: на нечётных day lunch leftover:true если day>${fromDay}.
- Язык русский.

Вход: ${JSON.stringify(compactInput)}`;
  return completeJson(prompt, env);
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
  const result = await completeJson(prompt, env);
  if (!result.data) return json({ ok: false, source: "fallback", error: result.error || "LLM недоступна" }, 200);
  const guides = Array.isArray(result.data.guides) ? result.data.guides : result.data.recipe_id ? [result.data] : [];
  if (guides.length === 0) return json({ ok: false, source: "fallback", error: "Невалидный JSON модели" }, 200);
  return json({ ok: true, source: "llm", guides });
}

async function handleTraining(body: unknown, env: Env): Promise<Response> {
  const prompt = `Ты тренер. Составь НЕДЕЛЬНЫЙ план тренировок под цель каждого человека.
Верни ТОЛЬКО JSON без markdown.

Форма:
{
  "plans":[
    {
      "person_id":"id_из_входа",
      "weeklySummary":"1–2 предложения",
      "scienceNote":"короткая опора на ACSM/ISSN",
      "sessions":[
        {
          "dayIndex":0,
          "title":"Силовая всё тело",
          "focus":"базовые движения",
          "durationMin":45,
          "intensity":"moderate",
          "blocks":[{"name":"Присед","detail":"3×8–12"}]
        }
      ]
    }
  ]
}

Правила:
- dayIndex: 0=пн … 6=вс. Только уникальные дни.
- НЕ заполняй все 7 дней тренировками. Обязательно оставь дни отдыха.
- lose (похудение): 3 силовые + максимум 1 зона 2. Всего 3–4 сессии.
- gain (массонабор): 3–4 силовые, без ежедневного кардио.
- maintain (поддержание): 2 силовые + опционально 1 зона 2. Всего 2–3 сессии.
- intensity: easy | moderate | hard.
- Учитывай цель, вес, активность из входа. Язык русский. Без медицины и добавок.

Вход: ${JSON.stringify(body)}`;
  const result = await completeJson(prompt, env);
  if (!result.data || !Array.isArray(result.data.plans)) {
    return json({ ok: false, source: "fallback", error: result.error || "LLM недоступна" }, 200);
  }
  return json({ ok: true, source: "llm", plans: result.data.plans });
}

async function handleAlternatives(body: unknown, env: Env): Promise<Response> {
  const prompt = `Верни ТОЛЬКО JSON {"alternatives":[{"name":"...","recipe_id":"...","reason":"..."}]} максимум 3 варианта.
Только recipe_id из candidates. Вход: ${JSON.stringify(body)}`;
  const result = await completeJson(prompt, env);
  if (!result.data || !result.data.alternatives) {
    return json({ ok: false, source: "fallback", error: result.error || "LLM недоступна" }, 200);
  }
  return json({ ok: true, source: "llm", alternatives: result.data.alternatives });
}

async function completeJson(prompt: string, env: Env): Promise<{ data: any | null; error?: string }> {
  const order = providerOrder(env);
  if (order.length === 0) {
    return { data: null, error: "Нет LLM-ключа на воркере (GEMINI_API_KEY)" };
  }
  let lastError = "";
  for (const provider of order) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const text = await callProvider(provider, prompt, env);
        const parsed = extractJson(text);
        if (parsed) return { data: parsed };
        lastError = `${provider}: пустой или не-JSON ответ (${String(text).slice(0, 120)})`;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }
  }
  return { data: null, error: lastError || "LLM недоступна" };
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
    // Сначала быстрые рабочие модели, без полного ListModels на каждый запрос.
    const models = cachedGeminiModels ?? ["gemini-2.5-flash", "gemini-flash-latest", "gemini-2.5-flash-lite"];
    let lastError = "";
    for (const model of models) {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.5,
              responseMimeType: "application/json",
              maxOutputTokens: 65536,
            },
          }),
        },
      );
      const payload = (await response.json()) as any;
      const text = payload.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      if (text) {
        cachedGeminiModels = [model, ...models.filter((item) => item !== model)].slice(0, 4);
        return text;
      }
      lastError = payload.error?.message || `HTTP ${response.status}`;
      if (response.status === 404 || /not found|no longer available/i.test(lastError)) continue;
      if (response.status === 429) continue;
    }
    // Если статический список не сработал — один раз обновим список моделей.
    const refreshed = await resolveGeminiModels(env.GEMINI_API_KEY!);
    cachedGeminiModels = refreshed.slice(0, 4);
    for (const model of refreshed.slice(0, 4)) {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.5,
              responseMimeType: "application/json",
              maxOutputTokens: 65536,
            },
          }),
        },
      );
      const payload = (await response.json()) as any;
      const text = payload.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      if (text) return text;
      lastError = payload.error?.message || `HTTP ${response.status}`;
    }
    throw new Error(lastError || "Gemini empty response");
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

let cachedGeminiModels: string[] | null = null;

const GEMINI_FALLBACK_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-flash-latest",
  "gemini-2.0-flash",
];

async function resolveGeminiModels(apiKey: string): Promise<string[]> {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
    );
    const payload = (await response.json()) as any;
    const listed = (payload.models ?? [])
      .filter((model: any) => (model.supportedGenerationMethods ?? []).includes("generateContent"))
      .map((model: any) => String(model.name ?? "").replace(/^models\//, ""))
      .filter(Boolean);
    const preferred = listed.filter((name: string) => /flash/i.test(name) && !/embed|tts|image|robotics/i.test(name));
    const ordered = [...preferred, ...listed.filter((name: string) => !preferred.includes(name))];
    if (ordered.length > 0) return [...new Set([...ordered.slice(0, 8), ...GEMINI_FALLBACK_MODELS])];
  } catch {
    // ignore and use static list
  }
  return GEMINI_FALLBACK_MODELS;
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
