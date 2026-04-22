import { ENV } from "./env";

export type Role = "system" | "user" | "assistant";

export type Message = {
  role: Role;
  content: string;
  name?: string;
};

export type JsonSchemaFormat = {
  type: "json_schema";
  json_schema: {
    name: string;
    strict?: boolean;
    schema: Record<string, unknown>;
  };
};

export type JsonObjectFormat = { type: "json_object" };
export type TextFormat = { type: "text" };
export type ResponseFormat = JsonSchemaFormat | JsonObjectFormat | TextFormat;

export type InvokeParams = {
  messages: Message[];
  maxTokens?: number;
  temperature?: number;
  response_format?: ResponseFormat;
  /** @deprecated — use response_format */
  responseFormat?: { type: "text" | "json_object" | "json_schema" };
};

export type InvokeResult = {
  id: string;
  choices: Array<{
    message: { role: Role; content: string };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalizeMessage(msg: Message) {
  const content =
    typeof msg.content === "string"
      ? msg.content
      : Array.isArray(msg.content)
        ? (msg.content as { text?: string }[]).map(p => p.text ?? "").join("\n")
        : String(msg.content);

  return {
    role: msg.role === ("model" as string) ? "assistant" : msg.role,
    content,
    ...(msg.name ? { name: msg.name } : {}),
  };
}

function buildApiUrl(): string {
  const base = (ENV.forgeApiUrl ?? "https://api.openai.com").replace(/\/$/, "");
  return `${base}/v1/chat/completions`;
}

function assertApiKey(): void {
  if (!ENV.forgeApiKey || ENV.forgeApiKey.trim() === "") {
    throw new Error(
      "API key not configured. Set OPENAI_API_KEY in Render environment variables."
    );
  }
}

// ─── Retry with exponential back-off ─────────────────────────────────────────

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  retries = 3,
  delayMs = 1000
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, init);

      // 429 rate-limit or 5xx server errors → retry
      if (res.status === 429 || res.status >= 500) {
        const retryAfter = res.headers.get("retry-after");
        const wait = retryAfter
          ? Number(retryAfter) * 1000
          : delayMs * attempt;
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, wait));
          continue;
        }
      }

      return res;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, delayMs * attempt));
      }
    }
  }

  throw lastError ?? new Error("fetchWithRetry: exhausted retries with no response");
}

// ─── Main entry point ────────────────────────────────────────────────────────

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  assertApiKey();

  const {
    messages,
    maxTokens = 4096,
    temperature = 0.1,
    response_format,
    responseFormat,
  } = params;

  // Resolve response format: new key takes precedence; legacy key falls back.
  const effectiveFormat: ResponseFormat | undefined =
    response_format ??
    (responseFormat?.type === "json_object"
      ? { type: "json_object" }
      : responseFormat?.type === "text"
        ? { type: "text" }
        : undefined);

  const payload: Record<string, unknown> = {
    model: ENV.model,
    messages: messages.map(normalizeMessage),
    max_tokens: maxTokens,
    temperature,
  };

  if (effectiveFormat) {
    payload.response_format = effectiveFormat;
  }

  const url = buildApiUrl();
  const response = await fetchWithRetry(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ENV.forgeApiKey}`,
      "HTTP-Referer": "https://easyjob.app",
      "X-Title": "EasyJob AI",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "(no body)");
    throw new Error(
      `LLM request failed: ${response.status} ${response.statusText} — ${errorText}`
    );
  }

  const data = (await response.json()) as {
    id?: string;
    choices?: Array<{
      message?: { role?: Role; content?: string | null };
      finish_reason?: string;
    }>;
    usage?: InvokeResult["usage"];
    error?: { message: string };
  };

  if (data.error) {
    throw new Error(`LLM returned error: ${data.error.message}`);
  }

  return {
    id: data.id ?? "",
    choices: (data.choices ?? []).map(c => ({
      message: {
        role: c.message?.role ?? "assistant",
        content: c.message?.content ?? "",
      },
      finish_reason: c.finish_reason ?? "stop",
    })),
    usage: data.usage,
  };
}

// ─── JSON repair fallback (Phase A — task A3) ────────────────────────────────

/**
 * Attempts to repair broken JSON returned by the primary LLM, using a cheaper model.
 * Returns the repaired JSON as a string (NOT parsed) on success; throws otherwise.
 *
 * Model defaults to gpt-4o-mini (override via OPENAI_REPAIR_MODEL).
 * Cost per repair: ~$0.001 — effectively free insurance against wasted primary calls.
 */
export async function repairJson(brokenJson: string): Promise<string> {
  assertApiKey();

  const REPAIR_SYSTEM_PROMPT =
    "You repair broken JSON. Given input that is either malformed JSON or JSON wrapped in markdown/text, return ONLY a single valid JSON object — no commentary, no code fences, no explanation. Preserve ALL original fields and values. If a value is a truncated string, close it with a quote. If a closing brace or bracket is missing, add it. Never invent fields that were not present in the input.";

  const repairModel = process.env.OPENAI_REPAIR_MODEL ?? "gpt-4o-mini";

  const payload = {
    model: repairModel,
    messages: [
      { role: "system" as const, content: REPAIR_SYSTEM_PROMPT },
      { role: "user" as const, content: brokenJson.slice(0, 20000) },
    ],
    temperature: 0,
    max_tokens: 4096,
    response_format: { type: "json_object" as const },
  };

  const url = buildApiUrl();
  const response = await fetchWithRetry(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ENV.forgeApiKey}`,
        "HTTP-Referer": "https://easyjob.app",
        "X-Title": "EasyJob AI — JSON Repair",
      },
      body: JSON.stringify(payload),
    },
    2,     // retries
    500    // base delay ms
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => "(no body)");
    throw new Error(
      `JSON repair failed: ${response.status} ${response.statusText} — ${errorText}`
    );
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
    error?: { message: string };
  };

  if (data.error) {
    throw new Error(`JSON repair returned error: ${data.error.message}`);
  }

  const repaired = data.choices?.[0]?.message?.content;
  if (!repaired || typeof repaired !== "string" || repaired.trim() === "") {
    throw new Error("JSON repair returned empty content");
  }

  return repaired.trim();
}

/**
 * Convenience wrapper: parse JSON with automatic repair fallback.
 *
 * Tries in order:
 *   1. Direct JSON.parse
 *   2. Extract from markdown code fence (``` or ```json) if present
 *   3. LLM-assisted repair via repairJson()
 *
 * Throws only if all three strategies fail.
 */
export async function parseJsonWithRepair<T = unknown>(rawContent: string): Promise<T> {
  // Attempt 1: direct parse
  try {
    return JSON.parse(rawContent) as T;
  } catch {
    // Attempt 2: strip markdown fences
    const fenceMatch = rawContent.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
    if (fenceMatch) {
      try {
        return JSON.parse(fenceMatch[1]) as T;
      } catch {
        // fall through to repair
      }
    }

    // Attempt 3: LLM-assisted repair
    const repaired = await repairJson(rawContent);
    return JSON.parse(repaired) as T;
  }
}
