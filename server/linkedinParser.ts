/**
 * linkedinParser.ts
 *
 * Attempts to fetch and parse a LinkedIn job posting.
 *
 * Reality check: LinkedIn aggressively blocks server-side requests.
 * This module tries a best-effort fetch and falls back gracefully.
 * The router returns a clear error when scraping fails so the frontend
 * can prompt the user to paste the text manually.
 */

import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ParsedJob {
  title: string;
  company: string;
  location: string;
  description: string;
  requirements: string[];
  skills: string[];
  rawText: string;
  scrapedSuccessfully: boolean;
}

// ─── HTML cleaning utility ────────────────────────────────────────────────────

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

// ─── Field extractors ─────────────────────────────────────────────────────────

function extractBetween(html: string, patterns: RegExp[]): string {
  for (const pattern of patterns) {
    const m = html.match(pattern);
    if (m?.[1]) return stripHtml(m[1]).slice(0, 300).trim();
  }
  return "";
}

function extractTitle(html: string): string {
  return extractBetween(html, [
    /<h1[^>]*class="[^"]*top-card-layout__title[^"]*"[^>]*>([\s\S]+?)<\/h1>/i,
    /<title>([^|<]+)/i,
    /<meta\s+property="og:title"\s+content="([^"]+)"/i,
  ]);
}

function extractCompany(html: string): string {
  return extractBetween(html, [
    /class="[^"]*topcard__org-name-link[^"]*"[^>]*>([\s\S]+?)<\/a>/i,
    /class="[^"]*top-card-layout__first-subline[^"]*"[^>]*>([\s\S]+?)<\/span>/i,
    /<meta\s+name="author"\s+content="([^"]+)"/i,
  ]);
}

function extractLocation(html: string): string {
  return extractBetween(html, [
    /class="[^"]*topcard__flavor--bullet[^"]*"[^>]*>([\s\S]+?)<\/span>/i,
    /class="[^"]*top-card__flavor--bullet[^"]*"[^>]*>([\s\S]+?)<\/span>/i,
  ]);
}

function extractDescription(html: string): string {
  // LinkedIn's job description lives in several possible containers
  const patterns = [
    /<div[^>]*class="[^"]*show-more-less-html__markup[^"]*"[^>]*>([\s\S]+?)<\/div>/i,
    /<section[^>]*class="[^"]*description[^"]*"[^>]*>([\s\S]+?)<\/section>/i,
    /<div[^>]*id="job-details"[^>]*>([\s\S]+?)<\/div>/i,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m?.[1]) {
      const text = stripHtml(m[1]);
      if (text.length > 100) return text.slice(0, 6000);
    }
  }
  return "";
}

function extractSkills(description: string, title: string): string[] {
  const combined = `${title} ${description}`.toLowerCase();

  // Known skill tokens to look for in the text
  const SKILL_TOKENS = [
    // Languages
    "python", "javascript", "typescript", "java", "c#", "c++", "go", "rust", "php", "ruby", "swift", "kotlin",
    // Frameworks
    "react", "vue", "angular", "node.js", "nodejs", "django", "flask", "spring", "laravel",
    // Cloud
    "aws", "azure", "gcp", "google cloud",
    // Data
    "sql", "postgresql", "mysql", "mongodb", "elasticsearch", "kafka", "spark", "hadoop",
    "power bi", "tableau", "looker", "dbt", "airflow",
    // Sales / CRM
    "salesforce", "hubspot", "pipedrive", "rdstation",
    // Marketing
    "google ads", "meta ads", "seo", "google analytics",
    // HR
    "linkedin recruiter", "gupy", "workday", "greenhouse", "taleo",
    // Finance
    "cpa-20", "cpa 20", "cpa-10", "cpa 10",
    // Methodologies
    "agile", "scrum", "kanban", "devops", "ci/cd",
    // Tools
    "docker", "kubernetes", "terraform", "git", "jira", "confluence",
    // Soft
    "liderança", "leadership", "gestão", "negociação", "comunicação",
  ];

  const found: string[] = [];
  for (const skill of SKILL_TOKENS) {
    if (combined.includes(skill)) found.push(skill);
  }
  return [...new Set(found)];
}

