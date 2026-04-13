const env = {
  nodeEnv: process.env.NODE_ENV ?? "production",

  port: Number(process.env.PORT ?? 3000),

  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",

  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "https://api.openai.com",

  model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",

  corsOrigin: process.env.CORS_ORIGIN ?? "*"
};

export default env;
