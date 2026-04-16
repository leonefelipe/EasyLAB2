import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";
import { calculateATSScore, atsResultToPromptContext } from "../core/atsEngine";

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const ImprovedBulletSchema = z.object({
  original: z.string(),
  improved: z.string(),
  reason: z.string(),
});

const AnalysisResultSchema = z.object({
  // Legacy fields (kept for frontend compatibility)
  matchScore: z.number(),
  projectedMatchScore: z.number(),
  jobTitle: z.string(),
  jobArea: z.string(),
  keywords: z.array(z.string()),
  suggestions: z.array(z.string()),
  optimizedResume: z.string(),
  changes: z.array(z.object({
    section: z.string(),
    description: z.string(),
    impact: z.enum(["alto", "medio", "baixo"]),
  })),
  coverLetterPoints: z.array(z.string()),
  gapAnalysis: z.array(z.string()),
  scoreBreakdown: z.object({
    technicalSkills: z.number(),
    experience: z.number(),
    keywords: z.number(),
    tools: z.number(),
    seniority: z.number(),
  }),

  // ── NEW: Elite ATS fields ──────────────────────────────────────────────────
  atsScore: z.number(),                      // 0-100 weighted ATS score
  atsScoreBreakdown: z.object({
    parsing: z.number(),                     // 0-20: ATS parsability
    keywordMatch: z.number(),                // 0-25: keyword density vs JD
    experienceQuality: z.number(),           // 0-20: quality of experience bullets
    impactMetrics: z.number(),               // 0-15: quantified achievements
    formatting: z.number(),                  // 0-10: ATS-safe formatting
    skillsAlignment: z.number(),             // 0-10: skills section vs JD
  }),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  missingKeywords: z.array(z.string()),
  improvedBullets: z.array(ImprovedBulletSchema),
  recruiterInsights: z.array(z.string()),
  seniorityLevel: z.string(),
  careerTrajectory: z.string(),
  formattingIssues: z.array(z.string()),

  // ── NEW: Competitive Intelligence ─────────────────────────────────────────
  competitiveEdges: z.array(z.string()),
  competitiveRisks: z.array(z.string()),

  // ── NEW: Salary Intelligence ───────────────────────────────────────────────
  salaryRange: z.object({
    cltMin: z.number(),
    cltMax: z.number(),
    pjMin: z.number(),
    pjMax: z.number(),
    currency: z.string(),
    confidence: z.enum(["high", "medium", "low"]),
    rationale: z.string(),
  }),
  negotiationTips: z.array(z.string()),

  // ── NEW: Recruiter Psychological Profile ──────────────────────────────────
  recruiterProfile: z.object({
    companyType: z.string(),
    cultureSignals: z.string(),
    recruiterFears: z.array(z.string()),
    recruiterTriggers: z.array(z.string()),
    idealNarrative: z.string(),
  }),
});

export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;
export type ImprovedBullet = z.infer<typeof ImprovedBulletSchema>;

// ─── Utilities ────────────────────────────────────────────────────────────────

async function scrapeJobUrl(url: string): Promise<string | null> {
  try {
    const urlObj = new URL(url);
    if (!urlObj.protocol.startsWith("http")) return null;

    // LinkedIn blocks server-side scraping — skip immediately
    if (urlObj.hostname.includes("linkedin.com")) return null;

    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
      },
      signal: AbortSignal.timeout(7000),
    });

    if (!response.ok) return null;

    const html = await response.text();
    const cleaned = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
      .replace(/<header[\s\S]*?<\/header>/gi, " ")
      .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s{2,}/g, " ")
      .trim();

    return cleaned.slice(0, 7000);
  } catch {
    return null;
  }
}

function isUrl(input: string): boolean {
  try {
    const u = new URL(input.trim());
    return u.protocol.startsWith("http");
  } catch {
    return false;
  }
}

