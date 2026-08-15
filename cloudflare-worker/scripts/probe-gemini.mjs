import { readFileSync } from "node:fs";

const raw = readFileSync(".dev.vars");
const text = raw.toString("utf8").replace(/^\uFEFF/, "");
const key = text
  .split(/\r?\n/)
  .map((line) => line.trim())
  .find((line) => line.startsWith("GEMINI_API_KEY="))
  ?.slice("GEMINI_API_KEY=".length);

if (!key) {
  console.error("no key", JSON.stringify(text.slice(0, 40)));
  process.exit(1);
}

console.log("key_prefix", key.slice(0, 10), "len", key.length);

const models = [
  "gemini-2.0-flash",
  "gemini-2.5-flash",
  "gemini-flash-latest",
  "gemini-1.5-flash",
  "gemini-2.0-flash-001",
];

for (const model of models) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: "Reply with the word OK" }] }],
    }),
  });
  const body = await response.text();
  console.log(model, response.status, body.slice(0, 350).replace(/\s+/g, " "));
}
