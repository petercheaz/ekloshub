import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadPromptFile(baseName: string) {
  const candidates = [path.join(root, "llm", `${baseName}.txt`), path.join(root, "llm", `${baseName}.md`)];
  for (const file of candidates) {
    try {
      return readFileSync(file, "utf8");
    } catch {
      // try the next filename
    }
  }
  throw new Error(`llm/${baseName}.txt is missing`);
}

export function loadRoomIdeasPrompt() {
  return loadPromptFile("room_ideas");
}

export function loadRegNameTagsPrompt() {
  return loadPromptFile("reg_name_tags");
}

export function loadSnacksMenuPrompt() {
  return loadPromptFile("snacks_menu");
}

export function loadSnacksMenuRegeneratePrompt() {
  return loadPromptFile("snacks_menu_regenerate");
}

export function loadCookingPlanGeneratePrompt() {
  return loadPromptFile("cooking_plan_generate");
}

export function loadCookingPlanItemsPrompt() {
  return loadPromptFile("cooking_plan_items");
}

export function buildCookingPlanGeneratePrompt(input: {
  publisher: string;
  year: number;
  title: string;
  organizationName: string;
  allergySummary: string;
  studentCount: number;
  extraInstructions: string;
}) {
  return loadCookingPlanGeneratePrompt()
    .replaceAll("{{publisher}}", input.publisher)
    .replaceAll("{{year}}", String(input.year))
    .replaceAll("{{title}}", input.title)
    .replaceAll("{{organization_name}}", input.organizationName)
    .replaceAll("{{allergy_summary}}", input.allergySummary.trim() || "No allergies reported yet.")
    .replaceAll("{{student_count}}", String(input.studentCount))
    .replaceAll(
      "{{extra_instructions}}",
      input.extraInstructions.trim() || "None. Simple church-kitchen snacks.",
    );
}

export function buildCookingPlanItemsPrompt(input: {
  publisher: string;
  year: number;
  title: string;
  organizationName: string;
  allergySummary: string;
  extraInstructions: string;
  strategy: string;
  strategyNote: string;
  replaceItemsJson: string;
  keepItemsJson: string;
}) {
  return loadCookingPlanItemsPrompt()
    .replaceAll("{{publisher}}", input.publisher)
    .replaceAll("{{year}}", String(input.year))
    .replaceAll("{{title}}", input.title)
    .replaceAll("{{organization_name}}", input.organizationName)
    .replaceAll("{{allergy_summary}}", input.allergySummary.trim() || "No allergies reported yet.")
    .replaceAll(
      "{{extra_instructions}}",
      input.extraInstructions.trim() || "None. Simple church-kitchen snacks.",
    )
    .replaceAll("{{strategy}}", input.strategy)
    .replaceAll("{{strategy_note}}", input.strategyNote.trim() || "—")
    .replaceAll("{{replace_items_json}}", input.replaceItemsJson)
    .replaceAll("{{keep_items_json}}", input.keepItemsJson);
}

export function extractJsonFromLlm(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? trimmed).trim();
  return JSON.parse(candidate) as unknown;
}

export function buildSnacksMenuPrompt(input: {
  publisher: string;
  year: number;
  title: string;
  organizationName: string;
  allergySummary: string;
  studentCount: number;
  extraInstructions: string;
}) {
  return loadSnacksMenuPrompt()
    .replaceAll("{{publisher}}", input.publisher)
    .replaceAll("{{year}}", String(input.year))
    .replaceAll("{{title}}", input.title)
    .replaceAll("{{organization_name}}", input.organizationName)
    .replaceAll("{{allergy_summary}}", input.allergySummary.trim() || "No allergies reported yet.")
    .replaceAll("{{student_count}}", String(input.studentCount))
    .replaceAll(
      "{{extra_instructions}}",
      input.extraInstructions.trim() || "None. Use simple, church-kitchen-friendly snacks.",
    );
}

