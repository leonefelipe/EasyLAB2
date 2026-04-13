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
  // Garante que o texto seja extraído corretamente caso venha em formatos diferentes
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
    throw new Error("Chave da API não configurada no Render (BUILT_IN_FORGE_API_KEY)");
  }

  const payload = {
    model: ENV.model || "meta-llama/llama-3.1-8b-instruct:free",
    messages: params.messages.map(normalizeMessage),
    temperature: 0.1,
    max_tokens: params.maxTokens || 8192
  };

  // Puxa a URL base do Render ou usa a da OpenRouter como padrão
  const baseUrl = ENV.forgeApiUrl || "https://openrouter.ai/api/v1";
  // Evita duplicar a barra caso a URL termine com /
  const apiUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;

  const response = await fetch(`${apiUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${ENV.forgeApiKey}`,
      "HTTP-Referer": "https://easyjob.com", // Obrigatório na OpenRouter
      "X-Title": "EasyJob" // Obrigatório na OpenRouter
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Erro na API OpenRouter: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content ?? "";

  // Retorna o formato exato que o seu backend espera
  return {
    id: `llm-${Date.now()}`,
    choices: [{
      message: { role: "assistant", content },
      finish_reason: "stop"
    }]
  };
}