function extractRequirements(description: string): string[] {
  const lines = description.split("\n");
  const req: string[] = [];

  let inRequirementsSection = false;

  for (const line of lines) {
    const l = line.trim();
    if (!l) continue;

    const isReqHeader = /requisitos|requirements|qualifica|experiência\s+necessária|must.have|o que\s+esperamos/i.test(l);
    if (isReqHeader) { inRequirementsSection = true; continue; }

    // Stop at next major section
    if (inRequirementsSection && /responsabilidades|sobre a empresa|benefícios|about us|what you.ll do/i.test(l)) break;

    if (inRequirementsSection && l.length > 10) {
      req.push(l.replace(/^[-•·*]\s*/, "").trim());
    }
  }

  // Fallback: grab bullet lines from any part of description
  if (req.length === 0) {
    for (const line of lines) {
      const l = line.trim().replace(/^[-•·*]\s*/, "");
      if (l.length > 15 && l.length < 200) req.push(l);
      if (req.length >= 10) break;
    }
  }

  return req.slice(0, 12);
}

// ─── Fetcher ─────────────────────────────────────────────────────────────────

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
  "Accept-Encoding": "gzip, deflate, br",
  "Cache-Control": "no-cache",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  Referer: "https://www.google.com/",
};

export async function parseLinkedInJob(url: string): Promise<ParsedJob> {
  // Validate it looks like a LinkedIn job URL
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    throw new Error("URL inválida.");
  }

  if (!parsed.hostname.includes("linkedin.com")) {
    throw new Error("URL não é do LinkedIn.");
  }

  // Normalize URL — remove tracking params, keep /jobs/view/{id}
  const pathMatch = parsed.pathname.match(/\/jobs\/view\/(\d+)/);
  const jobId = pathMatch?.[1];
  const cleanUrl = jobId
    ? `https://www.linkedin.com/jobs/view/${jobId}/`
    : url.trim();

  let html = "";
  let fetchSuccess = false;

  try {
    const res = await fetch(cleanUrl, {
      headers: FETCH_HEADERS,
      signal: AbortSignal.timeout(9000),
    });

    if (res.ok) {
      html = await res.text();
      fetchSuccess = html.length > 1000;
    }
  } catch {
    // network error — will fall through to empty result
  }

  // LinkedIn almost always returns a login wall or bot-detection page for server-side requests.
  // We try to extract whatever we can, and signal failure clearly.
  const isLoginWall =
    html.includes("authwall") ||
    html.includes("login") ||
    html.includes("sign in") ||
    html.length < 2000;

  if (!fetchSuccess || isLoginWall) {
    return {
      title: "",
      company: "",
      location: "",
      description: "",
      requirements: [],
      skills: [],
      rawText: "",
      scrapedSuccessfully: false,
    };
  }

  const title = extractTitle(html);
  const company = extractCompany(html);
  const location = extractLocation(html);
  const description = extractDescription(html);
  const requirements = extractRequirements(description);
  const skills = extractSkills(description, title);
  const rawText = [title, company, location, description].filter(Boolean).join("\n\n");

  return {
    title,
    company,
    location,
    description,
    requirements,
    skills,
    rawText,
    scrapedSuccessfully: description.length > 100,
  };
}

// ─── tRPC router ──────────────────────────────────────────────────────────────

export const linkedinParserRouter = router({
  parseJob: publicProcedure
    .input(
      z.object({
        url: z.string().min(10, "URL muito curta"),
      })
    )
    .mutation(async ({ input }) => {
      const result = await parseLinkedInJob(input.url);

      if (!result.scrapedSuccessfully) {
        return {
          ...result,
          userMessage:
            "O LinkedIn não permite leitura automática de vagas. Abra a vaga, selecione toda a descrição (Ctrl+A na seção da vaga) e cole o texto no campo abaixo.",
        };
      }

      return {
        ...result,
        userMessage: null,
      };
    }),
});
