/**
 * linkedInExtractor.ts
 * Pipeline de extração LinkedIn — Puppeteer (produção) → fetch (fallback).
 * Compatible com: server/jobExtractorRouter.ts → extractLinkedInJob(url)
 */

import { ENV } from "./_core/env";

export interface LinkedInJobData {
  title: string;
  company: string;
  location: string;
  description: string;
  skills: string[];
  seniorityLevel: string;
  employmentType: string;
  scrapedSuccessfully: boolean;
  method: "puppeteer" | "fetch" | "failed";
}

// ─── HTML → texto limpo ───────────────────────────────────────────────────────

function cleanHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
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

// ─── Detecção de skills ───────────────────────────────────────────────────────

function parseSkills(text: string): string[] {
  const KNOWN = [
    "python", "javascript", "typescript", "java", "c#", "c++", "go", "rust", "php", "ruby", "swift", "kotlin",
    "react", "vue", "angular", "node.js", "django", "flask", "spring", "laravel", "next.js",
    "aws", "azure", "gcp", "docker", "kubernetes", "terraform", "git", "ci/cd", "github actions",
    "sql", "postgresql", "mysql", "mongodb", "elasticsearch", "kafka", "spark", "redis",
    "power bi", "tableau", "looker", "dbt", "airflow", "databricks",
    "salesforce", "hubspot", "pipedrive", "rdstation", "zoho",
    "google ads", "meta ads", "seo", "google analytics", "google tag manager",
    "linkedin recruiter", "gupy", "workday", "greenhouse", "taleo",
    "agile", "scrum", "kanban", "devops", "mlops",
    "excel", "powerpoint", "word", "jira", "confluence", "notion", "slack",
    "liderança", "gestão", "negociação", "comunicação", "planejamento", "análise",
  ];
  const low = text.toLowerCase();
  return KNOWN.filter(s => low.includes(s));
}

// ─── LAYER 1: Puppeteer (headless Chromium) ───────────────────────────────────

async function extractWithPuppeteer(url: string): Promise<LinkedInJobData | null> {
  let browser: import("puppeteer").Browser | null = null;
  try {
    const puppeteer = await import("puppeteer").then(m => m.default ?? m);

    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--single-process",
        "--disable-blink-features=AutomationControlled",
      ],
    });

    const page = await browser.newPage();

    // UA realista
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    );

    // Esconder webdriver flag (Puppeteer v24 API)
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    });

    // Bloquear imagens/fontes para acelerar
    await page.setRequestInterception(true);
    page.on("request", req => {
      if (["image", "font", "media", "stylesheet"].includes(req.resourceType())) req.abort();
      else req.continue();
    });

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });

    // Fechar modal de login se aparecer
    await page.evaluate(() => {
      const modal = document.querySelector<HTMLElement>(".modal__overlay, .authwall-modal");
      if (modal) modal.remove();
    });

    // Expandir "Ver mais"
    await page.evaluate(() => {
      const btn = document.querySelector<HTMLElement>(
        "button.show-more-less-html__button--more, .jobs-description__footer-button"
      );
      if (btn) btn.click();
    });

    // Aguardar description
    await page.waitForSelector(
      ".show-more-less-html__markup, .description__text, #job-details, .jobs-description",
      { timeout: 8000 }
    ).catch(() => null);

    await new Promise(resolve => setTimeout(resolve, 800));

    // Extrair via DOM
    const data = await page.evaluate(() => {
      const t = (sel: string) =>
        (document.querySelector(sel) as HTMLElement | null)?.innerText?.trim() ?? "";

      const title =
        t(".top-card-layout__title") ||
        t("h1.job-details-jobs-unified-top-card__job-title") ||
        t(".jobs-unified-top-card__job-title h1") ||
        t("h1") ||
        document.title.split("|")[0].trim();

      const company =
        t(".topcard__org-name-link") ||
        t(".top-card-layout__first-subline a") ||
        t(".jobs-unified-top-card__company-name") ||
        t(".job-details-jobs-unified-top-card__company-name a") ||
        "";

      const location =
        t(".topcard__flavor--bullet") ||
        t(".jobs-unified-top-card__bullet") ||
        t(".job-details-jobs-unified-top-card__bullet") ||
        "";

      const description =
        t(".show-more-less-html__markup") ||
        t(".description__text") ||
        t("#job-details") ||
        t(".jobs-description-content__text") ||
        t(".jobs-description") ||
        "";

      const seniority =
        t("li.job-criteria__item:nth-child(1) span.job-criteria__text") ||
        t(".description__job-criteria-text:nth-of-type(1)") ||
        "";

      const employmentType =
        t("li.job-criteria__item:nth-child(2) span.job-criteria__text") ||
        t(".description__job-criteria-text:nth-of-type(2)") ||
        "";

      // Fallback: texto do body inteiro se description vazio
      const body =
        description.length < 80
          ? (document.querySelector("main")?.innerText ?? document.body.innerText).slice(0, 9000)
          : description;

      return { title, company, location, description: body, seniority, employmentType };
    });

    const skills = parseSkills(data.description);

    return {
      title: data.title,
      company: data.company,
      location: data.location,
      description: data.description.slice(0, 8000),
      skills,
      seniorityLevel: data.seniority,
      employmentType: data.employmentType,
      scrapedSuccessfully: data.description.length > 120,
      method: "puppeteer",
    };
  } catch (err) {
    console.error("[LinkedIn/Puppeteer]", (err as Error).message);
    return null;
  } finally {
    await browser?.close().catch(() => null);
  }
}

