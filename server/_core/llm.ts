import { ENV } from "./env";

type Message = {
  role: "system" | "user" | "assistant";
  content: string;
};

function normalizeMessage(message: Message) {
  return {
    role: message.role,
    content: message.content
  };
}

export async function callLLM(messages: Message[]): Promise<string> {
  if (!ENV.forgeApiKey) {
    throw new Error("OpenAI API key not configured");
  }

  const payload = {
    model: ENV.model,
    messages: messages.map(normalizeMessage),
    temperature: 0.7,
    max_tokens: 1024
  };

  const response = await fetch(`${ENV.forgeApiUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ENV.forgeApiKey}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${errorText}`);
  }

  const data = await response.json();

  return data?.choices?.[0]?.message?.content ?? "";
}
