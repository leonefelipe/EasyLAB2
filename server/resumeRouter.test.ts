import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock the LLM module to avoid real API calls in tests
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

import { invokeLLM } from "./_core/llm";

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

// Resposta mock para vaga compatível (vendas B2B)
const mockHighMatchResponse = {
  matchScore: 88,
  projectedMatchScore: 92,
  jobTitle: "Executivo de Vendas B2B",
  jobArea: "Vendas",
  keywords: ["Vendas B2B", "CRM", "Salesforce", "LinkedIn Sales Navigator", "Prospecção"],
  suggestions: [
    "Destacar experiência com SaaS no resumo profissional",
    "Incluir métricas de conversão e crescimento de pipeline",
  ],
  changes: [
    { section: "Resumo Profissional", description: "Adicionou palavras-chave 'CRM Salesforce' e 'Vendas B2B SaaS' para melhorar indexação ATS", impact: "alto" },
    { section: "Experiência", description: "Reorganizou bullet points para destacar métricas de pipeline e conversão", impact: "medio" },
  ],
  optimizedResume: `FELIPE LEONE
São Paulo, SP

RESUMO PROFISSIONAL
Profissional de vendas B2B com 15+ anos de experiência.

EXPERIÊNCIA
Especialista em Recrutamento | Robert Half | Out/2025 – Atual
- Venda B2B de soluções de recrutamento
- Gestão de pipeline no CRM Salesforce`,
  coverLetterPoints: [
    "Profissional com 18 anos de experiência em Vendas B2B SaaS, com histórico comprovado de superar metas em ambientes de alta pressão — exatamente o perfil descrito na vaga.",
    "Expertise em gestão de pipeline e forecast no CRM Salesforce, ferramenta central mencionada como requisito na descrição da vaga.",
    "Experiência em ciclo completo de vendas consultivas para segmentos de Tecnologia (SaaS/RH Tech/IoT), diretamente alinhada ao mercado-alvo da empresa.",
  ],
  gapAnalysis: [],
  scoreBreakdown: {
    technicalSkills: 26,
    experience: 28,
    keywords: 18,
    tools: 9,
    seniority: 9,
  },
};

// Resposta mock para vaga incompatível (desenvolvedor de chatbot)
const mockLowMatchResponse = {
  matchScore: 12,
  projectedMatchScore: 14,
  jobTitle: "Desenvolvedor de Chatbot",
  jobArea: "Tecnologia / Desenvolvimento de Software",
  keywords: ["Python", "Node.js", "Dialogflow", "NLP", "API REST", "Chatbot", "LLM", "Machine Learning"],
  suggestions: [
    "Seu perfil é de vendas B2B e recrutamento — esta vaga exige habilidades técnicas de desenvolvimento de software que não constam no seu currículo.",
    "Para se qualificar, seria necessário aprender: Python ou Node.js, frameworks de NLP (Dialogflow, Rasa), e desenvolvimento de APIs REST.",
    "Considere vagas mais alinhadas ao seu perfil: Executivo de Vendas, Business Development, Gerente Comercial ou Especialista em Recrutamento.",
    "Seu histórico com CRM e ferramentas de prospecção não é transferível diretamente para desenvolvimento de software.",
  ],
  changes: [
    { section: "Resumo Profissional", description: "Ajustou linguagem para destacar capacidade de aprendizado e adaptação, única transferência possível", impact: "baixo" },
  ],
  optimizedResume: `FELIPE LEONE
São Paulo, SP

RESUMO PROFISSIONAL
Profissional de vendas B2B e recrutamento com 15+ anos de experiência. Nota: este currículo não possui aderência técnica à vaga de desenvolvedor de chatbot.

EXPERIÊNCIA
Especialista em Recrutamento | Robert Half | Out/2025 – Atual
- Recrutamento e seleção de profissionais
- Gestão de pipeline no CRM Salesforce`,
  coverLetterPoints: [
    "Embora meu perfil seja de Vendas B2B e Recrutamento, possuo forte capacidade de aprendizado e adaptação demonstrada ao longo de 18 anos de carreira.",
    "Experiência com ferramentas tecnológicas como Salesforce e LinkedIn Recruiter demonstra afinidade com ambientes tech.",
    "Disponibilidade para transição de carreira com dedicação ao aprendizado das tecnologias exigidas.",
  ],
  gapAnalysis: [
    "A vaga exige Python ou Node.js — habilidades de programação que não constam no currículo.",
    "Experiência com frameworks de NLP (Dialogflow, Rasa, NLTK) é requisito central e está ausente no perfil.",
    "Desenvolvimento de APIs REST e integração de sistemas não fazem parte do histórico profissional.",
    "Machine Learning e modelos de linguagem (LLM) são competências técnicas avançadas não presentes no currículo.",
  ],
  scoreBreakdown: {
    technicalSkills: 1,
    experience: 2,
    keywords: 3,
    tools: 1,
    seniority: 5,
  },
};