// ─── LAYER 2: fetch simples (fallback) ───────────────────────────────────────

async function extractWithFetch(url: string): Promise<LinkedInJobData | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        "Cache-Control": "no-cache",
        Referer: "https://www.google.com/",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
      },
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) return null;
    const html = await res.text();

    // Rejeitar login wall
    if (
      html.includes("authwall") ||
      html.includes("uas/login") ||
      html.length < 3000
    ) return null;

    // JSON-LD structured data (mais confiável quando presente)
    const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]+?)<\/script>/i);
    if (jsonLdMatch) {
      try {
        const ld = JSON.parse(jsonLdMatch[1]);
        if (ld.description && ld.description.length > 100) {
          const desc = cleanHtml(ld.description).slice(0, 8000);
          return {
            title: ld.title ?? "",
            company: ld.hiringOrganization?.name ?? "",
            location: ld.jobLocation?.address?.addressLocality ?? "",
            description: desc,
            skills: parseSkills(desc),
            seniorityLevel: "",
            employmentType: ld.employmentType ?? "",
            scrapedSuccessfully: true,
            method: "fetch",
          };
        }
      } catch { /* ignore */ }
    }

    // Fallback: regex patterns
    const extractField = (patterns: RegExp[]): string => {
      for (const p of patterns) {
        const m = html.match(p);
        if (m?.[1]) return cleanHtml(m[1]).slice(0, 400).trim();
      }
      return "";
    };

    const title = extractField([
      /<h1[^>]*class="[^"]*top-card-layout__title[^"]*"[^>]*>([\s\S]+?)<\/h1>/i,
      /<title>([^|<]+)/i,
    ]);
    const company = extractField([
      /class="[^"]*topcard__org-name-link[^"]*"[^>]*>([\s\S]+?)<\/a>/i,
    ]);
    const location = extractField([
      /class="[^"]*topcard__flavor--bullet[^"]*"[^>]*>([\s\S]+?)<\/span>/i,
    ]);

    let description = "";
    for (const p of [
      /<div[^>]*class="[^"]*show-more-less-html__markup[^"]*"[^>]*>([\s\S]+?)<\/div>/i,
      /<section[^>]*class="[^"]*description[^"]*"[^>]*>([\s\S]+?)<\/section>/i,
      /<div[^>]*id="job-details"[^>]*>([\s\S]+?)<\/div>/i,
    ]) {
      const m = html.match(p);
      if (m?.[1]) { description = cleanHtml(m[1]).slice(0, 8000); break; }
    }

    if (description.length < 80) return null;

    return {
      title,
      company,
      location,
      description,
      skills: parseSkills(description),
      seniorityLevel: "",
      employmentType: "",
      scrapedSuccessfully: true,
      method: "fetch",
    };
  } catch (err) {
    console.error("[LinkedIn/Fetch]", (err as Error).message);
    return null;
  }
}

// ─── API pública ───────────────────────────────────────────────────────────────

const FAILED: LinkedInJobData = {
  title: "", company: "", location: "", description: "",
  skills: [], seniorityLevel: "", employmentType: "",
  scrapedSuccessfully: false, method: "failed",
};

export async function extractLinkedInJob(url: string): Promise<LinkedInJobData> {
  // Validar URL
  try {
    const u = new URL(url);
    if (!u.hostname.includes("linkedin.com")) return FAILED;
  } catch {
    return FAILED;
  }

  // Em produção tenta Puppeteer primeiro (Render tem Chromium via puppeteer)
  if (ENV.nodeEnv === "production" || process.env.NODE_ENV === "production") {
    const result = await extractWithPuppeteer(url);
    if (result?.scrapedSuccessfully) return result;
  }

  // Fallback fetch
  const fetchResult = await extractWithFetch(url);
  if (fetchResult) return fetchResult;

  return FAILED;
}
