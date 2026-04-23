/**
 * Environment configuration for EasyLAB2.
 * All secrets must be set via environment variables.
 *
 * Required:
 *   - OPENAI_API_KEY (OpenAI direct, paid account)
 *
 * Optional:
 *   - OPENAI_API_BASE_URL (for custom proxies; defaults to api.openai.com)
 *   - OPENAI_MODEL (defaults to gpt-4o)
 *   - PORT (defaults to 3000)
 *   - DATABASE_URL (MySQL connection string; required for CRM features)
 *   - CORS_ORIGIN (defaults to "*")
 */
export const ENV = {
  nodeEnv: process.env.NODE_ENV ?? "production",
  port: Number(process.env.PORT ?? 3000),
  // Adicione esta linha abaixo:
  aiEngineUrl: process.env.AI_ENGINE_URL ?? "http://localhost:8000", 

  forgeApiKey: process.env.OPENAI_API_KEY ?? "",
  forgeApiUrl: process.env.OPENAI_API_BASE_URL ?? "https://api.openai.com",
  model: process.env.OPENAI_MODEL ?? "gpt-4o",
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
};
