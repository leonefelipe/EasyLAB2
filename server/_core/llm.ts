import { ENV } from "./env";

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type Message = {
  role: Role;
  content: string | any;
  name?: string;
};

export type InvokeParams = {
  messages: Message[];
  maxTokens?: number;
  responseFormat?: { type: "text" | "json_object" | "json_schema" };
};

export type InvokeResult = {
  id: string;
  choices: Array<{
    message: { role: Role; content: string };
    finish_reason: string;
  }>;
};

function normalizeMessage(message: Message) {
  const content = typeof message.content === "string" 
    ? message.content 
    : Array.isArray(message.content) 
      ? message.content.map(p => p.text || "").join("\n") 
      : message.content.text || "";
      
  return {
    role: message.role === "model" ? "assistant" : message.role,
    content: content
  };
}

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  if (!ENV.forgeApiKey) {
    throw new Error("API Key ausente. Configure BUILT_IN_FORGE_API_KEY no Render.");
  }

  const payload: any = {
    model: ENV.model || "openrouter/free",
    messages: params.messages.map(normalizeMessage),
    temperature: 0.1,
    max_tokens: params.maxTokens || 8192
  };

  // Trava de segurança: Força a IA a responder em JSON estruturado
  if (params.responseFormat && params.responseFormat.type === "json_object") {
    payload.response_format = { type: "json_object" };
  }

  const baseUrl = ENV.forgeApiUrl || "https://openrouter.ai/api/v1";
  const apiUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;

  const response = await fetch(`${apiUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${ENV.forgeApiKey}`,
      "HTTP-Referer": "https://easyjob.com",
      "X-Title": "EasyJob"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Erro na API OpenRouter: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content ?? "";

  return {
    id: `llm-${Date.now()}`,
    choices: [{
      message: { role: "assistant", content },
      finish_reason: "stop"
    }]
  };
}
