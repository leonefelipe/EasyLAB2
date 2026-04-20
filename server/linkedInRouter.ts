import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const LinkedInImprovementSchema = z.object({
  section: z.string(),
  currentState: z.string(),
  suggestion: z.string(),
  impact: z.enum(["alto", "medio", "baixo"]),
  exampleText: z.string(),
});

const LinkedInAnalysisSchema = z.object({
  profileStrength: z.number(),          // 0-100
  ssiEstimate: z.number(),              // 0-100 (estimativa do Social Selling Index)
  headline: z.object({
    current: z.string(),
    optimized: z.string(),
    score: z.number(),
  }),
  about: z.object({
    score: z.number(),
    feedback: z.string(),
    optimized: z.string(),
  }),
  improvements: z.array(LinkedInImprovementSchema),
  missingKeywords: z.array(z.string()),
  topStrengths: z.array(z.string()),
  recruiterVisibilityScore: z.number(),  // 0-100
  recruiterVisibilityTips: z.array(z.string()),
  profileArea: z.string(),
  profileTitle: z.string(),
  quickWins: z.array(z.string()),        // ações de alto impacto e baixo esforço
});

export type LinkedInAnalysis = z.infer<typeof LinkedInAnalysisSchema>;

// ─── LinkedIn scraper ─────────────────────────────────────────────────────────

async function scrapeLinkedInProfile(url: string): Promise<string | null> {
  try {
    const urlObj = new URL(url);
    if (!urlObj.hostname.includes("linkedin.com")) return null;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) return null;

    const html = await response.text();

    // Extrai apenas o conteúdo relevante do perfil público do LinkedIn
    const cleaned = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
      .replace(/<header[\s\S]*?<\/header>/gi, " ")
      .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s{2,}/g, " ")
      .trim();

    return cleaned.slice(0, 8000);
  } catch {
    return null;
  }
}

