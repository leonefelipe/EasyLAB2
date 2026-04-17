/**
 * linkedInExtractor.ts
 * Puppeteer-based LinkedIn job extractor with plain-fetch fallback.
 * Place at: server/linkedInExtractor.ts
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

// ─── HTML → plain text ────────────────────────────────────────────────────────

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

function extractField(html: string, patterns: RegExp[]): string {
  for (const p of patterns) {
    const m = html.match(p);
    if (m?.[1]) return cleanHtml(m[1]).slice(0, 400).trim();
  }
  return "";
}

function parseSkills(text: string): string[] {
  const KNOWN: string[] = [
    "python","javascript","typescript","java","c#","c++","go","rust","php","ruby","swift","kotlin",
    "react","vue","angular","node.js","django","flask","spring","laravel",
    "aws","azure","gcp","docker","kubernetes","terraform","git","ci/cd",
    "sql","postgresql","mysql","mongodb","elasticsearch","kafka","spark",
    "power bi","tableau","looker","dbt","airflow",
    "salesforce","hubspot","pipedrive","rdstation","zoho",
    "google ads","meta ads","seo","google analytics",
    "linkedin recruiter","gupy","workday","greenhouse","taleo",
    "agile","scrum","kanban","devops",
    "excel","power point","word","jira","confluence","notion","slack",
    "liderança","gestão","negociação","comunicação","planejamento","análise",
  ];
  const low = text.toLowerCase();
  return KNOWN.filter(s => low.includes(s));
}

// ─── Puppeteer extraction ─────────────────────────────────────────────────────

async function extractWithPuppeteer(url: string): Promise<LinkedInJobData | null> {
  let browser: import("puppeteer").Browser | null = null;

  try {
    // Dynamic import — avoids crashing if puppeteer isn't installed
    const puppeteer = await import("puppeteer").then(m => m.default ?? m);

    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--single-process",
      ],
    });

    const page = await browser.newPage();

    // Realistic viewport + UA
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    );

    // Block images/fonts to speed up
    await page.setRequestInterception(true);
    page.on("request", req => {
      if (["image", "font", "media"].includes(req.resourceType())) req.abort();
      else req.continue();
    });

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });

    // Wait for job description container
    await page.waitForSelector(
      ".show-more-less-html__markup, .description__text, #job-details, .jobs-description",
      { timeout: 8000 }
    ).catch(() => null);

    // Extract via DOM
    const data = await page.evaluate(() => {
      const getText = (sel: string) =>
        (document.querySelector(sel) as HTMLElement | null)?.innerText?.trim() ?? "";

      const title =
        getText(".top-card-layout__title") ||
        getText("h1.job-details-jobs-unified-top-card__job-title") ||
        getText("h1") ||
        document.title.split("|")[0].trim();

      const company =
        getText(".topcard__org-name-link") ||
        getText(".top-card-layout__first-subline a") ||
        getText(".jobs-unified-top-card__company-name") ||
        "";

      const location =
        getText(".topcard__flavor--bullet") ||
        getText(".jobs-unified-top-card__bullet") ||
        getText(".top-card-layout__first-subline .topcard__flavor:not(.topcard__flavor--bullet)") ||
        "";

      const description =
        getText(".show-more-less-html__markup") ||
        getText(".description__text") ||
        getText("#job-details") ||
        getText(".jobs-description-content__text") ||
        "";

      const seniority =
        getText(".description__job-criteria-text:nth-of-type(1)") ||
        getText("li.job-criteria__item:nth-child(1) span") ||
        "";

      const employmentType =
        getText(".description__job-criteria-text:nth-of-type(2)") ||
        getText("li.job-criteria__item:nth-child(2) span") ||
        "";

      // Fallback: grab all visible text if description is empty
      const bodyText = description.length < 50
        ? (document.querySelector("main")?.innerText ?? document.body.innerText).slice(0, 8000)
        : description;

      return { title, company, location, description: bodyText, seniority, employmentType };
    });

    const skills = parseSkills(data.description);

    return {
      title: data.title,
      company: data.company,
      location: data.location,
      description: data.description.slice(0, 7000),
      skills,
      seniorityLevel: data.seniority,
      employmentType: data.employmentType,
      scrapedSuccessfully: data.description.length > 100,
      method: "puppeteer",
    };
  } catch {
    return null;
  } finally {
    await browser?.close().catch(() => null);
  }
}

// ─── Plain-fetch fallback ─────────────────────────────────────────────────────

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
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return null;
    const html = await res.text();

    // Bail on login wall
    if (html.includes("authwall") || html.includes("uas/login") || html.length < 3000) {
      return null;
    }

    const title = extractField(html, [
      /<h1[^>]*class="[^"]*top-card-layout__title[^"]*"[^>]*>([\s\S]+?)<\/h1>/i,
      /<title>([^|<]+)/i,
    ]);
    const company = extractField(html, [
      /class="[^"]*topcard__org-name-link[^"]*"[^>]*>([\s\S]+?)<\/a>/i,
    ]);
    const location = extractField(html, [
      /class="[^"]*topcard__flavor--bullet[^"]*"[^>]*>([\s\S]+?)<\/span>/i,
    ]);

    // Description
    const descPatterns = [
      /<div[^>]*class="[^"]*show-more-less-html__markup[^"]*"[^>]*>([\s\S]+?)<\/div>/i,
      /<section[^>]*class="[^"]*description[^"]*"[^>]*>([\s\S]+?)<\/section>/i,
      /<div[^>]*id="job-details"[^>]*>([\s\S]+?)<\/div>/i,
    ];
    let description = "";
    for (const p of descPatterns) {
      const m = html.match(p);
      if (m?.[1]) { description = cleanHtml(m[1]).slice(0, 7000); break; }
    }

    if (description.length < 80) return null; // still blocked

    const skills = parseSkills(description);

    return {
      title,
      company,
      location,
      description,
      skills,
      seniorityLevel: "",
      employmentType: "",
      scrapedSuccessfully: true,
      method: "fetch",
    };
  } catch {
    return null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function extractLinkedInJob(url: string): Promise<LinkedInJobData> {
  const FAILED: LinkedInJobData = {
    title: "", company: "", location: "", description: "",
    skills: [], seniorityLevel: "", employmentType: "",
    scrapedSuccessfully: false, method: "failed",
  };

  // Validate
  try {
    const u = new URL(url);
    if (!u.hostname.includes("linkedin.com")) return FAILED;
  } catch {
    return FAILED;
  }

  // Only run Puppeteer in production (Render has Chromium available via puppeteer)
  if (ENV.nodeEnv === "production") {
    const puppeteerResult = await extractWithPuppeteer(url);
    if (puppeteerResult?.scrapedSuccessfully) return puppeteerResult;
  }

  // Fetch fallback
  const fetchResult = await extractWithFetch(url);
  if (fetchResult) return fetchResult;

  return FAILED;
}
