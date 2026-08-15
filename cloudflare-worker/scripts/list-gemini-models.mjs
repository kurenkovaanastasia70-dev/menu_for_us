import { readFileSync } from "node:fs";

const text = readFileSync(".dev.vars").toString("utf8").replace(/^\uFEFF/, "");
const key = text
  .split(/\r?\n/)
  .map((line) => line.trim())
  .find((line) => line.startsWith("GEMINI_API_KEY="))
  ?.slice("GEMINI_API_KEY=".length);

const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`);
const json = await response.json();
const names = (json.models ?? [])
  .filter((model) => (model.supportedGenerationMethods ?? []).includes("generateContent"))
  .map((model) => model.name);
console.log("status", response.status);
console.log(names.slice(0, 40).join("\n"));
if (json.error) console.log(JSON.stringify(json.error));