function isLinkedInUrl(input: string): boolean {
  try {
    const u = new URL(input.trim());
    return u.protocol.startsWith("http") && u.hostname.includes("linkedin.com");
  } catch {
    return false;
  }
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const linkedinRouter = router({
  analyze: publicProcedure
    .input(
      z.object({
        profileText: z.string().min(50, "Cole o conteúdo do perfil ou forneça a URL"),
        profileUrl: z.string().optional(),
        targetRole: z.string().optional(), // vaga ou cargo alvo (opcional)
      })
    )
    .mutation(async ({ input }) => {
      const { profileText, profileUrl, targetRole } = input;

      let contentToAnalyze = profileText.trim();
      let scrapedSuccessfully = false;

      // Tenta fazer scraping se for URL do LinkedIn
      if (profileUrl && isLinkedInUrl(profileUrl)) {
        const scraped = await scrapeLinkedInProfile(profileUrl.trim());
        if (scraped && scraped.length > 300) {
          contentToAnalyze = scraped;
          scrapedSuccessfully = true;
        }
      } else if (isLinkedInUrl(profileText.trim())) {
        const scraped = await scrapeLinkedInProfile(profileText.trim());
        if (scraped && scraped.length > 300) {
          contentToAnalyze = scraped;
          scrapedSuccessfully = true;
        }
      }

      const targetRoleContext = targetRole
        ? `\n\nCAR GO / VAGA ALVO DO CANDIDATO: ${targetRole}\nConsidere este contexto para calibrar as sugestões de palavras-chave e visibilidade para recrutadores que buscam este perfil.`
        : "";

      const systemPrompt = `Você é um especialista sênior em LinkedIn com 15 anos de experiência em Personal Branding, Social Selling e Recrutamento Digital. Você já otimizou mais de 3.000 perfis e conhece profundamente:

- O algoritmo de busca do LinkedIn (como recrutadores encontram candidatos via LinkedIn Recruiter e Talent Search)
- O Social Selling Index (SSI) e como cada seção impacta o score
- Melhores práticas de headline, resumo (About) e experiências para ATS e recrutadores
- Estratégias de keyword density para perfis do LinkedIn em PT-BR e EN
- Como o LinkedIn rankeia perfis nas buscas de recrutadores (relevância, completude, atividade)

== ESTRUTURA DO PERFIL LINKEDIN E PESOS NO ALGORITMO ==

HEADLINE (Título profissional):
- PESO MÁXIMO no algoritmo de busca
- Deve ter 120-220 caracteres (limite: 220)
- Fórmula ideal: [Cargo Principal] | [Especialidade 1] | [Especialidade 2] | [Resultado/Diferencial]
- Inclua palavras-chave exatas que recrutadores buscam no LinkedIn Recruiter
- NUNCA use apenas o cargo atual — isso desperdiça espaço valioso de SEO

ABOUT (Sobre/Resumo):
- PESO ALTO — aparece logo no topo, lido em 7 segundos
- Limite: 2.600 caracteres (use pelo menos 1.500)
- Estrutura ideal: Hook (1ª linha impactante) → Proposta de valor → Conquistas com números → Call to action
- A 1ª linha é crucial: aparece no preview sem clicar em "ver mais"
- Inclua palavras-chave naturalmente (densidade de 3-5% para principais termos)

EXPERIÊNCIAS:
- Título do cargo = campo mais pesado para busca booleana de recrutadores
- Cada cargo deve ter 3-5 bullet points com verbos de ação + métricas
- Datas exatas aumentam credibilidade (mês/ano)

COMPETÊNCIAS (Skills):
- Top 3 skills são destacadas e têm peso maior no algoritmo
- Máximo de 50 skills — escolha com base no que recrutadores buscam

FOTO E BANNER:
- Perfil com foto recebe 21x mais visualizações
- Banner personalizado aumenta tempo de permanência no perfil

== MÉTRICAS QUE VOCÊ AVALIA ==

profileStrength (0-100): Completude e qualidade geral do perfil
- 90-100: All-Star (headline excelente + about completo + 5+ experiências + foto + 50 skills + recomendações)
- 70-89: Bom perfil com alguns gaps
- 50-69: Perfil médio, visível mas não otimizado
- 0-49: Perfil incompleto, baixa visibilidade

ssiEstimate (0-100): Estimativa do Social Selling Index
- Baseado na completude, atividade inferida e uso de recursos do LinkedIn
- Considera: identidade profissional, network, engajamento, relacionamentos

recruiterVisibilityScore (0-100): Probabilidade de aparecer em buscas de recrutadores
- Baseado em: densidade de keywords no headline e about, completude do perfil, número de conexões estimado

== REGRAS ABSOLUTAS ==

1. NUNCA invente informações que não estão no perfil fornecido
2. NUNCA altere datas, empresas ou cargos existentes
3. Se o perfil estiver em inglês, mantenha as sugestões em inglês
4. Se o perfil estiver em português, mantenha em português
5. O campo "exampleText" deve ser texto REAL que o candidato pode copiar e colar diretamente

Retorne APENAS JSON válido sem markdown.`;

      const userMessage = `PERFIL LINKEDIN${scrapedSuccessfully ? " (extraído automaticamente)" : " (fornecido pelo usuário)"}:

${contentToAnalyze}
${targetRoleContext}

Analise este perfil do LinkedIn com profundidade e retorne um JSON com esta estrutura exata:

{
  "profileStrength": <0-100>,
  "ssiEstimate": <0-100>,
  "profileTitle": "<cargo/título principal identificado no perfil>",
  "profileArea": "<área profissional: Tecnologia, Vendas, RH, Marketing, Financas, etc.>",
  "headline": {
    "current": "<headline atual do perfil — se não encontrado, escreva 'Não identificado'>",
    "optimized": "<headline otimizado com 150-220 chars, com keywords para SEO do LinkedIn>",
    "score": <0-100 — qualidade do headline atual>
  },
  "about": {
    "score": <0-100 — qualidade do about atual>,
    "feedback": "<análise do about atual: o que está bom e o que falta>",
    "optimized": "<texto completo do about otimizado, 1500-2000 chars, com hook, proposta de valor, conquistas e CTA>"
  },
  "topStrengths": [
    "<ponto forte 1 do perfil>",
    "<ponto forte 2>",
    "<ponto forte 3>"
  ],
  "missingKeywords": [
    "<keyword importante que está ausente ou subrepresentada>",
    ...
  ],
  "recruiterVisibilityScore": <0-100>,
  "recruiterVisibilityTips": [
    "<dica específica para aparecer mais em buscas de recrutadores>",
    ...
  ],
  "quickWins": [
    "<ação de alto impacto e baixo esforço que pode ser feita em menos de 5 minutos>",
    "<quick win 2>",
    "<quick win 3>"
  ],
  "improvements": [
    {
      "section": "<nome da seção: Headline | About | Foto | Banner | Experiência | Competências | Recomendações | Formação | URL Personalizada | Destaque (Featured)>",
      "currentState": "<estado atual desta seção — o que foi identificado ou 'Não identificado'>",
      "suggestion": "<sugestão específica e acionável>",
      "impact": "<alto | medio | baixo>",
      "exampleText": "<texto de exemplo que o usuário pode usar diretamente — seja concreto e específico>"
    }
  ]
}

IMPORTANTE:
- "improvements" deve ter entre 5 e 8 itens, priorizados por impacto
- "missingKeywords" deve ter entre 5 e 10 palavras-chave
- "quickWins" deve ter exatamente 3 itens
- "recruiterVisibilityTips" deve ter entre 3 e 5 dicas
- O campo "about.optimized" deve ser texto completo e pronto para uso, não um template
- O campo "headline.optimized" deve ser texto pronto para copiar e colar`;

      const response = await invokeLLM({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        maxTokens: 4000,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "linkedin_analysis",
            strict: true,
            schema: {
              type: "object",
              properties: {
                profileStrength: { type: "number" },
                ssiEstimate: { type: "number" },
                profileTitle: { type: "string" },
                profileArea: { type: "string" },
                headline: {
                  type: "object",
                  properties: {
                    current: { type: "string" },
                    optimized: { type: "string" },
                    score: { type: "number" },
                  },
                  required: ["current", "optimized", "score"],
                  additionalProperties: false,
                },
                about: {
                  type: "object",
                  properties: {
                    score: { type: "number" },
                    feedback: { type: "string" },
                    optimized: { type: "string" },
                  },
                  required: ["score", "feedback", "optimized"],
                  additionalProperties: false,
                },
                topStrengths: { type: "array", items: { type: "string" } },
                missingKeywords: { type: "array", items: { type: "string" } },
                recruiterVisibilityScore: { type: "number" },
                recruiterVisibilityTips: { type: "array", items: { type: "string" } },
                quickWins: { type: "array", items: { type: "string" } },
                improvements: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      section: { type: "string" },
                      currentState: { type: "string" },
                      suggestion: { type: "string" },
                      impact: { type: "string", enum: ["alto", "medio", "baixo"] },
                      exampleText: { type: "string" },
                    },
                    required: ["section", "currentState", "suggestion", "impact", "exampleText"],
                    additionalProperties: false,
                  },
                },
              },
              required: [
                "profileStrength", "ssiEstimate", "profileTitle", "profileArea",
                "headline", "about", "topStrengths", "missingKeywords",
                "recruiterVisibilityScore", "recruiterVisibilityTips", "quickWins", "improvements",
              ],
              additionalProperties: false,
            },
          },
        },
      });

      const rawContent = response.choices[0]?.message?.content;
      if (!rawContent) throw new Error("Resposta vazia da IA. Tente novamente.");
      const content = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);

      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        throw new Error("Erro ao processar resposta da IA. Tente novamente.");
      }

      const validated = LinkedInAnalysisSchema.parse(parsed);

      return {
        ...validated,
        profileStrength: Math.min(100, Math.max(0, validated.profileStrength)),
        ssiEstimate: Math.min(100, Math.max(0, validated.ssiEstimate)),
        recruiterVisibilityScore: Math.min(100, Math.max(0, validated.recruiterVisibilityScore)),
        scrapedProfile: scrapedSuccessfully,
      };
    }),
});
