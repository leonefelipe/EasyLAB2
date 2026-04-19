/**
 * pdfRouter.ts
 * tRPC router — server-side PDF generation via Puppeteer.
 * Zero watermarks. ATS-friendly. Professional layout.
 */

import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";
import puppeteer from "puppeteer";

// ─── Section detection ────────────────────────────────────────────────────────

const SECTION_HEADERS_PT = [
  "RESUMO PROFISSIONAL", "COMPETÊNCIAS PRINCIPAIS", "COMPETENCIAS PRINCIPAIS",
  "EXPERIÊNCIA PROFISSIONAL", "EXPERIENCIA PROFISSIONAL",
  "FORMAÇÃO ACADÊMICA", "FORMACAO ACADEMICA",
  "IDIOMAS", "CERTIFICAÇÕES", "CERTIFICACOES", "HABILIDADES",
  "CURSOS", "INFORMAÇÕES ADICIONAIS", "INFORMACOES ADICIONAIS",
  "PUBLICAÇÕES", "PUBLICACOES", "VOLUNTARIADO",
];
const SECTION_HEADERS_EN = [
  "PROFESSIONAL SUMMARY", "CORE COMPETENCIES", "PROFESSIONAL EXPERIENCE",
  "EDUCATION", "LANGUAGES", "CERTIFICATIONS", "SKILLS",
  "COURSES", "ADDITIONAL INFORMATION", "PUBLICATIONS", "VOLUNTEER",
  "PROJECTS", "AWARDS", "REFERENCES",
];

function isSection(line: string, lang: "pt" | "en"): boolean {
  const t = line.trim().toUpperCase();
  const headers = lang === "pt" ? SECTION_HEADERS_PT : SECTION_HEADERS_EN;
  return headers.some(h => t === h || t.startsWith(h + " ") || t.startsWith(h + ":"));
}

function isSubSection(line: string, lang: "pt" | "en"): boolean {
  const t = line.trim();
  return (
    t === t.toUpperCase() &&
    t.length > 2 &&
    t.length < 60 &&
    !t.startsWith("-") &&
    !t.startsWith("•") &&
    !t.match(/^\d/) &&
    !isSection(t, lang)
  );
}

function isBullet(line: string): boolean {
  return /^[-•*▪·]\s/.test(line.trim());
}

function isContactLine(line: string): boolean {
  return (
    line.includes("|") ||
    line.includes("@") ||
    line.includes("+55") ||
    line.includes("linkedin")
  );
}

// ─── HTML builder ─────────────────────────────────────────────────────────────

