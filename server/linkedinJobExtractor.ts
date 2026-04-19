/**
 * linkedinJobExtractor.ts
 *
 * 5-layer LinkedIn job extraction pipeline.
 * Reality: LinkedIn blocks most server-side requests. This module tries every
 * available technique in order of reliability, falling back gracefully.
 *
 * Layer 1: JSON-LD structured data (most reliable when present)
 * Layer 2: OpenGraph meta tags
 * Layer 3: Rendered HTML content extraction (className/data-attr patterns)
 * Layer 4: LinkedIn public jobs API (no-auth endpoint, sometimes works)
 * Layer 5: Instruct user to paste text — LLM parser receives pasted content
 */

import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExtractedJob {
  title: string;
  company: string;
  location: string;
  employmentType: string;
  seniority: string;
  description: string;
  requirements: string[];
  skills: string[];
  benefits: string[];
  rawText: string;
  extractionMethod: "json_ld" | "opengraph" | "html_parse" | "api" | "llm_parse" | "manual_paste";
  scrapedSuccessfully: boolean;
  jobId?: string;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
  "Accept-Encoding": "gzip, deflate, br",
  "Cache-Control": "no-cache",
  Referer: "https://www.google.com/",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
};

function extractJobId(url: string): string | null {
  const m = url.match(/\/jobs\/view\/(\d+)/);
  return m?.[1] ?? null;
}

function normalizeUrl(url: string): string {
  const jobId = extractJobId(url);
  return jobId ? `https://www.linkedin.com/jobs/view/${jobId}/` : url.trim();
}

// ─── Layer 1: JSON-LD extraction ──────────────────────────────────────────────

function tryJsonLd(html: string): Partial<ExtractedJob> | null {
  const pattern = /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      const nodes = Array.isArray(data["@graph"]) ? data["@graph"] : [data];
      for (const node of nodes) {
        if (node["@type"] === "JobPosting" || node.description) {
          const desc = node.description
            ? stripHtml(String(node.description)).slice(0, 8000)
            : "";
          if (desc.length < 50) continue;
          return {
            title: node.title || node.name || "",
            company: node.hiringOrganization?.name || node.employerOverview || "",
            location:
              node.jobLocation?.address?.addressLocality ||
              node.jobLocation?.address?.addressRegion ||
              (typeof node.jobLocation === "string" ? node.jobLocation : "") || "",
            employmentType: node.employmentType || "",
            description: desc,
            extractionMethod: "json_ld",
            scrapedSuccessfully: true,
          };
        }
      }
    } catch { /* continue */ }
  }
  return null;
}

// ─── Layer 2: OpenGraph meta tags ─────────────────────────────────────────────

function tryOpenGraph(html: string): Partial<ExtractedJob> | null {
  const getMeta = (prop: string): string => {
    const m = html.match(new RegExp(
      `<meta[^>]+(?:property|name)="${prop}"[^>]+content="([^"]+)"`, "i"
    )) || html.match(new RegExp(
      `<meta[^>]+content="([^"]+)"[^>]+(?:property|name)="${prop}"`, "i"
    ));
    return m?.[1] ? stripHtml(m[1]) : "";
  };

  const title = getMeta("og:title") || getMeta("twitter:title");
  const desc  = getMeta("og:description") || getMeta("twitter:description");
  if (!title && !desc) return null;

  return {
    title,
    description: desc,
    extractionMethod: "opengraph",
    scrapedSuccessfully: (title.length + desc.length) > 30,
  };
}

// ─── Layer 3: HTML content extraction ────────────────────────────────────────

