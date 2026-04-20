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

  // OpenAI API (direct). Required.
  forgeApiKey: process.env.OPENAI_API_KEY ?? "",
  forgeApiUrl: process.env.OPENAI_API_BASE_URL ?? "https://api.openai.com",

  // Default: gpt-4o for best structured output support.
  // Override via OPENAI_MODEL env var if needed (e.g. gpt-4o-mini to save cost).
  model: process.env.OPENAI_MODEL ?? "gpt-4o",

  corsOrigin: process.env.CORS_ORIGIN ?? "*",
};