/** Strip emojis, markdown formatting, and fix common unaccented uppercase words in Portuguese */
function sanitizeResume(text: string): string {
  const accentFixes: Array<[RegExp, string]> = [
    [/\bEXPERIENCIA\b/g, "EXPERIÊNCIA"],
    [/\bFORMACAO\b/g, "FORMAÇÃO"],
    [/\bCOMPETENCIAS\b/g, "COMPETÊNCIAS"],
    [/\bCERTIFICACOES\b/g, "CERTIFICAÇÕES"],
    [/\bCERTIFICACAO\b/g, "CERTIFICAÇÃO"],
    [/\bINFORMACOES\b/g, "INFORMAÇÕES"],
    [/\bINFORMACAO\b/g, "INFORMAÇÃO"],
    [/\bATUACAO\b/g, "ATUAÇÃO"],
    [/\bGESTAO\b/g, "GESTÃO"],
    [/\bADMINISTRACAO\b/g, "ADMINISTRAÇÃO"],
    [/\bCOMUNICACAO\b/g, "COMUNICAÇÃO"],
    [/\bNEGOCIACAO\b/g, "NEGOCIAÇÃO"],
    [/\bAVALIACAO\b/g, "AVALIAÇÃO"],
    [/\bCOORDENACAO\b/g, "COORDENAÇÃO"],
    [/\bIMPLEMENTACAO\b/g, "IMPLEMENTAÇÃO"],
    [/\bINTEGRACAO\b/g, "INTEGRAÇÃO"],
    [/\bPROSPECCAO\b/g, "PROSPECÇÃO"],
    [/\bPROSPECAO\b/g, "PROSPECÇÃO"],
    [/\bFUNCAO\b/g, "FUNÇÃO"],
    [/\bRELACOES\b/g, "RELAÇÕES"],
    [/\bRELACAO\b/g, "RELAÇÃO"],
    [/\bSOLUCOES\b/g, "SOLUÇÕES"],
    [/\bSOLUCAO\b/g, "SOLUÇÃO"],
    [/\bPOSICAO\b/g, "POSIÇÃO"],
    [/\bOPERACOES\b/g, "OPERAÇÕES"],
    [/\bOPERACAO\b/g, "OPERAÇÃO"],
    [/\bCAPACITACAO\b/g, "CAPACITAÇÃO"],
    [/\bCONTRATACAO\b/g, "CONTRATAÇÃO"],
    [/\bAPRESENTACAO\b/g, "APRESENTAÇÃO"],
    [/\bADAPTACAO\b/g, "ADAPTAÇÃO"],
    [/\bPRODUCAO\b/g, "PRODUÇÃO"],
    [/\bCONSTRUCAO\b/g, "CONSTRUÇÃO"],
    [/\bREDUCAO\b/g, "REDUÇÃO"],
    [/\bEXECUCAO\b/g, "EXECUÇÃO"],
    [/\bCONTRIBUICAO\b/g, "CONTRIBUIÇÃO"],
    [/\bINSTITUICAO\b/g, "INSTITUIÇÃO"],
    [/\bGERACAO\b/g, "GERAÇÃO"],
    [/\bCRIACAO\b/g, "CRIAÇÃO"],
    [/\bACOES\b/g, "AÇÕES"],
    [/\bACAO\b/g, "AÇÃO"],
    [/\bCONEXAO\b/g, "CONEXÃO"],
    [/\bAMPLIACAO\b/g, "AMPLIAÇÃO"],
    [/\bPARTICIPACAO\b/g, "PARTICIPAÇÃO"],
    [/\bSELECAO\b/g, "SELEÇÃO"],
    [/\bNEGOCIACOES\b/g, "NEGOCIAÇÕES"],
    [/\bEVOLUCAO\b/g, "EVOLUÇÃO"],
    [/\bREVISAO\b/g, "REVISÃO"],
    [/\bPROGRAMACAO\b/g, "PROGRAMAÇÃO"],
    [/\bDECISOES\b/g, "DECISÕES"],
    [/\bDECISAO\b/g, "DECISÃO"],
    [/\bCONVERSAO\b/g, "CONVERSÃO"],
    [/\bCOMERCIALIZACAO\b/g, "COMERCIALIZAÇÃO"],
    [/\bDIRECAO\b/g, "DIREÇÃO"],
    [/\bACADEMICA\b/g, "ACADÊMICA"],
    [/\bACADEMICO\b/g, "ACADÊMICO"],
    [/\bTECNICAS\b/g, "TÉCNICAS"],
    [/\bTECNICOS\b/g, "TÉCNICOS"],
    [/\bTECNICA\b/g, "TÉCNICA"],
    [/\bTECNICO\b/g, "TÉCNICO"],
    [/\bESTRATEGICA\b/g, "ESTRATÉGICA"],
    [/\bESTRATEGICO\b/g, "ESTRATÉGICO"],
    [/\bANALISES\b/g, "ANÁLISES"],
    [/\bANALISE\b/g, "ANÁLISE"],
    [/\bCURRICULO\b/g, "CURRÍCULO"],
    [/\bPERIODOS\b/g, "PERÍODOS"],
    [/\bPERIODO\b/g, "PERÍODO"],
    [/\bEDUCACAO\b/g, "EDUCAÇÃO"],
    [/\bNEGOCIOS\b/g, "NEGÓCIOS"],
    [/\bSERVICOS\b/g, "SERVIÇOS"],
    [/\bSERVICO\b/g, "SERVIÇO"],
    [/\bCOMERCIO\b/g, "COMÉRCIO"],
    [/\bLIDERANCA\b/g, "LIDERANÇA"],
    [/\bCOMPETENCIA\b/g, "COMPETÊNCIA"],
    [/\bEXCELENCIA\b/g, "EXCELÊNCIA"],
    [/\bCONFIGURACOES\b/g, "CONFIGURAÇÕES"],
    [/\bCONFIGURACAO\b/g, "CONFIGURAÇÃO"],
    [/\bCOMUNICACOES\b/g, "COMUNICAÇÕES"],
  ];

  let result = text
    .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, "")  // surrogate pairs (emojis)
    .replace(/[\u2600-\u27BF]/g, "")                   // misc symbols
    .replace(/[\uFE00-\uFE0F]/g, "")                   // variation selectors
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  for (const [pattern, replacement] of accentFixes) {
    result = result.replace(pattern, replacement);
  }

  return result;
}

// ─── JSON schema for OpenAI Structured Outputs ───────────────────────────────

const ANALYSIS_JSON_SCHEMA = {
  type: "object",
  properties: {
    matchScore: { type: "number" },
    projectedMatchScore: { type: "number" },
    jobTitle: { type: "string" },
    jobArea: { type: "string" },
    keywords: { type: "array", items: { type: "string" } },
    suggestions: { type: "array", items: { type: "string" } },
    optimizedResume: { type: "string" },
    changes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          section: { type: "string" },
          description: { type: "string" },
          impact: { type: "string", enum: ["alto", "medio", "baixo"] },
        },
        required: ["section", "description", "impact"],
        additionalProperties: false,
      },
    },
    coverLetterPoints: { type: "array", items: { type: "string" } },
    gapAnalysis: { type: "array", items: { type: "string" } },
    scoreBreakdown: {
      type: "object",
      properties: {
        technicalSkills: { type: "number" },
        experience: { type: "number" },
        keywords: { type: "number" },
        tools: { type: "number" },
        seniority: { type: "number" },
      },
      required: ["technicalSkills", "experience", "keywords", "tools", "seniority"],
      additionalProperties: false,
    },
    // Elite ATS fields
    atsScore: { type: "number" },
    atsScoreBreakdown: {
      type: "object",
      properties: {
        parsing: { type: "number" },
        keywordMatch: { type: "number" },
        experienceQuality: { type: "number" },
        impactMetrics: { type: "number" },
        formatting: { type: "number" },
        skillsAlignment: { type: "number" },
      },
      required: ["parsing", "keywordMatch", "experienceQuality", "impactMetrics", "formatting", "skillsAlignment"],
      additionalProperties: false,
    },
    strengths: { type: "array", items: { type: "string" } },
    weaknesses: { type: "array", items: { type: "string" } },
    missingKeywords: { type: "array", items: { type: "string" } },
    improvedBullets: {
      type: "array",
      items: {
        type: "object",
        properties: {
          original: { type: "string" },
          improved: { type: "string" },
          reason: { type: "string" },
        },
        required: ["original", "improved", "reason"],
        additionalProperties: false,
      },
    },
    recruiterInsights: { type: "array", items: { type: "string" } },
    seniorityLevel: { type: "string" },
    careerTrajectory: { type: "string" },
    formattingIssues: { type: "array", items: { type: "string" } },
    // Competitive Intelligence
    competitiveEdges: { type: "array", items: { type: "string" } },
    competitiveRisks: { type: "array", items: { type: "string" } },
    // Salary Intelligence
    salaryRange: {
      type: "object",
      properties: {
        cltMin: { type: "number" },
        cltMax: { type: "number" },
        pjMin: { type: "number" },
        pjMax: { type: "number" },
        currency: { type: "string" },
        confidence: { type: "string", enum: ["high", "medium", "low"] },
        rationale: { type: "string" },
      },
      required: ["cltMin", "cltMax", "pjMin", "pjMax", "currency", "confidence", "rationale"],
      additionalProperties: false,
    },
    negotiationTips: { type: "array", items: { type: "string" } },
    // Recruiter Psychological Profile
    recruiterProfile: {
      type: "object",
      properties: {
        companyType: { type: "string" },
        cultureSignals: { type: "string" },
        recruiterFears: { type: "array", items: { type: "string" } },
        recruiterTriggers: { type: "array", items: { type: "string" } },
        idealNarrative: { type: "string" },
      },
      required: ["companyType", "cultureSignals", "recruiterFears", "recruiterTriggers", "idealNarrative"],
      additionalProperties: false,
    },
  },
  required: [
    "matchScore", "projectedMatchScore", "jobTitle", "jobArea",
    "keywords", "suggestions", "optimizedResume", "changes",
    "coverLetterPoints", "gapAnalysis", "scoreBreakdown",
    "atsScore", "atsScoreBreakdown", "strengths", "weaknesses",
    "missingKeywords", "improvedBullets", "recruiterInsights",
    "seniorityLevel", "careerTrajectory", "formattingIssues",
    "competitiveEdges", "competitiveRisks",
    "salaryRange", "negotiationTips",
    "recruiterProfile",
  ],
  additionalProperties: false,
} as const;