function tryHtmlParse(html: string): Partial<ExtractedJob> | null {
  const extractFirst = (patterns: RegExp[]): string => {
    for (const p of patterns) {
      const m = html.match(p);
      if (m?.[1]) return stripHtml(m[1]).slice(0, 500);
    }
    return "";
  };

  const title = extractFirst([
    /<h1[^>]*class="[^"]*top-card-layout__title[^"]*"[^>]*>([\s\S]+?)<\/h1>/i,
    /<h1[^>]*>([\s\S]{5,200}?)<\/h1>/i,
  ]);

  const company = extractFirst([
    /class="[^"]*topcard__org-name-link[^"]*"[^>]*>([\s\S]+?)<\/a>/i,
    /class="[^"]*top-card-layout__first-subline[^"]*"[^>]*>([\s\S]+?)<\//i,
  ]);

  const location = extractFirst([
    /class="[^"]*topcard__flavor--bullet[^"]*"[^>]*>([\s\S]+?)<\/span>/i,
    /class="[^"]*top-card-layout__second-subline[^"]*"[^>]*>([\s\S]+?)<\//i,
  ]);

  // Job description
  let description = "";
  const descPatterns = [
    /<div[^>]*class="[^"]*show-more-less-html__markup[^"]*"[^>]*>([\s\S]+?)<\/div>/i,
    /<section[^>]*class="[^"]*description[^"]*"[^>]*>([\s\S]+?)<\/section>/i,
    /<div[^>]*id="job-details"[^>]*>([\s\S]+?)<\/div>/i,
    /<div[^>]*class="[^"]*jobs-description[^"]*"[^>]*>([\s\S]+?)<\/div>/i,
  ];
  for (const p of descPatterns) {
    const m = html.match(p);
    if (m?.[1]) {
      const text = stripHtml(m[1]);
      if (text.length > 100) { description = text.slice(0, 8000); break; }
    }
  }

  // Employment type
  const empType = extractFirst([
    /class="[^"]*job-criteria__text[^"]*"[^>]*>\s*(Full-time|Part-time|Contract|Temporary|Internship|Freelance|CLT|PJ)[^<]*/i,
    /<span[^>]*>\s*(Full-time|Part-time|Contract|CLT|PJ)\s*<\/span>/i,
  ]);

  if (!title && !description) return null;

  return {
    title,
    company,
    location,
    employmentType: empType,
    description,
    extractionMethod: "html_parse",
    scrapedSuccessfully: description.length > 100,
  };
}

// ─── Layer 4: LinkedIn unofficial job API ────────────────────────────────────
// The /jobs-guest/jobs/api/jobPosting/{id} endpoint returns JSON without auth
// on some LinkedIn CDN configurations. Hit-rate ~30%.

