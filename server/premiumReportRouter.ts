import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";
import { generatePremiumReport } from "./services/premiumReport";
import { invokeLLM, parseJsonWithRepair } from "./_core/llm";
import type { AnalysisResult } from "./resumeRouter";
import type { LinkedInAnalysis } from "./linkedInRouter";
import { calculateATSScore, atsResultToPromptContext } from "../core/atsEngine";

export const premiumReportRouter = router({
  generate: publicProcedure
    .input(
      z.object({
        clientName: z.string().min(1, "Nome do cliente é obrigatório"),
        resumeText: z.string().min(50, "Cole o CV completo"),
        linkedinText: z.string().min(50, "Cole o conteúdo do LinkedIn"),
        targetRole: z.string().optional().default(""),
      })
    )
    .mutation(async ({ input }) => {
      const { clientName, resumeText, linkedinText, targetRole } = input;

      let atsAnchorContext = "";
      try {
        const atsResult = calculateATSScore({ cvText: resumeText, jobText: resumeText });
        atsAnchorContext = "\n\n" + atsResultToPromptContext(atsResult);
      } catch {
        // non-critical
      }

      const resumeSystemPrompt = `Você é um analista sênior de CVs ATS-first.
Analise o CV fornecido e retorne APENAS JSON no esquema especificado, sem preâmbulo.${atsAnchorContext}

Esquema de retorno obrigatório:
{
  "atsScore": number (0-100),
  "atsScoreBreakdown": { "parsing": number, "keywordMatch": number, "experienceQuality": number, "impactMetrics": number, "formatting": number, "skillsAlignment": number },
  "strengths": string[],
  "weaknesses": string[],
  "missingKeywords": string[],
  "improvedBullets": [{ "original": string, "improved": string, "category": string }],
  "recruiterInsights": string[],
  "seniorityLevel": string,
  "careerTrajectory": string,
  "formattingIssues": string[],
  "competitiveEdges": string[],
  "competitiveRisks": string[],
  "salaryRange": { "cltMin": number, "cltMax": number, "pjMin": number, "pjMax": number, "currency": "BRL", "confidence": "high"|"medium"|"low", "rationale": string },
  "negotiationTips": string[],
  "linkedinOptimization": { "headline": string, "about": string, "featuredSection": string, "skillsToAdd": string[], "profileTips": string[] },
  "recruiterProfile": { "companyType": string, "cultureSignals": string, "recruiterFears": string[], "recruiterTriggers": string[], "idealNarrative": string },
  "valueProposition": { "score": number, "currentStatement": string, "improvedStatement": string, "isInTopThird": boolean, "gaps": string[] },
  "jobhunterStrategy": { "primaryPlatforms": string[], "searchTerms": string[], "companyTargets": string[], "approachTips": string[], "urgencyLevel": "alta"|"média"|"baixa" }
}

CALIBRAÇÃO: Sem JD específica, atsScore máximo = 68. CV sem métricas: max 58. Gere improvedBullets (mínimo 3) e missingKeywords realistas.`;

      const resumeUserPrompt = `CLIENTE: ${clientName}${targetRole ? `\nCARGO ALVO: ${targetRole}` : ""}

CURRÍCULO:
${resumeText}

Retorne JSON da análise.`;

      const resumeLLM = await invokeLLM({
        messages: [
          { role: "system", content: resumeSystemPrompt },
          { role: "user", content: resumeUserPrompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
      });
      const resumeRaw = resumeLLM.choices[0]?.message?.content ?? "";
      const resumeAnalysis = await parseJsonWithRepair<AnalysisResult>(resumeRaw);

      const linkedinSystemPrompt = `Você é um especialista sênior em LinkedIn.
Analise o perfil fornecido e retorne APENAS JSON, sem preâmbulo.

Esquema obrigatório:
{
  "profileStrength": number (0-100),
  "ssiEstimate": number (0-100),
  "profileTitle": string,
  "profileArea": string,
  "headline": { "current": string, "optimized": string, "score": number },
  "about": { "score": number, "feedback": string, "optimized": string },
  "topStrengths": string[],
  "missingKeywords": string[],
  "recruiterVisibilityScore": number (0-100),
  "recruiterVisibilityTips": string[],
  "quickWins": string[],
  "improvements": [{ "section": string, "currentState": string, "suggestion": string, "impact": "alto"|"medio"|"baixo", "exampleText": string }]
}

Regras: headline 120-220 chars | about 1500-2600 chars | 4-8 quickWins | 6-12 missingKeywords.`;

      const linkedinUserPrompt = `CLIENTE: ${clientName}${targetRole ? `\nCARGO ALVO: ${targetRole}` : ""}

PERFIL LINKEDIN:
${linkedinText}

Retorne JSON da análise.`;

      const linkedinLLM = await invokeLLM({
        messages: [
          { role: "system", content: linkedinSystemPrompt },
          { role: "user", content: linkedinUserPrompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
      });
      const linkedinRaw = linkedinLLM.choices[0]?.message?.content ?? "";
      const linkedinAnalysis = await parseJsonWithRepair<LinkedInAnalysis>(linkedinRaw);

      const report = await generatePremiumReport({
        clientName,
        resumeAnalysis,
        linkedinAnalysis,
        originalCV: resumeText,
        originalLinkedIn: linkedinText,
      });

      return { report, resumeAnalysis, linkedinAnalysis };
    }),
});