// ─── Elite ATS System Prompt ──────────────────────────────────────────────────

const ELITE_ATS_SYSTEM_PROMPT = `You are an elite hybrid: part ATS algorithm, part executive recruiter, part CPRW-certified career strategist, part competitive intelligence analyst. Your credentials:

- CPRW (Certified Professional Resume Writer) — PARWCC
- ACRW — Career Directors International
- 25 years as Executive Headhunter: Google, McKinsey, Ambev, Itaú, Natura, Magazine Luiza
- Former Director of Talent Acquisition with deep access to ATS algorithms: Workday, Taleo, Greenhouse, iCIMS, SAP SuccessFactors, Gupy, Lever, TOTVS RH
- PhD in Computational Linguistics focused on NLP applied to resume screening
- Creator of the "Dual-Layer Resume Optimization" method — simultaneous ATS + human-eye optimization
- Lead compensation analyst with access to Glassdoor, LinkedIn Salary, Catho, and Robert Half salary surveys (Brazilian market)

You think in FOUR LAYERS simultaneously:
LAYER 1 — ATS ENGINE: You parse, rank, and score the resume exactly as Gupy, Taleo, Workday would.
LAYER 2 — HUMAN RECRUITER: You evaluate whether the resume makes a recruiter want to pick up the phone after a 6-second scan.
LAYER 3 — COMPETITIVE INTELLIGENCE: You analyze how this candidate stacks up against the other 50-300 candidates applying for this same role.
LAYER 4 — COMPENSATION STRATEGIST: You assess salary positioning and negotiation leverage based on the role and the candidate's profile.

When layers conflict, prioritize: ATS on structure/format → human on narrative/content → competitive on differentiation.

════════════════════════════════════════════════════════════
  HOW ATS SYSTEMS PROCESS RESUMES (2025 state-of-the-art)
════════════════════════════════════════════════════════════

PARSING STAGE — ATS converts file to plain text via OCR + NLP.
WHAT DESTROYS PARSING (eliminates candidate before human sees):
- Emojis and icons (✅ 🎯 📌 ★ ➢) — read as invalid characters
- Markdown formatting (**bold**, _italic_) — appear literally in extracted text
- Tables and multiple columns — parser mixes column data
- Floating text boxes — completely ignored by parser
- Word headers/footers — ignored by 73% of ATS systems
- Skill progress bars (●●●○○) — ATS cannot read graphics
- Creative section headings ("My Journey", "Where I've Been") — ATS doesn't recognize

RANKING STAGE — ATS keyword weight by position:
- Professional Summary: WEIGHT 3x
- Job Title (line 2): WEIGHT 2.5x
- Skills Section: WEIGHT 2x
- Current job title (first experience): WEIGHT 1.8x
- First 3 lines of each experience: WEIGHT 1.5x
- Rest of descriptions: WEIGHT 1x
- Education and Certifications: WEIGHT 0.5x

GUPY SPECIFIC (used by Ambev, Natura, Itaú, Magazine Luiza, 2,800+ companies):
- Uses semantic NLP beyond exact match — synonyms count but exact keywords score more
- Penalizes resumes over 2 pages for analyst/junior roles
- Values consistency between resume and LinkedIn profile
- Tenure at each role has internal ranking weight

THE 6-SECOND SCAN TEST — human screening:
Recruiters average 6.2 seconds on first scan.
Eyes fixate on: Name → Title → Company → Period → Education → Second Role.
The top third of the resume is the decision zone.

════════════════════════════════════════════════════════════
  THE 15 CAREER KILLERS — detect all that apply
════════════════════════════════════════════════════════════

1. ABSENT OR INEXACT KEYWORDS — ATS searches for literal tokens. "Team Leadership" and "People Management" are different terms.
2. GENERIC OR MISSING PROFESSIONAL SUMMARY — "Dedicated professional with extensive experience" fires no ATS filter.
3. WEAK VERBS — did, worked, helped, participated, assisted, was responsible for → eliminated.
4. ABSENCE OF METRICS — "Increased sales" is invisible. "Increased 34% in 6 months, $1.2M" is irresistible.
5. ATS-INCOMPATIBLE FORMAT — tables, columns, icons, emojis eliminate before a human sees it.
6. MISALIGNED JOB TITLE — CV title different from job title reduces ATS ranking.
7. TECHNICAL SKILLS BURIED — skills at the bottom receive minimum ATS weight.
8. TASK LANGUAGE INSTEAD OF IMPACT — describes WHAT was done, not IMPACT generated.
9. MISSING SYNONYMS — CRM ≠ Salesforce for classic ATS. Use both when candidate uses the tool.
10. UNEXPLAINED GAPS — employment gaps without any mention create suspicion.
11. EXCESS IRRELEVANT INFORMATION — 15+ year old experience with no relevance, generic hobbies, obsolete personal data.
12. SENIORITY MISMATCH — overqualified or underqualified without transition justification.
13. INCOHERENT CAREER NARRATIVE — level regression, frequent changes without visible thread.
14. HIDDEN STRENGTHS NOT HIGHLIGHTED — certification mentioned in passing that is the job's requirement.
15. COMPETITIVE POSITIONING IGNORED — resume doesn't stand out in pool of 50-300 candidates.

════════════════════════════════════════════════════════════
  STAR-METHOD BULLET POINT TRANSFORMATION
════════════════════════════════════════════════════════════

Transform weak task-oriented bullets into STAR-method impact bullets:
WEAK: "Responsible for managing a sales team"
STRONG: "Led 12-person B2B sales team, surpassing annual quota by 127% and generating R$4.8M in new ARR"

WEAK: "Worked with customer service"
STRONG: "Managed 200+ monthly enterprise accounts, achieving 96% CSAT score and reducing churn by 18%"

Rules for improved bullets:
1. Start with a strong action verb (Led, Built, Increased, Reduced, Delivered, Generated, Launched)
2. Include SCALE (how many people, accounts, projects, dollars)
3. Include RESULT (%, R$, time saved, rank achieved)
4. Include CONTEXT when relevant (industry, tools used)
5. Never invent numbers — only improve structure and verb strength when no metrics are available

════════════════════════════════════════════════════════════
  ELITE ATS SCORING SYSTEM (0-100)
════════════════════════════════════════════════════════════

atsScoreBreakdown fields and weights:

parsing (0-20): ATS parsability of the resume format
- 18-20: Pure text, standard headings, no formatting issues
- 12-17: Minor issues (one column, mostly clean)
- 6-11: Significant issues (some tables or non-standard elements)
- 0-5: Major issues (emojis, multiple columns, graphics)

keywordMatch (0-25): Keyword density vs. the job description
- 22-25: 80%+ of critical JD keywords present, well-distributed
- 15-21: 55-79% present
- 8-14: 30-54% present
- 0-7: Under 30%

experienceQuality (0-20): Quality of experience bullet points
- 17-20: All bullets are impact-focused with STAR method and metrics
- 11-16: Mix of impact and task bullets
- 5-10: Mostly task-oriented, few metrics
- 0-4: Pure task descriptions, no metrics

impactMetrics (0-15): Quantified achievements present
- 13-15: 5+ quantified metrics (%, R$, rankings, scale)
- 8-12: 2-4 quantified metrics
- 3-7: 1 metric
- 0-2: No quantified metrics

formatting (0-10): ATS-safe formatting
- 9-10: Perfect — single column, standard headings, plain text
- 6-8: Mostly clean with minor issues
- 3-5: Some problematic elements
- 0-2: Major formatting violations

skillsAlignment (0-10): Skills section alignment with JD requirements
- 9-10: Skills section includes exact JD tools and competencies
- 6-8: Most required skills present
- 3-5: Partial alignment
- 0-2: Little to no alignment

atsScore = DIRECT SUM of all six components (they are already scaled so maximums sum to 100):
atsScore = parsing + keywordMatch + experienceQuality + impactMetrics + formatting + skillsAlignment
(Max possible: 20+25+20+15+10+10 = 100 — DO NOT multiply by decimal weights)

LEGACY scoreBreakdown (0-100 total):
technicalSkills (0-30): Skills candidate HAS vs. what job REQUIRES
experience (0-30): RELEVANT experience for the role
keywords (0-20): JD keywords LITERALLY in the resume
tools (0-10): Specific tools/software requested vs. what candidate uses
seniority (0-10): Seniority level and years compatibility

CALIBRATION REFERENCE:
- Completely different area: 5-15%
- Same role, divergent keywords: 50-70%
- Same role, aligned keywords: 78-92%
- 100% is impossible (no perfect match exists)

════════════════════════════════════════════════════════════
  LAYER 3 — COMPETITIVE INTELLIGENCE
════════════════════════════════════════════════════════════

Analyze how this candidate compares to the TYPICAL applicant pool for this role.
For each role, recruiters see hundreds of resumes. Your job is to identify:

COMPETITIVE POOL PROFILE — what does the average applicant for this role look like?
- Typical education level for this position
- Typical years of experience in the pool
- Common skills/tools everyone has (table stakes — NOT differentiators)
- Common weaknesses in applicants for this role

CANDIDATE'S COMPETITIVE EDGES — what makes THIS candidate stand out vs. the pool?
- Specific quantified achievements others typically lack
- Cross-functional experience that is rare for this role
- Industry exposure that creates unique perspective
- Certifications or tools that are valued but uncommon in applicants

COMPETITIVE RISKS — where might this candidate LOSE to others?
- Skills gaps vs. top-tier applicants
- Missing experience that strong candidates will have
- Red flags that hurt competitive positioning

Output: competitiveEdges (array of 2-4 concrete differentiators) + competitiveRisks (array of 1-3 risks)

════════════════════════════════════════════════════════════
  LAYER 4 — SALARY INTELLIGENCE & NEGOTIATION POSITIONING
════════════════════════════════════════════════════════════

Based on the role, industry, location (Brasil), and candidate's seniority/experience, provide:

SALARY RANGE (Brazilian market, CLT and PJ where relevant):
- Estimate based on: role title, seniority, industry sector, company size signals in the JD
- Sources: Glassdoor BR, LinkedIn Salary Insights, Robert Half Salary Guide BR, Catho Salary Survey
- Be honest about uncertainty — give a realistic range, not aspirational figures
- Distinguish between CLT (with benefits) vs PJ (higher gross, no benefits)

NEGOTIATION LEVERAGE — what gives THIS candidate pricing power?
- Rare skills that increase market value
- Cross-industry experience that commands premium
- Quantified achievements that justify top-of-range positioning

NEGOTIATION RISKS — what may pressure compensation down?
- Employment gaps
- Frequent job changes
- Skills gaps vs. job requirements

Format: salaryRange object with { cltMin, cltMax, pjMin, pjMax, currency: "BRL", confidence: "high|medium|low", rationale: string }
negotiationTips: array of 2-3 specific, actionable salary negotiation tips for THIS candidate

════════════════════════════════════════════════════════════
  LAYER 5 — RECRUITER PSYCHOLOGICAL FINGERPRINT
════════════════════════════════════════════════════════════

Based on the JD language and company signals, profile the RECRUITER/HIRING MANAGER reading this resume:

COMPANY CULTURE SIGNALS from the JD:
- Startup/scale-up vs. corporate vs. traditional (affects tone and format expectations)
- Growth-oriented vs. stability-oriented culture
- Technical vs. relationship-oriented team

WHAT THIS RECRUITER SPECIFICALLY FEARS (pain points they're trying to solve):
- The problem they need this hire to solve
- Past bad hires they're trying to avoid
- Skills or traits that are dealbreakers for THIS role

WHAT THIS RECRUITER FINDS IRRESISTIBLE:
- The one achievement type that will make them call immediately
- The specific phrase or keyword that triggers a "yes" reaction
- The narrative arc they want the candidate to tell

Output: recruiterProfile object with { companyType, cultureSignals, recruiterFears, recruiterTriggers, idealNarrative }

════════════════════════════════════════════════════════════
  ABSOLUTE LAW — NEVER VIOLATE UNDER ANY CIRCUMSTANCE
════════════════════════════════════════════════════════════

ABSOLUTE PROHIBITIONS:
1. NEVER alter dates, periods, years, or months of any professional experience
2. NEVER alter names of companies where the candidate worked
3. NEVER alter job titles/positions the candidate held
4. NEVER invent skills, tools, certifications, or achievements not in the resume
5. NEVER "correct" the candidate's information — they know their own history
6. NEVER use emojis, icons, or special symbols in the optimized resume
7. NEVER use asterisks (**), underscores (__), or any markdown in resume text
8. NEVER use tables or multiple columns
9. NEVER overestimate the Match Score — strict honesty is non-negotiable
10. NEVER invent keywords not present in the real job description
11. NEVER omit experience or education present in the original

WHAT YOU CAN AND MUST DO:
- Rewrite bullets transforming task language into impact language
- Reorganize sections to maximize ATS weight
- Replace weak verbs with strong action verbs
- Surface hidden strengths already present in the resume
- Include synonyms for technical terms ALREADY present in the original
- Adjust professional title to mirror the job (only when there is real correspondence)

AUTO-VERIFICATION before returning:
□ All dates are IDENTICAL to the original?
□ All company names are IDENTICAL?
□ All job titles are IDENTICAL?
□ No skill was invented?
□ optimizedResume has ZERO emojis and ZERO markdown?
□ matchScore = exact sum of scoreBreakdown?
□ atsScore = direct sum of all six atsScoreBreakdown components?
□ Each improvedBullet.original actually exists (or closely resembles) a bullet in the resume?
□ Header line 3 has ALL contact info (city, phone, email, LinkedIn) on ONE SINGLE LINE pipe-separated?
□ optimizedResume is written in Brazilian Portuguese?
IF ANY ANSWER IS NO → FIX BEFORE RETURNING.

════════════════════════════════════════════════════════════
  OPTIMIZED RESUME FORMAT
════════════════════════════════════════════════════════════

Use \\n for single line breaks and \\n\\n to separate sections. PLAIN TEXT ONLY.
UPPERCASE words MUST have correct Portuguese accents: EXPERIÊNCIA, FORMAÇÃO, COMPETÊNCIAS, CERTIFICAÇÕES, GESTÃO, ATUAÇÃO, ANÁLISE, TÉCNICAS, LIDERANÇA.

LANGUAGE RULE (MANDATORY): The optimizedResume MUST be written in Brazilian Portuguese. Only internationally-adopted English terms (CRM, pipeline, SDR, BDR, B2B, SaaS, KPI, etc.) may remain in English. ALL section headers, bullet points, summary, and descriptions MUST be in Portuguese.

HEADER FORMAT (CRITICAL — ATS-SAFE):
Line 1: Full name only — nothing else on this line
Line 2: Professional title that mirrors the job title (short, no pipes, no extra info)
Line 3: City, State | Phone | Email | LinkedIn (ALL contact info on ONE SINGLE LINE, pipe-separated)
BLANK LINE
RESUMO PROFISSIONAL

WRONG HEADER (DO NOT DO THIS):
Felipe Leone
Headhunter & Recruiter | Talent Acquisition | B2B Sales
São Paulo, Brazil
+55 11 99446-5011
felipe_leone@yahoo.com.br
linkedin.com/in/felipe-leone

CORRECT HEADER (ALWAYS DO THIS):
Felipe Leone
SDR | Business Development Representative
São Paulo, SP | +55 11 99446-5011 | felipe_leone@yahoo.com.br | linkedin.com/in/felipe-leone

Mandatory structure:
[Full Name]
[Professional Title that mirrors the job — concise, no pipes]
[City, State] | [Phone] | [Email] | [LinkedIn URL]

RESUMO PROFISSIONAL
[3-5 line paragraph: area + seniority + critical JD keywords + real differentiator + most relevant achievement from original]

COMPETÊNCIAS PRINCIPAIS

[CATEGORIA EM MAIÚSCULAS COM ACENTOS]
- Competência com keyword da vaga
- Competência com sinônimo/variação

EXPERIÊNCIA PROFISSIONAL

[CARGO EXATO] | [EMPRESA EXATA] | [PERÍODO EXATO DO ORIGINAL]
- Verbo de ação forte + ação + escala + resultado quantificado
- Verbo de ação forte + keyword ATS + impacto

FORMAÇÃO ACADÊMICA
[Curso] | [Instituição] | [Ano EXATO do original]

IDIOMAS
[Idioma]: [Nível]

CERTIFICAÇÕES (se aplicável)
[Certificação] | [Instituição] | [Ano EXATO do original]

Respond ONLY with valid JSON, no markdown, no text outside JSON.`;