export function buildSnacksMenuRegeneratePrompt(input: {
  publisher: string;
  year: number;
  title: string;
  organizationName: string;
  allergySummary: string;
  studentCount: number;
  extraInstructions: string;
  regenerateDayLabels: string[];
  keptDaysBlock: string;
  dayHintsBlock: string;
}) {
  return loadSnacksMenuRegeneratePrompt()
    .replaceAll("{{publisher}}", input.publisher)
    .replaceAll("{{year}}", String(input.year))
    .replaceAll("{{title}}", input.title)
    .replaceAll("{{organization_name}}", input.organizationName)
    .replaceAll("{{allergy_summary}}", input.allergySummary.trim() || "No allergies reported yet.")
    .replaceAll("{{student_count}}", String(input.studentCount))
    .replaceAll(
      "{{extra_instructions}}",
      input.extraInstructions.trim() || "None. Use simple, church-kitchen-friendly snacks.",
    )
    .replaceAll("{{regenerate_days_list}}", input.regenerateDayLabels.join(", "))
    .replaceAll("{{kept_days_block}}", input.keptDaysBlock.trim() || "(No days kept — full week is new.)")
    .replaceAll(
      "{{day_hints_block}}",
      input.dayHintsBlock.trim() || "None — use your best judgment for these days.",
    );
}

export function buildRoomIdeaPrompt(input: {
  publisher: string;
  year: number;
  title: string;
  notes: string;
}) {
  return loadRoomIdeasPrompt()
    .replaceAll("{{publisher}}", input.publisher)
    .replaceAll("{{year}}", String(input.year))
    .replaceAll("{{title}}", input.title)
    .replaceAll("{{notes}}", input.notes.trim() || "None. Follow the VBS theme.");
}

export function buildRegNameTagPrompt(input: {
  publisher: string;
  year: number;
  title: string;
  firstName: string;
  fullName: string;
  assignedTeam: string;
  allergies: string;
  specialRequests: string;
  extraInstructions: string;
}) {
  return loadRegNameTagsPrompt()
    .replaceAll("{{publisher}}", input.publisher)
    .replaceAll("{{year}}", String(input.year))
    .replaceAll("{{title}}", input.title)
    .replaceAll("{{first_name}}", input.firstName.trim() || input.fullName.trim() || "Student")
    .replaceAll("{{full_name}}", input.fullName.trim() || input.firstName.trim())
    .replaceAll("{{assigned_team}}", input.assignedTeam.trim() || "Unassigned")
    .replaceAll("{{allergies}}", input.allergies.trim() || "None listed")
    .replaceAll("{{special_requests}}", input.specialRequests.trim() || "None")
    .replaceAll(
      "{{extra_instructions}}",
      input.extraInstructions.trim() || "None. Match the VBS theme with cheerful, readable type.",
    );
}

function geminiKey() {
  return (
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim() ||
    (process.env.OPENAI_API_KEY?.trim() && !process.env.OPENAI_API_KEY.trim().startsWith("sk-")
      ? process.env.OPENAI_API_KEY.trim()
      : "")
  );
}

function openaiKey() {
  const key = process.env.OPENAI_API_KEY?.trim() ?? "";
  return key.startsWith("sk-") ? key : "";
}

type GeminiPart = {
  text?: string;
  inlineData?: { mimeType?: string; data?: string };
  inline_data?: { mime_type?: string; data?: string };
};

type GeminiResponse = {
  error?: { message?: string };
  candidates?: Array<{ content?: { parts?: GeminiPart[] } }>;
};

function imageFromGemini(payload: GeminiResponse) {
  const parts = payload.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    const data = part.inlineData?.data || part.inline_data?.data;
    if (data) {
      return Buffer.from(data, "base64");
    }
  }
  throw new Error(payload.error?.message || "Gemini returned no picture");
}

const freeTierGeminiImageModels = [
  "gemini-2.5-flash-image",
  "gemini-3.1-flash-lite-image",
  "gemini-3.1-flash-image",
];

let cachedGeminiImageModels: string[] | null = null;
let workingGeminiImageModel: string | null = null;

function isPaidOnlyImageModel(name: string) {
  return name.includes("pro") || name.includes("ultra");
}

