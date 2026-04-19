/**
 * jobExtractorRouter.ts
 * tRPC router that exposes job extraction + resume analysis utilities.
 * Place at: server/jobExtractorRouter.ts
 */

import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";
import { extractLinkedInJob } from "./linkedInExtractor";

// ─── In-memory cache (per process, reset on deploy) ──────────────────────────
const jobCache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 1000 * 60 * 30; // 30 min

function cacheGet<T>(key: string): T | null {
  const entry = jobCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) { jobCache.delete(key); return null; }
  return entry.data as T;
}
function cacheSet(key: string, data: unknown) {
  jobCache.set(key, { data, ts: Date.now() });
}

// ─── Helper: generic URL scrape (non-LinkedIn) ────────────────────────────────
async function scrapeUrl(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return "";
    const html = await res.text();
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<nav[\s\S]*?<\/nav>/gi, "")
      .replace(/<header[\s\S]*?<\/header>/gi, "")
      .replace(/<footer[\s\S]*?<\/footer>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
      .replace(/\s{2,}/g, " ").trim()
      .slice(0, 7000);
  } catch { return ""; }
}

function isUrl(s: string): boolean {
  try { return new URL(s.trim()).protocol.startsWith("http"); } catch { return false; }
}
function isLinkedIn(s: string): boolean {
  try { return new URL(s.trim()).hostname.includes("linkedin.com"); } catch { return false; }
}

// ─── Router ───────────────────────────────────────────────────────────────────
export const jobExtractorRouter = router({

  // ── Extract job from any URL ────────────────────────────────────────────────
  extractJob: publicProcedure
    .input(z.object({ url: z.string().min(10) }))
    .mutation(async ({ input }) => {
      const url = input.url.trim();
      const cached = cacheGet<unknown>(url);
      if (cached) return { ...cached as object, fromCache: true };

      if (isLinkedIn(url)) {
        const data = await extractLinkedInJob(url);
        if (data.scrapedSuccessfully) {
          cacheSet(url, data);
          return { ...data, fromCache: false };
        }
        return {
          ...data,
          fromCache: false,
          userMessage: "LinkedIn bloqueou a leitura automática. Abra a vaga, copie toda a descrição e cole no campo abaixo.",
        };
      }

      const text = await scrapeUrl(url);
      if (text.length < 100) {
        return {
          title: "", company: "", location: "", description: "",
          skills: [], seniorityLevel: "", employmentType: "",
          scrapedSuccessfully: false, method: "failed", fromCache: false,
          userMessage: "Não foi possível ler a vaga automaticamente. Cole a descrição manualmente.",
        };
      }

      const result = {
        title: "", company: "", location: "", description: text,
        skills: [], seniorityLevel: "", employmentType: "",
        scrapedSuccessfully: true, method: "fetch" as const,
      };
      cacheSet(url, result);
      return { ...result, fromCache: false };
    }),

  // ── Improve a single resume sentence ────────────────────────────────────────
  improveSentence: publicProcedure
    .input(z.object({
      sentence: z.string().min(5).max(500),
      jobContext: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { sentence, jobContext } = input;
      const ctx = jobContext ? `\nJob context: ${jobContext.slice(0, 300)}` : "";
      const res = await invokeLLM({
        messages: [{
          role: "user",
          content: `You are a professional resume writer. Rewrite this resume bullet into a strong impact statement using a power verb + metric/scale + result. Keep it under 20 words. Return ONLY the improved sentence, nothing else.\n\nOriginal: "${sentence}"${ctx}`,
        }],
        maxTokens: 80,
        temperature: 0.3,
      });
      const improved = res.choices[0]?.message?.content?.trim() ?? sentence;
      return { original: sentence, improved };
    }),

  // ── Auto-generate professional summary from CV text ─────────────────────────
  generateSummary: publicProcedure
    .input(z.object({
      cvText: z.string().min(50),
      targetRole: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { cvText, targetRole } = input;
      const roleCtx = targetRole ? ` targeting the role of ${targetRole}` : "";
      const res = await invokeLLM({
        messages: [{
          role: "system",
          content: "You are a senior CPRW resume writer. Write a 3-sentence professional summary in Brazilian Portuguese. Use power verbs, include seniority level, key skills, and one quantified achievement if present. Plain text only. No markdown.",
        }, {
          role: "user",
          content: `CV:\n${cvText.slice(0, 3000)}\n\nWrite a professional summary${roleCtx}.`,
        }],
        maxTokens: 200,
        temperature: 0.3,
      });
      return { summary: res.choices[0]?.message?.content?.trim() ?? "" };
    }),

  // ── Detect resume sections ──────────────────────────────────────────────────
  detectSections: publicProcedure
    .input(z.object({ cvText: z.string().min(50) }))
    .mutation(async ({ input }) => {
      const res = await invokeLLM({
        messages: [{
          role: "system",
          content: "Analyze this resume and identify which sections are present and which are missing. Return ONLY JSON.",
        }, {
          role: "user",
          content: `CV:\n${input.cvText.slice(0, 3000)}\n\nReturn JSON:\n{"present":["section1","section2"],"missing":["section3"],"suggestions":["tip1"]}`,
        }],
        maxTokens: 300,
        temperature: 0.1,
        response_format: { type: "json_object" },
      });
      try {
        const content = res.choices[0]?.message?.content ?? "{}";
        const parsed = JSON.parse(content);
        return {
          present: parsed.present ?? [],
          missing: parsed.missing ?? [],
          suggestions: parsed.suggestions ?? [],
        };
      } catch {
        return { present: [], missing: [], suggestions: [] };
      }
    }),

  // ── Job match score (quick, no full analysis) ───────────────────────────────
  quickMatchScore: publicProcedure
    .input(z.object({
      cvText: z.string().min(50),
      jobText: z.string().min(20),
    }))
    .mutation(async ({ input }) => {
      const res = await invokeLLM({
        messages: [{
          role: "system",
          content: "You are an ATS system. Compute a match score between CV and job description. Return ONLY JSON.",
        }, {
          role: "user",
          content: `CV:\n${input.cvText.slice(0, 2000)}\n\nJOB:\n${input.jobText.slice(0, 1500)}\n\nReturn JSON:\n{"score":75,"matchedKeywords":["keyword1"],"missingKeywords":["keyword2"],"verdict":"Good match — needs X"}`,
        }],
        maxTokens: 400,
        temperature: 0.1,
        response_format: { type: "json_object" },
      });
      try {
        const content = res.choices[0]?.message?.content ?? "{}";
        const parsed = JSON.parse(content);
        return {
          score: Math.min(100, Math.max(0, Number(parsed.score ?? 0))),
          matchedKeywords: parsed.matchedKeywords ?? [],
          missingKeywords: parsed.missingKeywords ?? [],
          verdict: parsed.verdict ?? "",
        };
      } catch {
        return { score: 0, matchedKeywords: [], missingKeywords: [], verdict: "" };
      }
    }),
});
