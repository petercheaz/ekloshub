import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

export function loadRoomIdeasPrompt() {
  const candidates = [
    path.join(root, "llm", "room_ideas.txt"),
    path.join(root, "llm", "room_ideas.md"),
    path.join(root, "room_ideas.txt"),
    path.join(root, "room_ideas.md"),
  ];
  for (const file of candidates) {
    try {
      return readFileSync(file, "utf8");
    } catch {
      // try the next filename
    }
  }
  throw new Error("llm/room_ideas.txt is missing");
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

async function decorateWithGemini(bytes: Buffer, contentType: string, prompt: string) {
  const key = geminiKey();
  if (!key) {
    throw new Error("Set GEMINI_API_KEY to generate room ideas");
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
    throw new Error("Set OPENAI_API_KEY to generate room ideas");
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
  throw new Error("Set GEMINI_API_KEY to generate room ideas");
}