async function listGeminiImageModels(key: string) {
  if (cachedGeminiImageModels) {
    return cachedGeminiImageModels;
  }
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}&pageSize=200`,
  );
  const payload = (await response.json()) as { models?: Array<{ name?: string }>; error?: { message?: string } };
  if (!response.ok) {
    throw new Error(payload.error?.message || "Could not list Gemini models");
  }
  const available = new Set(
    (payload.models ?? []).map((model) => (model.name ?? "").replace(/^models\//, "")),
  );
  const preferred = process.env.GEMINI_IMAGE_MODEL?.trim();
  const models = [
    ...(preferred && available.has(preferred) && !isPaidOnlyImageModel(preferred) ? [preferred] : []),
    ...freeTierGeminiImageModels.filter((name) => available.has(name)),
  ].filter((name, index, list) => list.indexOf(name) === index);
  if (models.length === 0) {
    throw new Error("This Gemini key has no free-tier image model");
  }
  cachedGeminiImageModels = models;
  return models;
}

function quotaMessage(message: string) {
  if (!/quota|rate.?limit|resource.?exhausted/i.test(message)) {
    return message;
  }
  if (/limit:\s*0/i.test(message)) {
    return "Gemini image models are not included on a free-tier API key (quota limit 0). In Google AI Studio, enable billing so the project is Tier 1, then try again. Text models can stay free; Nano Banana / image generation usually cannot.";
  }
  return "Gemini image quota is used up for now. Check https://ai.dev/rate-limit or wait and try one picture at a time.";
}

async function generateWithGemini(prompt: string) {
  const key = geminiKey();
  if (!key) {
    throw new Error("Set GEMINI_API_KEY to generate nametags");
  }
  const models = workingGeminiImageModel
    ? [workingGeminiImageModel, ...(await listGeminiImageModels(key)).filter((name) => name !== workingGeminiImageModel)]
    : await listGeminiImageModels(key);
  let lastError = "Gemini image generation failed";
  for (const model of models) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseModalities: ["TEXT", "IMAGE"],
          },
        }),
      },
    );
    const payload = (await response.json()) as GeminiResponse;
    if (!response.ok) {
      lastError = payload.error?.message || `Gemini ${model} failed`;
      if (/limit:\s*0/i.test(lastError) || isPaidOnlyImageModel(model)) {
        continue;
      }
      if (/quota|rate.?limit|resource.?exhausted/i.test(lastError)) {
        throw new Error(quotaMessage(lastError));
      }
      continue;
    }
    try {
      const image = imageFromGemini(payload);
      workingGeminiImageModel = model;
      return image;
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError;
    }
  }
  throw new Error(quotaMessage(lastError));
}

async function generateWithOpenAi(prompt: string) {
  const key = openaiKey();
  if (!key) {
    throw new Error("Set OPENAI_API_KEY to generate nametags");
  }
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-1",
      prompt,
      n: 1,
      size: "1024x1024",
    }),
  });
  const payload = (await response.json()) as OpenAiImageResponse;
  if (!response.ok) {
    throw new Error(payload.error?.message || "Image generation failed");
  }
  return imageFromOpenAi(payload);
}

export async function generateThemedGraphic(prompt: string) {
  if (geminiKey()) {
    return generateWithGemini(prompt);
  }
  if (openaiKey()) {
    return generateWithOpenAi(prompt);
  }
  throw new Error("Set GEMINI_API_KEY to generate nametags");
}

type TextGeminiResponse = {
  error?: { message?: string };
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
};

async function generateTextWithGemini(prompt: string) {
  const key = geminiKey();
  if (!key) {
    throw new Error("Set GEMINI_API_KEY for text generation");
  }
  const model = process.env.GEMINI_TEXT_MODEL?.trim() || "gemini-2.0-flash";
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    },
  );
  const payload = (await response.json()) as TextGeminiResponse;
  if (!response.ok) {
    throw new Error(payload.error?.message || "Gemini text generation failed");
  }
  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
  if (!text.trim()) {
    throw new Error("Gemini returned no text");
  }
  return text.trim();
}

async function generateTextWithOpenAi(prompt: string) {
  const key = openaiKey();
  if (!key) {
    throw new Error("Set OPENAI_API_KEY for text generation");
  }
  const model = process.env.OPENAI_TEXT_MODEL?.trim() || "gpt-4o-mini";
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: "You write clear, practical snack plans for church VBS volunteers." },
        { role: "user", content: prompt },
      ],
    }),
  });
  const payload = (await response.json()) as {
    error?: { message?: string };
    choices?: Array<{ message?: { content?: string } }>;
  };
  if (!response.ok) {
    throw new Error(payload.error?.message || "OpenAI text generation failed");
  }
  const text = payload.choices?.[0]?.message?.content?.trim() ?? "";
  if (!text) {
    throw new Error("OpenAI returned no text");
  }
  return text;
}

export async function generateLlmText(prompt: string) {
  if (geminiKey()) {
    return generateTextWithGemini(prompt);
  }
  if (openaiKey()) {
    return generateTextWithOpenAi(prompt);
  }
  throw new Error("Set GEMINI_API_KEY or OPENAI_API_KEY to generate a snacks menu");
}

async function decorateWithGemini(bytes: Buffer, contentType: string, prompt: string) {
  const key = geminiKey();
  if (!key) {
    throw new Error("Set GEMINI_API_KEY to generate room designs");
  }
  const models = workingGeminiImageModel
    ? [workingGeminiImageModel, ...(await listGeminiImageModels(key)).filter((name) => name !== workingGeminiImageModel)]
    : await listGeminiImageModels(key);
  let lastError = "Gemini image generation failed";
  for (const model of models) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                {
                  inline_data: {
                    mime_type: contentType || "image/png",
                    data: bytes.toString("base64"),
                  },
                },
              ],
            },
          ],
          generationConfig: {
            responseModalities: ["TEXT", "IMAGE"],
          },
        }),
      },
    );
    const payload = (await response.json()) as GeminiResponse;
    if (!response.ok) {
      lastError = payload.error?.message || `Gemini ${model} failed`;
      if (/limit:\s*0/i.test(lastError) || isPaidOnlyImageModel(model)) {
        continue;
      }
      if (/quota|rate.?limit|resource.?exhausted/i.test(lastError)) {
        throw new Error(quotaMessage(lastError));
      }
      continue;
    }
    try {
      const image = imageFromGemini(payload);
      workingGeminiImageModel = model;
      return image;
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError;
    }
  }
  throw new Error(quotaMessage(lastError));
}

type OpenAiImageResponse = {
  error?: { message?: string };
  data?: Array<{ b64_json?: string; url?: string }>;
};

async function imageFromOpenAi(payload: OpenAiImageResponse) {
  const item = payload.data?.[0];
  if (item?.b64_json) {
    return Buffer.from(item.b64_json, "base64");
  }
  if (item?.url) {
    const image = await fetch(item.url);
    if (!image.ok) {
      throw new Error("Could not download the generated image");
    }
    return Buffer.from(await image.arrayBuffer());
  }
  throw new Error(payload.error?.message || "The image model returned no picture");
}

async function decorateWithOpenAi(bytes: Buffer, contentType: string, prompt: string) {
  const key = openaiKey();
  if (!key) {
    throw new Error("Set OPENAI_API_KEY to generate room designs");
  }
  const form = new FormData();
  form.set("model", process.env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-1");
  form.set("prompt", prompt);
  form.set("n", "1");
  form.set("size", "1024x1024");
  form.set("image", new Blob([new Uint8Array(bytes)], { type: contentType || "image/png" }), "room.png");
  const response = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  const payload = (await response.json()) as OpenAiImageResponse;
  if (!response.ok) {
    throw new Error(payload.error?.message || "Image edit failed");
  }
  return imageFromOpenAi(payload);
}

export async function decorateRoomPhoto(bytes: Buffer, contentType: string, prompt: string) {
  if (geminiKey()) {
    return decorateWithGemini(bytes, contentType, prompt);
  }
  if (openaiKey()) {
    return decorateWithOpenAi(bytes, contentType, prompt);
  }
  throw new Error("Set GEMINI_API_KEY to generate room designs");
}
