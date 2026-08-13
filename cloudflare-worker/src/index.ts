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
    if (url.pathname.endsWith("/api/generate-alternatives")) {
      return handleAlternatives(body, env);
    }
    return json({ ok: false, error: "Not found" }, 404);
  },
};

async function handleMenu(body: unknown, env: Env): Promise<Response> {
  const prompt = `Верни ТОЛЬКО JSON вида {"days":[{"day":1,"meals":[{"name":"...","recipe_id":"...","ingredients":[{"product_id":"...","grams":100}]}]}]}.
Используй только recipe_id из списка. Не меняй состав продуктов произвольно.
Вход: ${JSON.stringify(body)}`;
  const parsed = await completeJson(prompt, env);
  if (!parsed) return json({ ok: false, source: "fallback", error: "LLM недоступна" }, 200);
  if (!isMenu(parsed)) return json({ ok: false, source: "fallback", error: "Невалидный JSON модели" }, 200);
  return json({ ok: true, source: "llm", menu: parsed });
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
          generationConfig: { temperature: 0.4, responseMimeType: "application/json" },
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
      temperature: 0.4,
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