// ─── Adapt procedure platform rules ──────────────────────────────────────────

const PLATFORM_RULES: Record<string, string> = {
  gupy: `PLATFORM: GUPY (used by Ambev, Natura, Itaú, Magazine Luiza, 2,800+ companies)
- MAX SIZE: 2 pages for senior/manager, 1 page for junior/mid-level
- Gupy uses semantic NLP: include synonyms and variations of technical terms beyond exact terms
- Add cultural fit language naturally in Professional Summary: collaboration, impact, purpose, growth
- REMOVE: photo, date of birth, marital status, RG, CPF — Gupy captures these in the form
- Prioritize: keyword-dense Professional Summary at the top + Skills immediately after
- If CV is long, cut experiences older than 10 years with low relevance to the job
- Gupy values consistency: LinkedIn profile should mirror this CV`,

  linkedin: `PLATFORM: LINKEDIN (Easy Apply — Simplified Application)
- Recruiter will compare CV with LinkedIn profile — ensure consistency
- Skills Section: list EXACT terms that appear as skills on LinkedIn
- Summary can be slightly more conversational — LinkedIn allows more personal voice
- Highlight quantified achievements at the top of each experience
- Ideal size: 1-2 pages
- Most important job skills should appear at top of Skills section`,

  site_empresa: `PLATFORM: COMPANY WEBSITE (Classic ATS — Workday, Taleo, SAP SuccessFactors)
- EXACT KEYWORDS: these systems don't use semantic NLP — need literal term from the job
- MANDATORY: include both acronyms and expanded form: CRM (Customer Relationship Management), BI (Business Intelligence)
- Section headers 100% standard in UPPERCASE — no creative variation
- Zero formatting elements beyond hyphens (-) and parentheses ()
- JD keywords must appear at least 2x in the resume
- Size: 1-2 pages`,

  recrutador: `PLATFORM: RECRUITER REQUESTED THE CV (direct email or WhatsApp)
This CV will be read by a human, not an ATS. Optimize to impress:
- Professional Summary with personality and narrative — not just a keyword list
- Powerful opening line in Summary that captures attention immediately
- Metrics and achievements HIGHLIGHTED at the top of each experience — first bullet always with quantified result
- Coherent career narrative — the trajectory must tell a story of growth
- Can be up to 2 pages with rich and detailed content
- More assertive and confident tone in describing achievements`,
};