async function tryLinkedInApi(jobId: string): Promise<Partial<ExtractedJob> | null> {
  try {
    const apiUrl = `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${jobId}`;
    const res = await fetch(apiUrl, {
      headers: { ...BROWSER_HEADERS, Accept: "application/json, text/html" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;

    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("json")) {
      const data = await res.json() as Record<string, unknown>;
      const desc = data.description ? stripHtml(String(data.description)).slice(0, 8000) : "";
      if (desc.length < 50) return null;
      return {
        title:          String(data.title ?? ""),
        company:        String((data.companyDetails as Record<string, unknown>)?.name ?? data.company ?? ""),
        location:       String(data.location ?? ""),
        employmentType: String(data.employmentStatus ?? data.employmentType ?? ""),
        description:    desc,
        extractionMethod: "api",
        scrapedSuccessfully: true,
      };
    }

    // Sometimes returns HTML — fall through to HTML parse
    const html = await res.text();
    return tryHtmlParse(html);
  } catch {
    return null;
  }
}

// ─── Layer 5: LLM parsing of pasted text ─────────────────────────────────────

const LLM_PARSE_SCHEMA = {
  type: "object",
  properties: {
    title:          { type: "string" },
    company:        { type: "string" },
    location:       { type: "string" },
    employmentType: { type: "string" },
    seniority:      { type: "string" },
    description:    { type: "string" },
    requirements:   { type: "array", items: { type: "string" } },
    skills:         { type: "array", items: { type: "string" } },
    benefits:       { type: "array", items: { type: "string" } },
  },
  required: ["title", "company", "location", "employmentType", "seniority", "description", "requirements", "skills", "benefits"],
  additionalProperties: false,
} as const;

async function llmParseJobText(rawText: string): Promise<Partial<ExtractedJob>> {
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are a job description parser. Extract structured fields from raw job posting text.
Return ONLY valid JSON. Normalize: title=clean job title, company=company name, location=city/state or "Remote",
employmentType=CLT|PJ|Contract|Internship|Unknown, seniority=Júnior|Pleno|Sênior|Gerente|Diretor|Unknown,
description=full description cleaned (preserve all requirements and responsibilities),
requirements=array of individual requirements as strings,
skills=array of specific technical or soft skills mentioned,
benefits=array of benefits mentioned.
If a field is not found, return empty string or empty array.`,
        },
        {
          role: "user",
          content: `Parse this job posting:\n\n${rawText.slice(0, 6000)}`,
        },
      ],
      maxTokens: 2000,
      temperature: 0.0,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "parsed_job",
          strict: true,
          schema: LLM_PARSE_SCHEMA,
        },
      },
    });

    const raw = response.choices[0]?.message?.content;
    if (!raw) return { scrapedSuccessfully: false, extractionMethod: "llm_parse" };

    const parsed = JSON.parse(typeof raw === "string" ? raw : JSON.stringify(raw)) as Record<string, unknown>;
    return {
      title:          String(parsed.title ?? ""),
      company:        String(parsed.company ?? ""),
      location:       String(parsed.location ?? ""),
      employmentType: String(parsed.employmentType ?? ""),
      seniority:      String(parsed.seniority ?? ""),
      description:    String(parsed.description ?? rawText.slice(0, 8000)),
      requirements:   Array.isArray(parsed.requirements) ? parsed.requirements as string[] : [],
      skills:         Array.isArray(parsed.skills) ? parsed.skills as string[] : [],
      benefits:       Array.isArray(parsed.benefits) ? parsed.benefits as string[] : [],
      rawText,
      extractionMethod: "llm_parse",
      scrapedSuccessfully: true,
    };
  } catch {
    return {
      description: rawText.slice(0, 8000),
      rawText,
      extractionMethod: "llm_parse",
      scrapedSuccessfully: rawText.length > 100,
    };
  }
}

// ─── Skills extractor (supplemental) ─────────────────────────────────────────

const KNOWN_SKILLS = [
  "python","javascript","typescript","java","c#","c++","go","rust","php","ruby","swift","kotlin","scala",
  "react","vue","angular","node.js","nodejs","nextjs","nestjs","django","flask","spring","laravel","fastapi",
  "aws","azure","gcp","google cloud","docker","kubernetes","terraform","ci/cd","devops","mlops",
  "sql","postgresql","mysql","mongodb","redis","elasticsearch","kafka","spark","airflow","dbt","bigquery",
  "power bi","tableau","looker","metabase","excel avançado",
  "salesforce","hubspot","pipedrive","rdstation","zendesk","jira","confluence",
  "google ads","meta ads","seo","google analytics","ga4","tag manager",
  "linkedin recruiter","gupy","workday","greenhouse","taleo","icims",
  "cpa-20","cpa 20","cpa-10","cfa","anbima","creci","cnai",
  "agile","scrum","kanban","lean","six sigma","pmp","prince2",
  "inglês","espanhol","francês","mandarim","alemão",
  "liderança","gestão","negociação","comunicação","project finance","mercap","mercado de capitais",
  "b2b","saas","sdr","bdr","crm","pipeline","account management",
];

function extractSkills(text: string, existingSkills: string[] = []): string[] {
  const lower = text.toLowerCase();
  const found = new Set(existingSkills.map(s => s.toLowerCase()));
  for (const skill of KNOWN_SKILLS) {
    if (lower.includes(skill)) found.add(skill);
  }
  return [...found].slice(0, 25);
}

// ─── Main extraction pipeline ─────────────────────────────────────────────────

export async function extractLinkedInJob(url: string): Promise<ExtractedJob> {
  let cleanUrl: string;
  let jobId: string | null = null;

  try {
    cleanUrl = normalizeUrl(url);
    jobId    = extractJobId(cleanUrl);
  } catch {
    throw new Error("URL inválida.");
  }

  let partial: Partial<ExtractedJob> | null = null;
  let html = "";

  // ── Fetch once, try all HTML-based layers ───────────────────────────────
  try {
    const res = await fetch(cleanUrl, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(9000),
    });

    if (res.ok) {
      html = await res.text();

      const isBlocked =
        html.length < 2000 ||
        /authwall|sign in to view|join to see|please sign in/i.test(html);

      if (!isBlocked) {
        // Layer 1
        partial = tryJsonLd(html);
        // Layer 2
        if (!partial?.scrapedSuccessfully) partial = tryOpenGraph(html) ?? partial;
        // Layer 3
        if (!partial?.scrapedSuccessfully || !partial?.description) {
          const htmlResult = tryHtmlParse(html);
          if (htmlResult?.description) {
            partial = { ...partial, ...htmlResult };
          }
        }
      }
    }
  } catch { /* network failure */ }

  // ── Layer 4: API endpoint ────────────────────────────────────────────────
  if ((!partial?.scrapedSuccessfully || !partial?.description) && jobId) {
    const apiResult = await tryLinkedInApi(jobId);
    if (apiResult?.scrapedSuccessfully) partial = apiResult;
  }

  // ── Merge and enrich ─────────────────────────────────────────────────────
  const base: ExtractedJob = {
    title:          partial?.title          ?? "",
    company:        partial?.company        ?? "",
    location:       partial?.location       ?? "",
    employmentType: partial?.employmentType ?? "",
    seniority:      partial?.seniority      ?? "",
    description:    partial?.description    ?? "",
    requirements:   partial?.requirements   ?? [],
    skills:         partial?.skills         ?? [],
    benefits:       partial?.benefits       ?? [],
    rawText:        partial?.description    ?? "",
    extractionMethod: partial?.extractionMethod ?? "html_parse",
    scrapedSuccessfully: !!(partial?.scrapedSuccessfully && partial?.description && partial.description.length > 100),
    jobId:          jobId ?? undefined,
  };

  if (base.scrapedSuccessfully) {
    base.skills = extractSkills(base.description, base.skills);

    // Parse requirements if not already extracted
    if (base.requirements.length === 0 && base.description) {
      const lines = base.description.split("\n");
      let inReq = false;
      for (const line of lines) {
        const l = line.trim();
        if (!l) continue;
        if (/requisitos|requirements|qualific|experiência necessar|must.have/i.test(l)) { inReq = true; continue; }
        if (inReq && /responsabilidades|sobre a empresa|benefícios|about us/i.test(l)) break;
        if (inReq && l.length > 10) base.requirements.push(l.replace(/^[-•·*]\s*/, ""));
      }
      if (base.requirements.length === 0) {
        base.requirements = lines
          .filter(l => l.trim().length > 15 && l.trim().length < 250)
          .slice(0, 10)
          .map(l => l.trim().replace(/^[-•·*]\s*/, ""));
      }
    }
  }

  return base;
}

// ─── tRPC router ─────────────────────────────────────────────────────────────

export const linkedinJobExtractorRouter = router({

  // POST /extract-job
  extractJob: publicProcedure
    .input(z.object({ url: z.string().min(10) }))
    .mutation(async ({ input }) => {
      // Validate LinkedIn URL
      try {
        const u = new URL(input.url.trim());
        if (!u.hostname.includes("linkedin.com")) {
          return {
            success: false,
            job: null,
            userMessage: "URL não é do LinkedIn. Para outras fontes, cole o texto da vaga diretamente.",
          };
        }
      } catch {
        return { success: false, job: null, userMessage: "URL inválida." };
      }

      const job = await extractLinkedInJob(input.url.trim());

      if (!job.scrapedSuccessfully) {
        return {
          success: false,
          job,
          userMessage:
            "O LinkedIn não permitiu leitura automática desta vaga. " +
            "Abra a vaga no LinkedIn, selecione e copie toda a descrição, " +
            "e cole o texto no campo abaixo para análise.",
        };
      }

      return { success: true, job, userMessage: null };
    }),

  // POST /parse-job-text — parses manually pasted text via LLM
  parseJobText: publicProcedure
    .input(z.object({ text: z.string().min(50) }))
    .mutation(async ({ input }) => {
      const parsed = await llmParseJobText(input.text);
      return {
        success: true,
        job: {
          title:          parsed.title          ?? "",
          company:        parsed.company        ?? "",
          location:       parsed.location       ?? "",
          employmentType: parsed.employmentType ?? "",
          seniority:      parsed.seniority      ?? "",
          description:    parsed.description    ?? input.text,
          requirements:   parsed.requirements   ?? [],
          skills:         extractSkills(parsed.description ?? input.text, parsed.skills ?? []),
          benefits:       parsed.benefits       ?? [],
          rawText:        input.text,
          extractionMethod: "llm_parse" as const,
          scrapedSuccessfully: true,
        },
      };
    }),
});
