import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";

const TranslationResultSchema = z.object({
  translatedResume: z.string(),
});

export const translateRouter = router({
  toEnglish: publicProcedure
    .input(
      z.object({
        resumeText: z.string().min(50, "Currículo muito curto"),
        jobContext: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { resumeText, jobContext } = input;

      const systemPrompt = `You are a Senior Certified Professional Resume Writer (CPRW) and bilingual career consultant specializing in international job applications for Brazilian professionals seeking positions in the USA, Canada, UK, and other English-speaking markets.

== ABSOLUTE RULES — NEVER VIOLATE ==

1. NEVER alter dates, periods, years, or months of any professional experience
2. NEVER alter names of companies where the candidate worked
3. NEVER alter job titles/positions the candidate held
4. NEVER invent skills, tools, certifications, or achievements not in the original resume
5. NEVER use emojis, asterisks (**), underscores (__), or any markdown formatting
6. NEVER use tables or multiple columns
7. NEVER superestimate — translate only what exists, do not embellish
8. Before returning, self-check: "Are all dates identical to the original? Are all company names identical? Was any skill invented?" — if any answer is NO, correct before returning.

== TRANSLATION RULES (US/CANADA STANDARDS) ==

SECTION HEADERS — translate exactly as follows:
- RESUMO PROFISSIONAL → PROFESSIONAL SUMMARY
- COMPETÊNCIAS PRINCIPAIS / COMPETENCIAS PRINCIPAIS → CORE COMPETENCIES
- EXPERIÊNCIA PROFISSIONAL / EXPERIENCIA PROFISSIONAL → PROFESSIONAL EXPERIENCE
- FORMAÇÃO ACADÊMICA / FORMACAO ACADEMICA → EDUCATION
- IDIOMAS → LANGUAGES
- CERTIFICAÇÕES / CERTIFICACOES → CERTIFICATIONS
- CURSOS → ADDITIONAL TRAINING
- INFORMAÇÕES ADICIONAIS → ADDITIONAL INFORMATION
- HABILIDADES → SKILLS
- VOLUNTARIADO → VOLUNTEER EXPERIENCE

DATE FORMAT — convert to American standard:
- Jan/2022 → Jan 2022
- Out/2023 → Oct 2023
- Mar/2021 – Set/2023 → Mar 2021 – Sep 2023
- Atual / Presente → Present
- Month abbreviations in Portuguese → English (Jan=Jan, Fev=Feb, Mar=Mar, Abr=Apr, Mai=May, Jun=Jun, Jul=Jul, Ago=Aug, Set=Sep, Out=Oct, Nov=Nov, Dez=Dec)

CONTENT RULES:
- Translate all text to professional American English
- Do NOT translate proper nouns: tool names (Salesforce, HubSpot, LinkedIn, Python, etc.), company names, city names
- Remove any mention of: photo, marital status, date of birth, CPF, RG, nationality — these are illegal in US/Canada hiring
- Keep LinkedIn URL as-is
- Convert Brazilian phone format (+55 11 99446-5011) to international format: +55 11 99446-5011 (keep as-is, it's already international)
- Use strong action verbs: Led, Implemented, Developed, Increased, Reduced, Generated, Managed, Achieved, Delivered, Drove, Scaled, Optimized
- Maintain the same structure and sections as the original
- Use American English spelling (not British): "analyze" not "analyse", "optimize" not "optimise"

FORMAT RULES:
- Plain text only — no markdown, no emojis, no symbols
- Use \\n for line breaks, \\n\\n to separate sections
- Bullets with dash: - Achievement text
- Section headers in ALL CAPS

Return ONLY valid JSON, no markdown, no text outside JSON.`;

      const userMessage = `ORIGINAL RESUME IN PORTUGUESE (preserve all data exactly — only translate and adapt):
${resumeText}

${jobContext ? `JOB CONTEXT (use to tailor keyword choices in the translation):\n${jobContext}` : ""}

Translate this resume to professional American English following all rules above.
Return JSON:
{
  "translatedResume": "<full translated resume — plain text only with \\n line breaks — NO emojis, NO asterisks, NO markdown — all dates, companies and job titles preserved exactly (only dates converted to American format)>"
}`;

      const response = await invokeLLM({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "translation_result",
            strict: true,
            schema: {
              type: "object",
              properties: {
                translatedResume: { type: "string" },
              },
              required: ["translatedResume"],
              additionalProperties: false,
            },
          },
        },
      });

      const rawContent = response.choices[0]?.message?.content;
      if (!rawContent) throw new Error("Empty response from AI. Please try again.");
      const content = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);

      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        throw new Error("Error processing AI response. Please try again.");
      }

      const validated = TranslationResultSchema.parse(parsed);

      // Sanitize: remove any residual emojis and markdown
      const sanitize = (text: string): string => {
        return text
          .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, "")
          .replace(/[\u2600-\u27BF]/g, "")
          .replace(/[\uFE00-\uFE0F]/g, "")
          .replace(/\*\*([^*]+)\*\*/g, "$1")
          .replace(/\*([^*]+)\*/g, "$1")
          .replace(/__([^_]+)__/g, "$1")
          .replace(/^#{1,6}\s+/gm, "")
          .replace(/`([^`]+)`/g, "$1")
          .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
          .replace(/\n{3,}/g, "\n\n")
          .trim();
      };

      return {
        translatedResume: sanitize(validated.translatedResume),
      };
    }),
});
