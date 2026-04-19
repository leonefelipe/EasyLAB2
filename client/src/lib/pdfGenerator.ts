/**
 * pdfGenerator.ts
 * Gerador de PDF client-side usando jsPDF + html2canvas.
 * Roda no browser. Zero watermarks. Layout profissional.
 *
 * Chamado por AnalysisLayout.tsx:
 *   generateResumePDF(resumeText: string, lang: "pt" | "en"): Promise<void>
 */

import jsPDF from "jspdf";
import html2canvas from "html2canvas";

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

function buildHTML(resumeText: string, lang: "pt" | "en"): string {
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
  width: 794px;
  padding: 48px 60px;
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

.sec { margin-bottom: 13px; }

.sec-hdr {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
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
</style>
</head>
<body>
<div class="r-hdr">${headerHtml}</div>
${sectionsHtml}
</body>
</html>`;
}

export async function generateResumePDF(
  resumeText: string,
  lang: "pt" | "en" = "pt"
): Promise<void> {
  const html = buildHTML(resumeText, lang);

  const iframe = document.createElement("iframe");
  iframe.style.cssText =
    "position:fixed;top:-9999px;left:-9999px;width:794px;height:1200px;border:none;visibility:hidden;";
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument!;
  doc.open();
  doc.write(html);
  doc.close();

  await new Promise(r => setTimeout(r, 800));

  try {
    const canvas = await html2canvas(doc.body, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      windowWidth: 794,
      logging: false,
    });

    const PDF_W = 210;
    const PDF_H = 297;
    const pxPerMm = canvas.width / PDF_W;
    const pageH = PDF_H * pxPerMm;
    const pages = Math.ceil(canvas.height / pageH);

    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    for (let p = 0; p < pages; p++) {
      if (p > 0) pdf.addPage();
      const srcY = p * pageH;
      const sliceH = Math.min(pageH, canvas.height - srcY);
      const slice = document.createElement("canvas");
      slice.width = canvas.width;
      slice.height = sliceH;
      slice.getContext("2d")!.drawImage(
        canvas, 0, srcY, canvas.width, sliceH, 0, 0, canvas.width, sliceH
      );
      pdf.addImage(
        slice.toDataURL("image/png"), "PNG",
        0, 0, PDF_W, sliceH / pxPerMm,
        undefined, "FAST"
      );
    }

    const filename = lang === "en" ? "Resume_Optimized.pdf" : "Curriculo_Otimizado.pdf";
    pdf.save(filename);
  } finally {
    document.body.removeChild(iframe);
  }
}
