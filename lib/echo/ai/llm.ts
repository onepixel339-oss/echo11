/**
 * ECHO — unified LLM helper (server-side only).
 *
 * Provider chain:
 *   1. Google Gemini — used FIRST whenever GEMINI_API_KEY is set. This is
 *      the deploy-anywhere path (Vercel, Docker, any Node host): create a
 *      free key at https://aistudio.google.com/apikey and set it as an env
 *      var. Optional GEMINI_MODEL overrides the default flash model.
 *   2. Platform AI (z-ai-web-dev-sdk) — zero-config inside this sandbox;
 *      loaded dynamically so a deploy without it never crashes on import.
 *
 * Every caller gets a plain string or an exception; graceful degradation and
 * retries are the callers' concern. Message convention: messages[0] with
 * role "assistant" is the system prompt.
 */

export interface LlmMessage {
  role: "assistant" | "user";
  content: string;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

export function geminiKey(): string | undefined {
  const k = process.env.GEMINI_API_KEY;
  return k && k.trim().length > 10 ? k.trim() : undefined;
}

async function callPlatform(messages: LlmMessage[], timeoutMs: number): Promise<string> {
  // Dynamic import: on a plain Node/Vercel deploy the platform SDK has no
  // credentials — importing it lazily keeps this a caught runtime error
  // instead of a module-load crash.
  const { default: ZAI } = await import("z-ai-web-dev-sdk");
  const zai = await ZAI.create();
  const completion = await withTimeout(
    zai.chat.completions.create({
      messages,
      thinking: { type: "disabled" },
    }),
    timeoutMs,
  );
  const text = completion.choices[0]?.message?.content ?? "";
  if (!text.trim()) throw new Error("empty platform completion");
  return text;
}

/**
 * Model chain for the FREE tier (late 2026): gemini-3.8-flash is free but its
 * project quota is tiny (~20 requests/day); gemini-3.5-flash-lite is also free
 * with its own separate quota. Trying flash first, then flash-lite,
 * meaningfully extends the zero-cost daily capacity. GEMINI_MODEL overrides
 * the chain with a single model.
 */
function geminiModels(): string[] {
  const override = process.env.GEMINI_MODEL?.trim();
  if (override) return [override];
  return ["gemini-3.8-flash", "gemini-3.5-flash-lite"];
}

async function callGeminiOnce(
  model: string,
  key: string,
  messages: LlmMessage[],
  timeoutMs: number,
): Promise<string> {
  // split system prompt (first assistant message) from the conversation
  const hasSystem = messages.length > 0 && messages[0].role === "assistant";
  const system = hasSystem ? messages[0].content : undefined;
  const convo = (hasSystem ? messages.slice(1) : messages).map((m) => ({
    role: m.role === "assistant" ? ("model" as const) : ("user" as const),
    parts: [{ text: m.content }],
  }));

  const res = await withTimeout(
    fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
          contents: convo,
          generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
        }),
      },
    ),
    timeoutMs,
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`gemini ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = (data.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("")
    .trim();
  if (!text) throw new Error("empty gemini completion");
  return text;
}

async function callGemini(messages: LlmMessage[], timeoutMs: number): Promise<string> {
  const key = geminiKey();
  if (!key) throw new Error("no gemini key");
  let lastError: unknown = new Error("no model");
  for (const model of geminiModels()) {
    try {
      return await callGeminiOnce(model, key, messages, timeoutMs);
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      // quota / rate / model-availability issues → try the next free model
      if (/\b(429|403|404)\b/.test(msg)) continue;
      throw err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/**
 * Run the provider chain. When GEMINI_API_KEY is set (the deploy-anywhere
 * path — e.g. Vercel) Gemini is tried FIRST so requests never wait on a
 * platform provider that does not exist there. Otherwise the zero-config
 * platform AI is used. Throws the last error when everything fails.
 */
export async function callLlm(
  messages: LlmMessage[],
  opts: { timeoutMs?: number } = {},
): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? 50_000;
  let lastError: unknown = new Error("no provider");

  if (geminiKey()) {
    try {
      return await callGemini(messages, timeoutMs);
    } catch (err) {
      lastError = err;
    }
  }

  try {
    return await callPlatform(messages, timeoutMs);
  } catch (err) {
    lastError = err;
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
