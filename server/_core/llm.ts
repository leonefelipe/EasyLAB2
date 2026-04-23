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

  throw lastError ?? new Error("LLM request failed after retries");
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  assertApiKey();

  const payload: Record<string, unknown> = {
    model: ENV.model ?? "gpt-4o",
    messages: params.messages.map(normalizeMessage),
    temperature: params.temperature ?? 0.1,
    max_tokens: params.maxTokens ?? 4096,
  };

  // response_format resolution: snake_case wins over legacy camelCase
  const fmt = params.response_format ?? (
    params.responseFormat?.type === "json_object"
      ? { type: "json_object" as const }
      : undefined
  );

  if (fmt) {
    // gpt-4o supports json_schema (Structured Outputs).
    // For other models (e.g. llama via OpenRouter), downgrade to json_object.
    const model = String(ENV.model ?? "");
    const supportsStructuredOutput =
      model.startsWith("gpt-4o") || model.startsWith("o1") || model.startsWith("o3");

    if (fmt.type === "json_schema" && !supportsStructuredOutput) {
      payload.response_format = { type: "json_object" };
    } else {
      payload.response_format = fmt;
    }
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
      `LLM API error: ${response.status} ${response.statusText} — ${errorText}`
    );
  }

  const data = await response.json() as {
    id?: string;
    choices?: Array<{
      message?: { role?: string; content?: string | null };
      finish_reason?: string;
    }>;
    usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    error?: { message: string };
  };

  if (data.error) {
    throw new Error(`LLM API returned error: ${data.error.message}`);
  }

  const rawContent = data.choices?.[0]?.message?.content ?? "";
  const content = typeof rawContent === "string" ? rawContent : "";

  return {
    id: data.id ?? `llm-${Date.now()}`,
    choices: [
      {
        message: {
          role: (data.choices?.[0]?.message?.role as Role) ?? "assistant",
          content,
        },
        finish_reason: data.choices?.[0]?.finish_reason ?? "stop",
      },
    ],
    usage: data.usage,
  };
}
