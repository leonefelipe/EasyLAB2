/**
 * pdfRouter.ts
 * tRPC router — geração de PDF server-side via Puppeteer.
 * Zero watermarks. Layout profissional. Texto normal sem bold indevido.
 */

import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";
import puppeteer from "puppeteer";

const SECTIONS_PT = [
  "RESUMO PROFISSIONAL", "COMPETÊNCIAS PRINCIPAIS", "COMPETENCIAS PRINCIPAIS",
  "EXPERIÊNCIA PROFISSIONAL", "EXPERIENCIA PROFISSIONAL",
  "FORMAÇÃO ACADÊMICA", "FORMACAO ACADEMICA",
  "IDIOMAS", "CERTIFICAÇÕES", "CERTIFICACOES", "HABILIDADES",
  "CURSOS", "INFORMAÇÕES ADICIONAIS", "INFORMACOES ADICIONAIS",
  "PUBLICAÇÕES", "PUBLICACOES", "VOLUNTARIADO", "PROJETOS",
];

const SECTIONS_EN = [
  "PROFESSIONAL SUMMARY", "CORE COMPETENCIES", "PROFESSIONAL EXPERIENCE",
  "EDUCATION", "LANGUAGES", "CERTIFICATIONS", "SKILLS",
  "COURSES", "ADDITIONAL INFORMATION", "PUBLICATIONS",
  "VOLUNTEER", "PROJECTS", "AWARDS", "REFERENCES",
];

function isSection(line: string, lang: "pt" | "en"): boolean {
  const t = line.trim().toUpperCase();
  const headers = lang === "pt" ? SECTIONS_PT : SECTIONS_EN;
  return headers.some(h => t === h || t.startsWith(h + " ") || t.startsWith(h + ":"));
}

function isSubSection(line: string, lang: "pt" | "en"): boolean {
  const t = line.trim();
  return (
    t.length > 2 && t.length < 60 &&
    t === t.toUpperCase() &&
    !t.startsWith("-") && !t.startsWith("•") &&
    !/^\d/.test(t) &&
    !isSection(t, lang)
  );
}

function isBullet(line: string): boolean {
  return /^[-•*▪·]\s/.test(line.trim());
}

function isContact(line: string): boolean {
  return (
    line.includes("|") || line.includes("@") ||
    line.includes("+55") || line.toLowerCase().includes("linkedin")
  );
}

function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildResumeHtml(resumeText: string, lang: "pt" | "en"): string {
  const lines = resumeText.split("\n");
  let headerHtml = "";
  let sectionsHtml = "";
  let currentSection = "";

  let nameDone = false;
  let titleDone = false;
  let contactDone = false;
  let inSection = false;
  let bulletOpen = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (!line) {
      if (bulletOpen) {
        if (inSection) currentSection += `</ul>`;
        bulletOpen = false;
      }
      continue;
    }

    if (!nameDone) {
      headerHtml += `<div class="r-name">${esc(line)}</div>`;
      nameDone = true;
      continue;
    }

    if (!titleDone && !isSection(line, lang)) {
      headerHtml += `<div class="r-title">${esc(line)}</div>`;
      titleDone = true;
      continue;
    }

    if (!contactDone && (i <= 3 || isContact(line)) && !isSection(line, lang)) {
      headerHtml += `<div class="r-contact">${esc(line)}</div>`;
      contactDone = true;
      continue;
    }

    if (isSection(line, lang)) {
      if (bulletOpen) { currentSection += `</ul>`; bulletOpen = false; }
      if (inSection) { sectionsHtml += currentSection + `</div></div>`; }
      currentSection = `<div class="sec"><div class="sec-hdr"><span>${esc(line)}</span></div><div class="sec-body">`;
      inSection = true;
      continue;
    }

    if (isSubSection(line, lang)) {
      if (bulletOpen) { currentSection += `</ul>`; bulletOpen = false; }
      currentSection += `<div class="sub">${esc(line)}</div>`;
      continue;
    }

    if (isBullet(line)) {
      const txt = esc(line.replace(/^[-•*▪·]\s+/, ""));
      if (!bulletOpen) { currentSection += `<ul>`; bulletOpen = true; }
      currentSection += `<li>${txt}</li>`;
      continue;
    }

    if (bulletOpen) { currentSection += `</ul>`; bulletOpen = false; }

    if (line.includes(" | ") || line.includes(" – ") || line.includes(" - ")) {
      currentSection += `<div class="job-line">${esc(line)}</div>`;
    } else {
      currentSection += `<p>${esc(line)}</p>`;
    }
  }

  if (bulletOpen && currentSection) currentSection += `</ul>`;
  if (inSection) sectionsHtml += currentSection + `</div></div>`;

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8">
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: Arial, "Helvetica Neue", Helvetica, sans-serif;
  font-size: 10.5pt;
  line-height: 1.5;
  color: #111;
  background: #fff;
}

.page {
  width: 210mm;
  min-height: 297mm;
  padding: 16mm 20mm;
  background: #fff;
}

.r-hdr {
  border-bottom: 1.5px solid #111;
  padding-bottom: 10px;
  margin-bottom: 14px;
}
.r-name {
  font-size: 22pt;
  font-weight: 700;
  color: #111;
  line-height: 1.15;
  margin-bottom: 3px;
  letter-spacing: -0.3px;
}
.r-title {
  font-size: 11pt;
  font-weight: 400;
  color: #333;
  margin-bottom: 5px;
}
.r-contact {
  font-size: 9pt;
  color: #555;
  font-weight: 400;
}

.sec { margin-bottom: 13px; page-break-inside: avoid; }

.sec-hdr {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  page-break-after: avoid;
}
.sec-hdr span {
  font-size: 9pt;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1.3px;
  color: #111;
  white-space: nowrap;
}
.sec-hdr::after {
  content: '';
  flex: 1;
  height: 1px;
  background: #111;
  display: block;
}

.sec-body { padding: 0; }

.sub {
  font-size: 10.5pt;
  font-weight: 700;
  color: #111;
  margin: 7px 0 2px;
}
.job-line {
  font-size: 10pt;
  font-weight: 600;
  color: #222;
  margin: 5px 0 3px;
}

ul {
  list-style: none;
  margin: 3px 0 6px 0;
  padding: 0;
}
li {
  font-size: 10pt;
  color: #333;
  padding-left: 14px;
  position: relative;
  margin-bottom: 2px;
  line-height: 1.45;
  font-weight: 400;
}
li::before {
  content: "•";
  position: absolute;
  left: 0;
  color: #111;
  font-weight: 700;
}

p {
  font-size: 10pt;
  color: #333;
  margin-bottom: 3px;
  text-align: justify;
  font-weight: 400;
}

@media print {
  body { margin: 0; }
  .page { padding: 14mm 18mm; }
}
</style>
</head>
<body>
<div class="page">
  <div class="r-hdr">${headerHtml}</div>
  ${sectionsHtml}
</div>
</body>
</html>`;
}

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
          printBackground: false,
          displayHeaderFooter: false,
          margin: { top: "0mm", bottom: "0mm", left: "0mm", right: "0mm" },
        });

        const base64 = Buffer.from(pdfBuffer).toString("base64");
        return { pdf: base64 };
      } finally {
        if (browser) await browser.close();
      }
    }),
});
