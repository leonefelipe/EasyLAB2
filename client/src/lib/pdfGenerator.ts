/**
 * pdfGenerator.ts
 * Client-side resume PDF generator — jsPDF + html2canvas.
 * Zero watermarks. ATS-friendly. Google/Amazon/Microsoft resume style.
 *
 * Signature expected by AnalysisLayout.tsx:
 *   generateResumePDF(resumeText: string, lang: "pt" | "en"): void
 */

import jsPDF from "jspdf";
import html2canvas from "html2canvas";

// ─── Section header detection ────────────────────────────────────────────────

const SECTION_HEADERS_PT = [
  "RESUMO PROFISSIONAL", "COMPETÊNCIAS PRINCIPAIS", "COMPETENCIAS PRINCIPAIS",
  "EXPERIÊNCIA PROFISSIONAL", "EXPERIENCIA PROFISSIONAL",
  "FORMAÇÃO ACADÊMICA", "FORMAÇÃO ACADÊMICA", "FORMACAO ACADEMICA",
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
  return line.includes("|") || line.includes("@") || line.includes("+55") || line.includes("linkedin");
}

// ─── HTML builder ─────────────────────────────────────────────────────────────

function buildResumeHTML(resumeText: string, lang: "pt" | "en"): string {
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

  // Split header from sections
  const sectionSplit = body.split(`<div class="section">`);
  const headerHtml = sectionSplit[0];
  const sectionsHtml = sectionSplit.length > 1
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
    color: #111;
    background: #fff;
    width: 794px;           /* A4 at 96dpi */
    padding: 52px 62px;
  }

  /* ── Header block ── */
  .resume-header { border-bottom: 2px solid #111; padding-bottom: 10px; margin-bottom: 14px; }
  .name  { font-size: 21pt; font-weight: 700; color: #111; letter-spacing: -0.2px; line-height: 1.15; margin-bottom: 3px; }
  .title { font-size: 11pt; font-weight: 500; color: #333; margin-bottom: 5px; }
  .contact { font-size: 9pt; color: #555; }

  /* ── Sections ── */
  .section { margin-bottom: 13px; }
  .sec-hdr {
    display: flex;
    align-items: center;
    gap: 7px;
    margin-bottom: 7px;
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

  /* ── Sub-headers (company / role lines) ── */
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
  .bullets li::before { content: "•"; position: absolute; left: 0; color: #111; font-weight: 700; }

  /* ── Body text ── */
  .body-p { font-size: 10pt; color: #333; margin-bottom: 3px; text-align: justify; }
</style>
</head>
<body>
<div class="resume-header">${headerHtml}</div>
${sectionsHtml}
</body>
</html>`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function generateResumePDF(resumeText: string, lang: "pt" | "en" = "pt"): Promise<void> {
  // 1. Build HTML
  const html = buildResumeHTML(resumeText, lang);

  // 2. Mount hidden iframe
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:794px;height:1123px;border:none;";
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentDocument!;
  iframeDoc.open();
  iframeDoc.write(html);
  iframeDoc.close();

  // 3. Wait for fonts / layout
  await new Promise(r => setTimeout(r, 600));

  try {
    // 4. Render to canvas
    const canvas = await html2canvas(iframeDoc.body, {
      scale: 2,               // retina quality
      useCORS: true,
      backgroundColor: "#ffffff",
      windowWidth: 794,
      logging: false,
    });

    // 5. Slice into A4 pages
    const PDF_W = 210;        // mm
    const PDF_H = 297;        // mm
    const imgW = PDF_W;
    const pxPerMm = canvas.width / PDF_W;
    const pageHeightPx = PDF_H * pxPerMm;
    const totalPages = Math.ceil(canvas.height / pageHeightPx);

    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    for (let p = 0; p < totalPages; p++) {
      if (p > 0) pdf.addPage();

      const srcY = p * pageHeightPx;
      const sliceH = Math.min(pageHeightPx, canvas.height - srcY);

      // Slice canvas
      const pageCanvas = document.createElement("canvas");
      pageCanvas.width = canvas.width;
      pageCanvas.height = sliceH;
      const ctx = pageCanvas.getContext("2d")!;
      ctx.drawImage(canvas, 0, srcY, canvas.width, sliceH, 0, 0, canvas.width, sliceH);

      const imgData = pageCanvas.toDataURL("image/png");
      const imgH = (sliceH / pxPerMm);

      pdf.addImage(imgData, "PNG", 0, 0, imgW, imgH, undefined, "FAST");
    }

    // 6. Save — no watermark, no metadata branding
    const filename = lang === "en" ? "Resume_Optimized.pdf" : "Curriculo_Otimizado.pdf";
    pdf.save(filename);

  } finally {
    document.body.removeChild(iframe);
  }
}
