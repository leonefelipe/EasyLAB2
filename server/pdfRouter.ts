import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";
import puppeteer from "puppeteer";

function buildResumeHtml(resumeText: string, lang: "pt" | "en" = "pt"): string {
  const lines = resumeText.split("\n");
  let html = "";
  let inSection = false;

  const sectionHeaders = [
    "RESUMO PROFISSIONAL", "PROFESSIONAL SUMMARY",
    "COMPETENCIAS PRINCIPAIS", "CORE COMPETENCIES",
    "COMPETÊNCIAS PRINCIPAIS",
    "EXPERIENCIA PROFISSIONAL", "PROFESSIONAL EXPERIENCE",
    "EXPERIÊNCIA PROFISSIONAL",
    "FORMACAO ACADEMICA", "EDUCATION",
    "FORMAÇÃO ACADÊMICA",
    "IDIOMAS", "LANGUAGES",
    "CERTIFICACOES", "CERTIFICATIONS",
    "CERTIFICAÇÕES",
    "HABILIDADES", "SKILLS",
    "CURSOS", "COURSES",
    "INFORMACOES ADICIONAIS", "ADDITIONAL INFORMATION",
    "INFORMAÇÕES ADICIONAIS",
    "PUBLICACOES", "PUBLICATIONS",
    "PUBLICAÇÕES",
    "VOLUNTARIADO", "VOLUNTEER",
  ];

  const isSection = (line: string) => {
    const trimmed = line.trim().toUpperCase();
    return sectionHeaders.some(h => trimmed === h || trimmed.startsWith(h + " ") || trimmed.startsWith(h + ":"));
  };

  const isSubSection = (line: string) => {
    const trimmed = line.trim();
    return (
      trimmed === trimmed.toUpperCase() &&
      trimmed.length > 2 &&
      trimmed.length < 60 &&
      !trimmed.startsWith("-") &&
      !trimmed.startsWith("•") &&
      !trimmed.match(/^\d/) &&
      !isSection(trimmed)
    );
  };

  const isBullet = (line: string) => {
    const trimmed = line.trim();
    return trimmed.startsWith("- ") || trimmed.startsWith("• ") || trimmed.startsWith("* ");
  };

  const isContactLine = (line: string) => {
    return line.includes("|") || line.includes("@") || line.includes("+55") || line.includes("linkedin");
  };

  let nameProcessed = false;
  let titleProcessed = false;
  let contactProcessed = false;
  let bulletGroup = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) {
      if (bulletGroup) {
        html += `</ul>`;
        bulletGroup = false;
      }
      continue;
    }

    if (!nameProcessed && i === 0) {
      html += `<div class="candidate-name">${line}</div>`;
      nameProcessed = true;
      continue;
    }

    if (!titleProcessed && i === 1) {
      html += `<div class="candidate-title">${line}</div>`;
      titleProcessed = true;
      continue;
    }

    if (!contactProcessed && (i === 2 || isContactLine(line)) && !isSection(line)) {
      html += `<div class="contact-line">${line}</div>`;
      if (i === 2) { contactProcessed = true; }
      continue;
    }

    if (isSection(line)) {
      if (bulletGroup) { html += `</ul>`; bulletGroup = false; }
      if (inSection) html += `</div>`;
      html += `<div class="section">`;
      html += `<div class="section-header">${line}</div>`;
      html += `<div class="section-content">`;
      inSection = true;
      continue;
    }

    if (isSubSection(line)) {
      if (bulletGroup) { html += `</ul>`; bulletGroup = false; }
      html += `<div class="subsection-header">${line}</div>`;
      continue;
    }

    if (isBullet(line)) {
      const bulletText = line.replace(/^[-•*]\s+/, "");
      if (!bulletGroup) {
        html += `<ul class="bullet-list">`;
        bulletGroup = true;
      }
      html += `<li>${bulletText}</li>`;
      continue;
    }

    if (bulletGroup) {
      html += `</ul>`;
      bulletGroup = false;
    }

    // Linha de cargo/empresa (contém | ou – ou -)
    if (line.includes(" | ") || line.includes(" – ") || line.match(/\w+\s*[-–]\s*\w+/)) {
      html += `<div class="job-line">${line}</div>`;
    } else {
      html += `<p class="body-text">${line}</p>`;
    }
  }

  if (bulletGroup) html += `</ul>`;
  if (inSection) html += `</div></div>`;

  const title = lang === "en" ? "Optimized Resume" : "Currículo Otimizado";

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
    font-size: 10.5pt;
    line-height: 1.55;
    color: #1a1a2e;
    background: #ffffff;
    padding: 0;
  }

  .page {
    width: 210mm;
    min-height: 297mm;
    padding: 18mm 20mm 18mm 20mm;
    background: #ffffff;
  }

  .header {
    border-bottom: 2.5px solid #1e3a8a;
    padding-bottom: 12px;
    margin-bottom: 16px;
  }

  .candidate-name {
    font-size: 22pt;
    font-weight: 700;
    color: #1e3a8a;
    letter-spacing: -0.3px;
    line-height: 1.2;
    margin-bottom: 4px;
  }

  .candidate-title {
    font-size: 11pt;
    font-weight: 500;
    color: #374151;
    margin-bottom: 6px;
  }

  .contact-line {
    font-size: 9pt;
    color: #6b7280;
    font-weight: 400;
  }

  .section {
    margin-bottom: 14px;
    page-break-inside: avoid;
  }

  .section-header {
    font-size: 9pt;
    font-weight: 700;
    color: #1e3a8a;
    letter-spacing: 1.2px;
    text-transform: uppercase;
    border-bottom: 1px solid #dbeafe;
    padding-bottom: 4px;
    margin-bottom: 8px;
  }

  .section-content {
    padding-left: 0;
  }

  .subsection-header {
    font-size: 10pt;
    font-weight: 600;
    color: #1f2937;
    margin-top: 8px;
    margin-bottom: 3px;
  }

  .job-line {
    font-size: 10pt;
    font-weight: 600;
    color: #1f2937;
    margin-bottom: 4px;
    margin-top: 6px;
  }

  .body-text {
    font-size: 10pt;
    color: #374151;
    margin-bottom: 4px;
    text-align: justify;
  }

  .bullet-list {
    list-style: none;
    padding: 0;
    margin: 3px 0 6px 0;
  }

  .bullet-list li {
    font-size: 10pt;
    color: #374151;
    padding-left: 14px;
    position: relative;
    margin-bottom: 3px;
    line-height: 1.5;
  }

  .bullet-list li::before {
    content: "•";
    position: absolute;
    left: 0;
    color: #1e3a8a;
    font-weight: 700;
  }

  .footer {
    margin-top: 20px;
    padding-top: 8px;
    border-top: 1px solid #e5e7eb;
    font-size: 8pt;
    color: #9ca3af;
    text-align: center;
  }

  @media print {
    body { padding: 0; }
    .page { padding: 15mm 18mm; }
  }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    ${html.split('<div class="section">')[0]}
  </div>
  ${html.includes('<div class="section">') ? '<div class="sections">' + html.split('<div class="section">').slice(1).map(s => '<div class="section">' + s).join('') + '</div>' : ''}
  <div class="footer">
    Gerado por Easy Job AI — ${new Date().toLocaleDateString(lang === "en" ? "en-US" : "pt-BR", { year: "numeric", month: "long", day: "numeric" })}
  </div>
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
          printBackground: true,
          margin: { top: "0mm", bottom: "0mm", left: "0mm", right: "0mm" },
        });

        const base64 = Buffer.from(pdfBuffer).toString("base64");
        return { pdf: base64 };
      } finally {
        if (browser) await browser.close();
      }
    }),
});