describe("resume.analyze", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return high match score for compatible job (sales B2B)", async () => {
    (invokeLLM as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      choices: [{ message: { role: "assistant", content: JSON.stringify(mockHighMatchResponse) }, finish_reason: "stop", index: 0 }],
    });

    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.resume.analyze({
      resumeText: "Felipe Leone - Profissional de vendas B2B com 15 anos de experiência em CRM Salesforce e LinkedIn Sales Navigator.",
      jobUrl: "Vaga de Executivo de Vendas B2B SaaS com experiência em Salesforce e prospecção ativa",
    });

    expect(result.matchScore).toBeGreaterThan(70);
    expect(result.jobArea).toBe("Vendas");
    expect(result.jobTitle).toBe("Executivo de Vendas B2B");
    expect(result.projectedMatchScore).toBeGreaterThanOrEqual(result.matchScore);
    expect(Array.isArray(result.changes)).toBe(true);
    expect(result.changes.length).toBeGreaterThan(0);
    expect(result.changes[0]).toHaveProperty("section");
    expect(result.changes[0]).toHaveProperty("description");
    expect(["alto", "medio", "baixo"]).toContain(result.changes[0].impact);
  });

  it("should return LOW match score for incompatible job (chatbot developer)", async () => {
    (invokeLLM as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      choices: [{ message: { role: "assistant", content: JSON.stringify(mockLowMatchResponse) }, finish_reason: "stop", index: 0 }],
    });

    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.resume.analyze({
      resumeText: "Felipe Leone - Profissional de vendas B2B com 15 anos de experiência em CRM Salesforce.",
      jobUrl: "Vaga de Desenvolvedor de Chatbot com Python, Node.js, Dialogflow, NLP e Machine Learning",
    });

    // Score DEVE ser baixo para área completamente diferente
    expect(result.matchScore).toBeLessThan(30);
    expect(result.jobArea).toContain("Tecnologia");
    expect(result.scoreBreakdown.technicalSkills).toBeLessThan(5);
    expect(result.scoreBreakdown.experience).toBeLessThan(5);
  });

  it("should compute matchScore as sum of breakdown values", async () => {
    (invokeLLM as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      choices: [{ message: { role: "assistant", content: JSON.stringify(mockLowMatchResponse) }, finish_reason: "stop", index: 0 }],
    });

    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.resume.analyze({
      resumeText: "Felipe Leone - Profissional de vendas B2B com 15 anos de experiência.",
      jobUrl: "Desenvolvedor de Chatbot Python Node.js Dialogflow NLP",
    });

    const expectedScore =
      result.scoreBreakdown.technicalSkills +
      result.scoreBreakdown.experience +
      result.scoreBreakdown.keywords +
      result.scoreBreakdown.tools +
      result.scoreBreakdown.seniority;

    expect(result.matchScore).toBe(Math.min(100, Math.max(0, expectedScore)));
  });

  it("should include jobTitle and jobArea in response", async () => {
    (invokeLLM as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      choices: [{ message: { role: "assistant", content: JSON.stringify(mockHighMatchResponse) }, finish_reason: "stop", index: 0 }],
    });

    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.resume.analyze({
      resumeText: "Felipe Leone - Profissional de vendas B2B com 15 anos de experiência.",
      jobUrl: "Vaga de Executivo de Vendas B2B",
    });

    expect(result.jobTitle).toBeDefined();
    expect(result.jobArea).toBeDefined();
    expect(typeof result.jobTitle).toBe("string");
    expect(typeof result.jobArea).toBe("string");
  });

  it("should throw error when resumeText is too short", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.resume.analyze({ resumeText: "curto", jobUrl: "https://www.linkedin.com/jobs/view/test" })
    ).rejects.toThrow();
  });

  it("should throw error when jobUrl is too short", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.resume.analyze({
        resumeText: "Felipe Leone - Profissional de vendas B2B com 15 anos de experiência em CRM Salesforce.",
        jobUrl: "x",
      })
    ).rejects.toThrow();
  });

  it("should correct projectedMatchScore when AI returns it lower than matchScore", async () => {
    // Mock com projectedMatchScore (70) MENOR que soma do breakdown (90)
    const mockBrokenProjected = {
      ...mockHighMatchResponse,
      projectedMatchScore: 70, // Menor que matchScore (90 = 26+28+18+9+9)
      coverLetterPoints: ["Ponto 1", "Ponto 2", "Ponto 3"],
      gapAnalysis: [],
    };

    (invokeLLM as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      choices: [{ message: { role: "assistant", content: JSON.stringify(mockBrokenProjected) }, finish_reason: "stop", index: 0 }],
    });

    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.resume.analyze({
      resumeText: "Felipe Leone - Profissional de vendas B2B com 15 anos de experiência em CRM Salesforce e LinkedIn Sales Navigator.",
      jobUrl: "Vaga de Executivo de Vendas B2B SaaS com experiência em Salesforce e prospecção ativa",
    });

    // O backend DEVE corrigir para que projectedMatchScore >= matchScore
    expect(result.projectedMatchScore).toBeGreaterThanOrEqual(result.matchScore);
  });

  it("should throw error when LLM returns empty content", async () => {
    (invokeLLM as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      choices: [{ message: { role: "assistant", content: null }, finish_reason: "stop", index: 0 }],
    });

    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.resume.analyze({
        resumeText: "Felipe Leone - Profissional de vendas B2B com 15 anos de experiência em CRM Salesforce.",
        jobUrl: "https://www.linkedin.com/jobs/view/executivo-de-vendas",
      })
    ).rejects.toThrow("Resposta vazia da IA");
  });

  it("should sanitize optimizedResume: fix missing accents in uppercase words", async () => {
    // Mock com palavras sem acento em maiusculas (como a IA frequentemente retorna)
    const mockWithMissingAccents = {
      ...mockHighMatchResponse,
      optimizedResume: `FELIPE LEONE
Sao Paulo, SP

RESUMO PROFISSIONAL
Profissional de vendas B2B.

COMPETENCIAS PRINCIPAIS
- Vendas B2B
- Gestao de Pipeline

EXPERIENCIA PROFISSIONAL
Especialista | Robert Half | Out/2025 - Atual
- Gestao de clientes

FORMACAO ACADEMICA
Administracao | FGV | 2010

CERTIFICACOES
Salesforce Certified`,
    };

    (invokeLLM as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      choices: [{ message: { role: "assistant", content: JSON.stringify(mockWithMissingAccents) }, finish_reason: "stop", index: 0 }],
    });

    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.resume.analyze({
      resumeText: "Felipe Leone - Profissional de vendas B2B com 15 anos de experiência em CRM Salesforce.",
      jobUrl: "Vaga de Executivo de Vendas B2B SaaS com experiência em Salesforce",
    });

    // Verifica que os acentos foram corrigidos automaticamente pelo backend
    expect(result.optimizedResume).toContain("COMPETÊNCIAS");
    expect(result.optimizedResume).toContain("EXPERIÊNCIA");
    expect(result.optimizedResume).toContain("FORMAÇÃO");
    expect(result.optimizedResume).toContain("CERTIFICAÇÕES");
    // Verifica que palavras sem acento foram corrigidas
    expect(result.optimizedResume).not.toContain("COMPETENCIAS");
    expect(result.optimizedResume).not.toContain("EXPERIENCIA");
    expect(result.optimizedResume).not.toContain("FORMACAO");
    expect(result.optimizedResume).not.toContain("CERTIFICACOES");
  });

  it("should sanitize optimizedResume: remove markdown and emojis", async () => {
    const mockWithMarkdown = {
      ...mockHighMatchResponse,
      optimizedResume: `**FELIPE LEONE**\n\n## RESUMO PROFISSIONAL\nProfissional de vendas B2B. ✅\n\n**EXPERIÊNCIA PROFISSIONAL**\n- _Gestão de pipeline_ no CRM Salesforce 🎯`,
    };

    (invokeLLM as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      choices: [{ message: { role: "assistant", content: JSON.stringify(mockWithMarkdown) }, finish_reason: "stop", index: 0 }],
    });

    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.resume.analyze({
      resumeText: "Felipe Leone - Profissional de vendas B2B com 15 anos de experiência em CRM Salesforce.",
      jobUrl: "Vaga de Executivo de Vendas B2B SaaS",
    });

    // Verifica que markdown e emojis foram removidos
    expect(result.optimizedResume).not.toContain("**");
    expect(result.optimizedResume).not.toContain("##");
    expect(result.optimizedResume).not.toContain("_");
    // Verifica que o texto foi preservado
    expect(result.optimizedResume).toContain("FELIPE LEONE");
    expect(result.optimizedResume).toContain("Profissional de vendas B2B");
  });

  it("should throw error when LLM returns invalid JSON", async () => {
    (invokeLLM as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      choices: [{ message: { role: "assistant", content: "isso não é json válido" }, finish_reason: "stop", index: 0 }],
    });

    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.resume.analyze({
        resumeText: "Felipe Leone - Profissional de vendas B2B com 15 anos de experiência em CRM Salesforce.",
        jobUrl: "https://www.linkedin.com/jobs/view/executivo-de-vendas",
      })
    ).rejects.toThrow("Erro ao processar resposta da IA");
  });
});