// ─── Router ───────────────────────────────────────────────────────────────────

export const resumeRouter = router({

  // ── analyze ────────────────────────────────────────────────────────────────
  analyze: publicProcedure
    .input(
      z.object({
        resumeText: z.string().min(50, "Currículo muito curto"),
        jobUrl: z.string().min(10, "Informe o link ou descrição da vaga"),
      })
    )
    .mutation(async ({ input }) => {
      const { resumeText, jobUrl } = input;

      let jobContent = jobUrl.trim();
      let scrapedSuccessfully = false;
      const isLinkedIn = isUrl(jobUrl.trim()) && new URL(jobUrl.trim()).hostname.includes("linkedin.com");

      // LinkedIn blocks all server-side scraping — fail fast with a clear user-facing error
      if (isLinkedIn) {
        throw new Error(
          "LinkedIn não permite leitura automática de vagas. Por favor, abra a vaga no LinkedIn, copie toda a descrição e cole aqui no lugar do link."
        );
      }

      if (isUrl(jobUrl.trim())) {
        const scraped = await scrapeJobUrl(jobUrl.trim());
        if (scraped && scraped.length > 200) {
          jobContent = scraped;
          scrapedSuccessfully = true;
        }
      }

      // ── Pre-compute ATS score for LLM calibration ────────────────────────────
      let atsAnchorContext = "";
      try {
        const atsResult = calculateATSScore({ cvText: resumeText, jobText: jobContent });
        atsAnchorContext = "\n\n" + atsResultToPromptContext(atsResult);
      } catch {
        // non-critical — proceed without anchor
      }

      const jobContext = scrapedSuccessfully
        ? "(content automatically extracted from the job site)"
        : isUrl(jobUrl.trim())
          ? "(URL provided — content could not be extracted; analyze based on URL signals and ask candidate to paste full description for best results)"
          : "(job description provided by candidate)";

      const userMessage = `CANDIDATE'S ORIGINAL RESUME (preserve ALL data exactly as-is — dates, companies, titles are sacred):
${resumeText}

---

JOB DESCRIPTION ${jobContext}:
${jobContent}

---

ANALYSIS INSTRUCTIONS:

Execute your FOUR-LAYER analysis (ATS + Human Recruiter + Competitive Intelligence + Salary/Negotiation).

1. Score the resume BEFORE optimization (matchScore = sum of scoreBreakdown components)
2. Calculate elite atsScore = DIRECT SUM of all six atsScoreBreakdown components
3. Identify ALL 15 Career Killers that apply to this specific resume
4. Generate the optimized resume maintaining IDENTICAL factual data (dates, companies, titles)
5. For improvedBullets: identify 3-5 weak bullets from the original and show STAR-method transformations
6. List missingKeywords: exact terms from JD not present in resume
7. projectedMatchScore MUST be >= matchScore (optimization can only improve, never worsen)
8. COMPETITIVE INTELLIGENCE: analyze this candidate vs. the typical applicant pool for this role
9. SALARY INTELLIGENCE: estimate realistic CLT and PJ ranges for Brazilian market based on role + seniority
10. RECRUITER PROFILE: decode what the hiring manager fears and what triggers an immediate call
11. Be rigorously honest — if compatibility is low, say so and explain the gap
12. All text in Brazilian Portuguese except internationally adopted English terms

Return ONLY valid JSON. No markdown, no text outside JSON.

JSON structure:
{
  "matchScore": <sum of scoreBreakdown — ORIGINAL score before optimization>,
  "projectedMatchScore": <realistic score AFTER optimization — always >= matchScore>,
  "jobTitle": "<exact job title from JD>",
  "jobArea": "<specific area in Portuguese: e.g. Desenvolvimento Backend Node.js, Vendas B2B SaaS, Gestão de Pessoas no Varejo>",
  "keywords": [<12-14 most critical JD keywords in order of importance>],
  "suggestions": [<5-8 specific, honest, actionable suggestions — format: [AÇÃO] — [POR QUE prejudica] — [COMO corrigir passo a passo]>],
  "optimizedResume": "<full optimized resume — PLAIN TEXT with \\n breaks — ZERO emojis/asterisks/markdown — dates/companies/titles IDENTICAL to original — in Brazilian Portuguese>",
  "changes": [
    {
      "section": "<exact section changed>",
      "description": "<what was wrong, what was fixed, why it impacts ATS AND recruiter — specific to THIS candidate>",
      "impact": "<alto | medio | baixo>"
    }
  ],
  "coverLetterPoints": [
    "<point 1: connects candidate's trajectory with this company/job's main pain point>",
    "<point 2: candidate's most relevant differentiator for this position>",
    "<point 3: achievement or result that most impresses for this context>"
  ],
  "gapAnalysis": [<honest list of real gaps between candidate profile and job — can be [] if high compatibility>],
  "scoreBreakdown": {
    "technicalSkills": <0-30>,
    "experience": <0-30>,
    "keywords": <0-20>,
    "tools": <0-10>,
    "seniority": <0-10>
  },
  "atsScore": <DIRECT SUM of the six atsScoreBreakdown components>,
  "atsScoreBreakdown": {
    "parsing": <0-20>,
    "keywordMatch": <0-25>,
    "experienceQuality": <0-20>,
    "impactMetrics": <0-15>,
    "formatting": <0-10>,
    "skillsAlignment": <0-10>
  },
  "strengths": [<3-5 specific strengths of this resume for this job>],
  "weaknesses": [<3-5 specific weaknesses to address>],
  "missingKeywords": [<exact keywords from JD not found in resume>],
  "improvedBullets": [
    {
      "original": "<exact weak bullet from the resume>",
      "improved": "<STAR-method rewrite with action verb + scale + result — in Portuguese>",
      "reason": "<why this bullet was weak and what makes the improved version stronger>"
    }
  ],
  "recruiterInsights": [<3-5 insights a senior recruiter would note about this candidate for this specific role>],
  "seniorityLevel": "<Júnior | Pleno | Sênior | Gerente | Diretor | C-Level>",
  "careerTrajectory": "<2-3 sentence narrative of candidate's career progression and positioning — in Portuguese>",
  "formattingIssues": [<list of specific ATS-hostile formatting elements detected — empty [] if none>],

  "competitiveEdges": [
    "<2-4 concrete differentiators vs. the typical applicant pool — specific to THIS candidate and THIS role>",
    "<e.g.: 'Combinação de 18 anos em vendas B2B + recrutamento é rara no pool de candidatos para Talent Acquisition — a maioria vem só de RH'>"
  ],
  "competitiveRisks": [
    "<1-3 risks where other candidates may have an edge — honest and specific>",
    "<e.g.: 'Candidatos mais jovens podem ter certificações ATS mais recentes (Gupy Certification, SAP SuccessFactors)'>"
  ],

  "salaryRange": {
    "cltMin": <realistic CLT minimum in BRL — integer, no decimals>,
    "cltMax": <realistic CLT maximum in BRL — integer, no decimals>,
    "pjMin": <realistic PJ minimum in BRL — integer, no decimals, gross>,
    "pjMax": <realistic PJ maximum in BRL — integer, no decimals, gross>,
    "currency": "BRL",
    "confidence": "<high | medium | low — based on how much salary data is inferable from the JD>",
    "rationale": "<2-3 sentences explaining the range: what drives value up, what presses it down, market context>"
  },
  "negotiationTips": [
    "<2-3 specific, actionable salary negotiation tips tailored to THIS candidate's strengths and gaps>"
  ],

  "recruiterProfile": {
    "companyType": "<startup | scale-up | corporativo | tradicional | consultoria | agência>",
    "cultureSignals": "<2-3 sentences: what the JD language reveals about the culture and what they value>",
    "recruiterFears": [
      "<2-3 specific fears this recruiter has based on the JD — what bad hires or problems are they trying to avoid?>"
    ],
    "recruiterTriggers": [
      "<2-3 specific triggers that will make THIS recruiter immediately excited — based on JD signals>"
    ],
    "idealNarrative": "<The one-paragraph story this recruiter wants the candidate to tell — what arc, what proof points, what tone>"
  }
}`;

      // Inject pre-computed anchor into userMessage
      const fullUserMessage = userMessage + atsAnchorContext;

      const response = await invokeLLM({
        messages: [
          { role: "system", content: ELITE_ATS_SYSTEM_PROMPT },
          { role: "user", content: fullUserMessage },
        ],
        maxTokens: 6000,
        temperature: 0.1,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "elite_resume_analysis",
            strict: true,
            schema: ANALYSIS_JSON_SCHEMA,
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
        // Attempt to extract JSON if wrapped in markdown fences
        const jsonMatch = content.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
        if (jsonMatch) {
          try {
            parsed = JSON.parse(jsonMatch[1]);
          } catch {
            throw new Error("Erro ao processar resposta da IA. Tente novamente.");
          }
        } else {
          throw new Error("Erro ao processar resposta da IA. Tente novamente.");
        }
      }

      const validated = AnalysisResultSchema.parse(parsed);

      // Enforce score integrity
      const computedScore =
        validated.scoreBreakdown.technicalSkills +
        validated.scoreBreakdown.experience +
        validated.scoreBreakdown.keywords +
        validated.scoreBreakdown.tools +
        validated.scoreBreakdown.seniority;

      const finalMatchScore = Math.min(100, Math.max(0, computedScore));

      let finalProjectedScore = Math.min(100, Math.max(0, validated.projectedMatchScore));
      if (finalProjectedScore < finalMatchScore) {
        const minGain = Math.min(5, 100 - finalMatchScore);
        finalProjectedScore = Math.min(100, finalMatchScore + minGain);
      }

      // Enforce atsScore integrity
      // Components are designed to sum to 100 (max: 20+25+20+15+10+10=100) — direct sum
      const sb = validated.atsScoreBreakdown;
      const computedAts = Math.round(
        sb.parsing +
        sb.keywordMatch +
        sb.experienceQuality +
        sb.impactMetrics +
        sb.formatting +
        sb.skillsAlignment
      );
      const finalAtsScore = Math.min(100, Math.max(0, computedAts));

      return {
        ...validated,
        optimizedResume: sanitizeResume(validated.optimizedResume),
        matchScore: finalMatchScore,
        projectedMatchScore: finalProjectedScore,
        atsScore: finalAtsScore,
        scrapedJob: scrapedSuccessfully,
      };
    }),

  // ── adapt ──────────────────────────────────────────────────────────────────
  adapt: publicProcedure
    .input(
      z.object({
        optimizedResume: z.string().min(50, "Currículo muito curto"),
        keywords: z.array(z.string()),
        jobTitle: z.string(),
        platform: z.enum(["gupy", "linkedin", "site_empresa", "recrutador"]),
      })
    )
    .mutation(async ({ input }) => {
      const { optimizedResume, keywords, jobTitle, platform } = input;

      const adaptSystemPrompt = `You are a senior expert in resume adaptation for different application platforms and contexts in the Brazilian job market.

ABSOLUTE RULES — NEVER VIOLATE:
1. NEVER alter dates, periods, years or months of any experience
2. NEVER alter names of companies where the candidate worked
3. NEVER alter job titles/positions the candidate held
4. NEVER invent skills, tools, certifications or achievements
5. NEVER use emojis, asterisks (**), underscores (__) or any markdown
6. NEVER use tables or multiple columns

AUTO-VERIFICATION before returning:
□ All dates IDENTICAL to the received resume?
□ All company names IDENTICAL?
□ Zero emojis and zero markdown in adaptedResume?
IF ANY ANSWER IS NO → fix before returning.

Return ONLY valid JSON, no text outside JSON.`;

      const userMessage = `BASE RESUME (already optimized — adapt for the platform):
${optimizedResume}

JOB TITLE: ${jobTitle}
IDENTIFIED KEYWORDS: ${keywords.join(", ")}

${PLATFORM_RULES[platform]}

Adapt the resume following EXACTLY the platform rules above.
Keep all factual data identical to the original.

Return JSON:
{
  "adaptedResume": "<adapted resume in plain text with \\n for breaks — ZERO emojis, asterisks or markdown>",
  "platformTips": [
    "<practical tip specific to applying on this platform>",
    "<tip 2>",
    "<tip 3>"
  ],
  "whatChanged": "<2-3 line summary of what was adapted and why for this platform>"
}`;

      const AdaptResultSchema = z.object({
        adaptedResume: z.string(),
        platformTips: z.array(z.string()),
        whatChanged: z.string(),
      });

      const response = await invokeLLM({
        messages: [
          { role: "system", content: adaptSystemPrompt },
          { role: "user", content: userMessage },
        ],
        maxTokens: 4096,
        temperature: 0.1,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "adapt_result",
            strict: true,
            schema: {
              type: "object",
              properties: {
                adaptedResume: { type: "string" },
                platformTips: { type: "array", items: { type: "string" } },
                whatChanged: { type: "string" },
              },
              required: ["adaptedResume", "platformTips", "whatChanged"],
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
        const jsonMatch = content.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[1]);
        } else {
          throw new Error("Erro ao processar resposta da IA. Tente novamente.");
        }
      }

      const validated = AdaptResultSchema.parse(parsed);

      const sanitize = (text: string): string =>
        text
          .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, "")
          .replace(/[\u2600-\u27BF]/g, "")
          .replace(/\*\*([^*]+)\*\*/g, "$1")
          .replace(/\*([^*]+)\*/g, "$1")
          .replace(/__([^_]+)__/g, "$1")
          .replace(/^#{1,6}\s+/gm, "")
          .replace(/`([^`]+)`/g, "$1")
          .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
          .replace(/\n{3,}/g, "\n\n")
          .trim();

      return {
        adaptedResume: sanitize(validated.adaptedResume),
        platformTips: validated.platformTips,
        whatChanged: validated.whatChanged,
      };
    }),

  // ── generateFromScratch ────────────────────────────────────────────────────
  generateFromScratch: publicProcedure
    .input(
      z.object({
        wizardData: z.object({
          name: z.string(),
          title: z.string(),
          city: z.string(),
          phone: z.string(),
          email: z.string(),
          linkedin: z.string(),
          summary: z.string(),
          experiences: z.array(z.object({
            role: z.string(),
            company: z.string(),
            period: z.string(),
            description: z.string(),
          })),
          education: z.array(z.object({
            course: z.string(),
            institution: z.string(),
            year: z.string(),
          })),
          skills: z.string(),
          languages: z.string(),
          certifications: z.string(),
        }),
      })
    )
    .mutation(async ({ input }) => {
      const d = input.wizardData;

      const systemPrompt = `You are a senior certified career consultant (CPRW) and professional resume writer specialized in Brazilian job market.

Your task: create a complete, ATS-optimized professional resume using ONLY the information provided.

ABSOLUTE RULES:
1. Use ONLY the information provided. NEVER invent data, dates, companies, or skills.
2. Transform informal descriptions into professional impact bullets with strong action verbs.
3. The resume MUST be PLAIN TEXT with real line breaks (\\n).
4. PROHIBITED: emojis, asterisks, markdown, hashtags, tables.
5. Structure: Name > Title > Contact > Professional Summary > Core Competencies > Experience > Education > Languages > Certifications.
6. Use action verbs in Portuguese: Liderou, Implementou, Desenvolveu, Aumentou, Gerenciou, Negociou, Conquistou, Entregou, Estruturou.
7. Quantify results when the user mentions numbers.
8. Section headers in UPPERCASE with correct Portuguese accents: EXPERIÊNCIA PROFISSIONAL, FORMAÇÃO ACADÊMICA, COMPETÊNCIAS PRINCIPAIS, CERTIFICAÇÕES, IDIOMAS.
9. Return ONLY the resume text, no JSON, no additional explanations.`;

      const expLines = d.experiences
        .filter(e => e.role)
        .map(e => `${e.role} | ${e.company} | ${e.period}\n${e.description}`)
        .join("\n\n");

      const eduLines = d.education
        .filter(e => e.course)
        .map(e => `${e.course} - ${e.institution}${e.year ? ` (${e.year})` : ""}`)
        .join("\n");

      const userMessage = `Create a professional resume with these details:

NAME: ${d.name}
TITLE: ${d.title}
CITY: ${d.city}
PHONE: ${d.phone}
EMAIL: ${d.email}
LINKEDIN: ${d.linkedin}

SUMMARY (informal): ${d.summary}

EXPERIENCES:
${expLines}

EDUCATION:
${eduLines}

SKILLS: ${d.skills}
LANGUAGES: ${d.languages}
CERTIFICATIONS: ${d.certifications}`;

      const response = await invokeLLM({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        maxTokens: 3000,
        temperature: 0.2,
      });

      const rawContent = response.choices[0]?.message?.content;
      if (!rawContent) throw new Error("Resposta vazia da IA. Tente novamente.");
      const content = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);

      return { generatedResume: sanitizeResume(content) };
    }),
});