function buildResumeHtml(resumeText: string, lang: "pt" | "en"): string {
  const lines = resumeText.split("\n");
  let body = "";
  let inSection = false;
  let bulletGroup = false;
  let nameProcessed = false;
  let titleProcessed = false;
  let contactProcessed = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (!line) {
      if (bulletGroup) { body += `</ul>`; bulletGroup = false; }
      continue;
    }

    if (!nameProcessed && i === 0) {
      body += `<div class="name">${line}</div>`;
      nameProcessed = true;
      continue;
    }

    if (!titleProcessed && i === 1 && !isSection(line, lang)) {
      body += `<div class="title">${line}</div>`;
      titleProcessed = true;
      continue;
    }

    if (!contactProcessed && (i === 2 || isContactLine(line)) && !isSection(line, lang)) {
      body += `<div class="contact">${line}</div>`;
      if (i === 2) contactProcessed = true;
      continue;
    }

    if (isSection(line, lang)) {
      if (bulletGroup) { body += `</ul>`; bulletGroup = false; }
      if (inSection) body += `</div>`;
      body += `<div class="section">`;
      body += `<div class="sec-hdr"><span>${line}</span><div class="rule"></div></div>`;
      body += `<div class="sec-body">`;
      inSection = true;
      continue;
    }

    if (isSubSection(line, lang)) {
      if (bulletGroup) { body += `</ul>`; bulletGroup = false; }
      body += `<div class="sub-hdr">${line}</div>`;
      continue;
    }

    if (isBullet(line)) {
      const text = line.replace(/^[-•*▪·]\s+/, "");
      if (!bulletGroup) { body += `<ul class="bullets">`; bulletGroup = true; }
      body += `<li>${text}</li>`;
      continue;
    }

    if (bulletGroup) { body += `</ul>`; bulletGroup = false; }

    if (line.includes(" | ") || line.includes(" – ") || line.match(/\w+\s*[-–]\s*\w+/)) {
      body += `<div class="job-line">${line}</div>`;
    } else {
      body += `<p class="body-p">${line}</p>`;
    }
  }

  if (bulletGroup) body += `</ul>`;
  if (inSection) body += `</div></div>`;

  const sectionSplit = body.split(`<div class="section">`);
  const headerHtml = sectionSplit[0];
  const sectionsHtml =
    sectionSplit.length > 1
      ? sectionSplit.slice(1).map(s => `<div class="section">${s}`).join("")
      : "";

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif;
    font-size: 10.5pt;
    line-height: 1.5;
    color: #111111;
    background: #ffffff;
  }

  .page {
    width: 210mm;
    min-height: 297mm;
    padding: 16mm 20mm 16mm 20mm;
    background: #ffffff;
  }

  /* ── Header ── */
  .resume-header {
    border-bottom: 1.8px solid #111;
    padding-bottom: 10px;
    margin-bottom: 13px;
  }
  .name {
    font-size: 21pt;
    font-weight: 700;
    color: #111;
    letter-spacing: -0.2px;
    line-height: 1.15;
    margin-bottom: 3px;
  }
  .title {
    font-size: 11pt;
    font-weight: 500;
    color: #333;
    margin-bottom: 5px;
  }
  .contact {
    font-size: 9pt;
    color: #555;
  }

  /* ── Sections ── */
  .section { margin-bottom: 12px; page-break-inside: avoid; }
  .sec-hdr {
    display: flex;
    align-items: center;
    gap: 7px;
    margin-bottom: 7px;
    page-break-after: avoid;
  }
  .sec-hdr span {
    font-size: 9pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1.1px;
    color: #111;
    white-space: nowrap;
  }
  .rule { flex: 1; height: 1px; background: #111; }
  .sec-body { padding: 0; }

  /* ── Sub-headers ── */
  .sub-hdr { font-size: 10.5pt; font-weight: 600; color: #111; margin: 7px 0 2px; }
  .job-line { font-size: 10pt; font-weight: 600; color: #222; margin: 5px 0 3px; }

  /* ── Bullets ── */
  .bullets { list-style: none; margin: 2px 0 5px 0; padding: 0; }
  .bullets li {
    font-size: 10pt;
    color: #333;
    padding-left: 13px;
    position: relative;
    margin-bottom: 2px;
    line-height: 1.45;
  }
  .bullets li::before {
    content: "•";
    position: absolute;
    left: 0;
    color: #111;
    font-weight: 700;
  }

  /* ── Body ── */
  .body-p { font-size: 10pt; color: #333; margin-bottom: 3px; text-align: justify; }

  @media print {
    body { margin: 0; }
    .page { padding: 14mm 18mm; }
    .section { page-break-inside: avoid; }
  }
</style>
</head>
<body>
<div class="page">
  <div class="resume-header">${headerHtml}</div>
  ${sectionsHtml}
</div>
</body>
</html>`;
}

// ─── tRPC router ──────────────────────────────────────────────────────────────

export const pdfRouter = router({
  generate: publicProcedure
    .input(
      z.object({
        resumeText: z.string().min(50),
        lang: z.enum(["pt", "en"]),
      })
    )
    .mutation(async ({ input }) => {
      const html = buildResumeHtml(input.resumeText, input.lang);

      let browser;
      try {
        browser = await puppeteer.launch({
          executablePath: "/usr/bin/chromium",
          headless: true,
          args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--no-first-run",
            "--no-zygote",
            "--single-process",
          ],
        });

        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: "networkidle0", timeout: 15000 });

        const pdfBuffer = await page.pdf({
          format: "A4",
          printBackground: false,       // ← sem fundos coloridos / overlays
          displayHeaderFooter: false,   // ← sem header/footer do browser (elimina watermarks)
          margin: { top: "0mm", bottom: "0mm", left: "0mm", right: "0mm" },
        });

        const base64 = Buffer.from(pdfBuffer).toString("base64");
        return { pdf: base64 };
      } finally {
        if (browser) await browser.close();
      }
    }),
});
