import { invokeLLM, parseJsonWithRepair } from "../_core/llm";
import type { AnalysisResult } from "../resumeRouter";
import type { LinkedInAnalysis } from "../linkedInRouter";

export interface PremiumReportInput {
  clientName: string;
  resumeAnalysis: AnalysisResult;
  linkedinAnalysis: LinkedInAnalysis;
  originalCV: string;
  originalLinkedIn: string;
}

export interface PremiumReport {
  clientName: string;
  generatedAt: string;

  executiveSummary: {
    headline: string;
    diagnosis: string;
    beforeAfter: { before: string; after: string };
    valueDelivered: string[];
  };

  atsAnalysis: {
    currentScore: number;
    projectedScore: number;
    breakdown: { name: string; current: number; max: number }[];
    whatWasWrong: string[];
    whatWasFixed: string[];
    strategicRationale: string;
  };

  recruiterPerception: {
    currentRead: string;
    optimizedRead: string;
    triggers: string[];
    fears: string[];
    idealNarrative: string;
  };

  cvOptimization: {
    strategicSummary: string;
    improvedBullets: {
      section: string;
      before: string;
      after: string;
      reasoning: string;
    }[];
    missingKeywords: string[];
    seniorityLevel: string;
    careerTrajectory: string;
  };

  linkedinOptimization: {
    currentScore: number;
    profileStrength: number;
    ssiEstimate: number;
    recruiterVisibility: number;
    headline: { before: string; after: string; rationale: string };
    about: { before: string; after: string; rationale: string };
    missingKeywords: string[];
    topStrengths: string[];
    quickWins: string[];
  };

  strategicKeywords: {
    primary: string[];
    secondary: string[];
    rationale: string;
  };

  nextSteps: string[];

  closingMessage: string;
}

