export const ENV = {
  nodeEnv: process.env.NODE_ENV ?? "production",
  port: Number(process.env.PORT ?? 3000),

  // Primary: OpenAI (paid). Set OPENAI_API_KEY in Render env vars.
  // Fallback: any OpenAI-compatible endpoint (OpenRouter, Groq, etc.)
  forgeApiKey:
    process.env.OPENAI_API_KEY ??
    process.env.BUILT_IN_FORGE_API_KEY ??
    "",

  forgeApiUrl:
    process.env.OPENAI_API_BASE_URL ??
    process.env.BUILT_IN_FORGE_API_URL ??
    "https://api.openai.com",

  // Default: gpt-4o for best structured output support.
  // Override via OPENAI_MODEL env var if needed (e.g. gpt-4o-mini to save cost).
  model: process.env.OPENAI_MODEL ?? "gpt-4o",

  corsOrigin: process.env.CORS_ORIGIN ?? "*",
};