export async function generatePremiumReport(
  input: PremiumReportInput
): Promise<PremiumReport> {
  const { clientName, resumeAnalysis, linkedinAnalysis, originalCV, originalLinkedIn } = input;

  const atsBreakdown = [
    { name: "Parsing", current: resumeAnalysis.atsScoreBreakdown.parsing, max: 20 },
    { name: "Palavras-chave", current: resumeAnalysis.atsScoreBreakdown.keywordMatch, max: 25 },
    { name: "Qualidade de experiência", current: resumeAnalysis.atsScoreBreakdown.experienceQuality, max: 20 },
    { name: "Métricas de impacto", current: resumeAnalysis.atsScoreBreakdown.impactMetrics, max: 15 },
    { name: "Formatação ATS", current: resumeAnalysis.atsScoreBreakdown.formatting, max: 10 },
    { name: "Skills alinhadas", current: resumeAnalysis.atsScoreBreakdown.skillsAlignment, max: 10 },
  ];

  const missingKeywords = [
    ...new Set([
      ...(resumeAnalysis.missingKeywords || []),
      ...(linkedinAnalysis.missingKeywords || []),
    ]),
  ].slice(0, 20);

  const dataContext = {
    cliente: clientName,
    cvOriginal: originalCV.slice(0, 4000),
    linkedinOriginal: originalLinkedIn.slice(0, 3000),
    analiseCV: {
      atsScore: resumeAnalysis.atsScore,
      atsBreakdown: resumeAnalysis.atsScoreBreakdown,
      projectedMatchScore: (resumeAnalysis as unknown as { projectedMatchScore?: number }).projectedMatchScore,
      strengths: resumeAnalysis.strengths,
      weaknesses: resumeAnalysis.weaknesses,
      missingKeywords: resumeAnalysis.missingKeywords,
      improvedBullets: resumeAnalysis.improvedBullets,
      recruiterInsights: resumeAnalysis.recruiterInsights,
      recruiterProfile: resumeAnalysis.recruiterProfile,
      seniorityLevel: resumeAnalysis.seniorityLevel,
      careerTrajectory: resumeAnalysis.careerTrajectory,
      valueProposition: resumeAnalysis.valueProposition,
      competitiveEdges: resumeAnalysis.competitiveEdges,
      competitiveRisks: resumeAnalysis.competitiveRisks,
    },
    analiseLinkedIn: {
      profileStrength: linkedinAnalysis.profileStrength,
      ssiEstimate: linkedinAnalysis.ssiEstimate,
      recruiterVisibilityScore: linkedinAnalysis.recruiterVisibilityScore,
      headline: linkedinAnalysis.headline,
      about: linkedinAnalysis.about,
      topStrengths: linkedinAnalysis.topStrengths,
      missingKeywords: linkedinAnalysis.missingKeywords,
      quickWins: linkedinAnalysis.quickWins,
      recruiterVisibilityTips: linkedinAnalysis.recruiterVisibilityTips,
    },
  };

  const systemPrompt = `Você é um consultor estratégico sênior da Leone Berto Consultoria, especializada em estratégia de carreira e posicionamento profissional premium.

Sua tarefa é transformar os dados já analisados pelos motores do sistema (ATS engine + LinkedIn analyzer) em um RELATÓRIO PREMIUM de consultoria entregue ao cliente.

REGRAS ABSOLUTAS:
- NÃO invente dados. Use EXCLUSIVAMENTE os dados fornecidos no JSON de contexto.
- Sua função é TRANSFORMAR dados técnicos em narrativa de consultoria de alto valor.
- Linguagem: consultoria premium, português brasileiro, São Paulo, sofisticada mas direta.
- Use o nome do cliente quando apropriado.
- Mostre VALOR do serviço — cada seção deve responder: "o que o cliente ganhou?"
- Seja específico e persuasivo — evite genéricos como "melhoramos seu CV".
- Cite números, breakdowns e keywords específicas dos dados.

ESTRUTURA DO RELATÓRIO (retorne EXATAMENTE este JSON):

{
  "clientName": "<nome do cliente>",
  "generatedAt": "<ISO 8601 agora>",
  "executiveSummary": {
    "headline": "<uma frase de 1 linha, impactante, com o valor entregue>",
    "diagnosis": "<2-3 parágrafos diagnóstico claro: onde o cliente estava, por que não estava sendo encontrado/selecionado>",
    "beforeAfter": {
      "before": "<como o perfil era percebido ANTES — 2-3 frases>",
      "after": "<como será percebido DEPOIS das otimizações — 2-3 frases>"
    },
    "valueDelivered": ["<5 entregas tangíveis em bullet points curtos>"]
  },
  "atsAnalysis": {
    "currentScore": <número atsScore dos dados>,
    "projectedScore": <número — estime +15 a +25 pontos baseado nas melhorias; máx 92>,
    "breakdown": <array de breakdowns — copie dos dados>,
    "whatWasWrong": ["<3-5 itens específicos do que estava prejudicando o ATS — use weaknesses e formattingIssues dos dados>"],
    "whatWasFixed": ["<3-5 itens do que foi corrigido — reflete os improvedBullets e missingKeywords incorporados>"],
    "strategicRationale": "<1 parágrafo explicando a estratégia técnica por trás das melhorias: como o ATS lê, por que isso aumenta match, qual o ganho concreto>"
  },
  "recruiterPerception": {
    "currentRead": "<como um recrutador lia o perfil ANTES — 2 frases>",
    "optimizedRead": "<como lerá DEPOIS — 2 frases>",
    "triggers": <use recruiterProfile.recruiterTriggers>,
    "fears": <use recruiterProfile.recruiterFears>,
    "idealNarrative": <use recruiterProfile.idealNarrative>
  },
  "cvOptimization": {
    "strategicSummary": "<1 parágrafo amarrando a trajetória de carreira (careerTrajectory) com a seniority (seniorityLevel) e a proposta de valor (valueProposition.improvedStatement)>",
    "improvedBullets": [
      {
        "section": "<seção/empresa do bullet>",
        "before": "<texto antigo do bullet>",
        "after": "<texto otimizado — copie de improvedBullets.improved>",
        "reasoning": "<1-2 frases explicando POR QUE essa mudança funciona: verbo de ação, quantificação, keyword ATS>"
      }
    ],
    "missingKeywords": <copie missingKeywords dos dados, top 10>,
    "seniorityLevel": <copie seniorityLevel>,
    "careerTrajectory": <copie careerTrajectory>
  },
  "linkedinOptimization": {
    "currentScore": <profileStrength>,
    "profileStrength": <profileStrength>,
    "ssiEstimate": <ssiEstimate>,
    "recruiterVisibility": <recruiterVisibilityScore>,
    "headline": {
      "before": <headline.current>,
      "after": <headline.optimized>,
      "rationale": "<por que a nova headline gera mais matches no LinkedIn Recruiter — 2-3 frases técnicas>"
    },
    "about": {
      "before": "<primeiros 300 chars do about atual — extraia do linkedinOriginal>",
      "after": <about.optimized>,
      "rationale": "<explicação da nova estrutura: hook, proposta de valor, conquistas, CTA>"
    },
    "missingKeywords": <missingKeywords do linkedin, top 10>,
    "topStrengths": <topStrengths do linkedin>,
    "quickWins": <quickWins do linkedin>
  },
  "strategicKeywords": {
    "primary": ["<5-7 keywords MAIS críticas combinando CV + LinkedIn>"],
    "secondary": ["<5-10 keywords complementares>"],
    "rationale": "<1 parágrafo explicando como essas keywords foram escolhidas: busca de recrutadores + ATS + tendência de mercado>"
  },
  "nextSteps": [
    "<5-7 ações concretas e sequenciais que o cliente deve executar nos próximos 7, 15 e 30 dias>"
  ],
  "closingMessage": "<1 parágrafo de fechamento consultivo, reforçando valor entregue, posicionamento premium do cliente e convite a evoluir>"
}

Retorne APENAS o JSON, sem markdown, sem preâmbulo.`;

  const userPrompt = `DADOS DO CLIENTE E ANÁLISE (usar exclusivamente estes dados):

${JSON.stringify(dataContext, null, 2)}

Gere o relatório premium em JSON seguindo a estrutura especificada.`;

  const llmResult = await invokeLLM({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.4,
  });

  const rawContent = llmResult.choices[0]?.message?.content ?? "";
  const report = await parseJsonWithRepair<PremiumReport>(rawContent);

  if (!report.clientName) report.clientName = clientName;
  if (!report.generatedAt) report.generatedAt = new Date().toISOString();

  if (!report.atsAnalysis || !report.atsAnalysis.breakdown || report.atsAnalysis.breakdown.length === 0) {
    report.atsAnalysis = {
      ...(report.atsAnalysis || { currentScore: 0, projectedScore: 0, whatWasWrong: [], whatWasFixed: [], strategicRationale: "" }),
      currentScore: report.atsAnalysis?.currentScore ?? resumeAnalysis.atsScore,
      projectedScore: report.atsAnalysis?.projectedScore ?? Math.min(92, resumeAnalysis.atsScore + 18),
      breakdown: atsBreakdown,
      whatWasWrong: report.atsAnalysis?.whatWasWrong ?? resumeAnalysis.weaknesses.slice(0, 5),
      whatWasFixed: report.atsAnalysis?.whatWasFixed ?? resumeAnalysis.improvedBullets.slice(0, 5).map(b => b.improved),
      strategicRationale: report.atsAnalysis?.strategicRationale ?? "",
    };
  }

  if (!report.strategicKeywords || !report.strategicKeywords.primary?.length) {
    report.strategicKeywords = {
      primary: missingKeywords.slice(0, 7),
      secondary: missingKeywords.slice(7, 17),
      rationale: report.strategicKeywords?.rationale ?? "Palavras-chave selecionadas com base em keyword match ATS e busca booleana de recrutadores no LinkedIn Recruiter.",
    };
  }

  return report;
}
