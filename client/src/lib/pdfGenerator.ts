/**
 * pdfGenerator.ts
 * Client-side resume PDF generator — jsPDF + html2canvas.
 * Runs in the browser. Zero watermarks. ATS-friendly.
 *
 * Called by AnalysisLayout.tsx:
 *   generateResumePDF(resumeText: string, lang: "pt" | "en"): Promise<void>
 */

import jsPDF from "jspdf";
import html2canvas from "html2canvas";

// ─── Section detection ────────────────────────────────────────────────────────

const SECTIONS_PT = [
  "RESUMO PROFISSIONAL", "COMPETÊNCIAS PRINCIPAIS", "COMPETENCIAS PRINCIPAIS",
  "EXPERIÊNCIA PROFISSIONAL", "EXPERIENCIA PROFISSIONAL",
  "FORMAÇÃO ACADÊMICA", "FORMACAO ACADEMICA", "FORMAÇÃO ACADÊMICA",
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
    t.length > 2 &&
    t.length < 60 &&
    t === t.toUpperCase() &&
    !t.startsWith("-") &&
    !t.startsWith("•") &&
    !/^\d/.test(t) &&
    !isSection(t, lang)
  );
}

function isBullet(line: string): boolean {
  return /^[-•*▪·]\s/.test(line.trim());
}

function isContact(line: string): boolean {
  return (
    line.includes("|") ||
    line.includes("@") ||
    line.includes("+55") ||
    line.toLowerCase().includes("linkedin")
  );
}

// ─── HTML builder ─────────────────────────────────────────────────────────────

function buildHTML(resumeText: string, lang: "pt" | "en"): string {
  const lines = resumeText.split("\n");
  let body = "";
  let inSection = false;
  let bulletOpen = false;
  let nameDone = false;
  let titleDone = false;
  let contactDone = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (!line) {
      if (bulletOpen) { body += `</ul>`; bulletOpen = false; }
      continue;
    }

    if (!nameDone && i === 0) {
      body += `<div class="r-name">${line}</div>`;
      nameDone = true;
      continue;
    }

    if (!titleDone && i === 1 && !isSection(line, lang)) {
      body += `<div class="r-role">${line}</div>`;
      titleDone = true;
      continue;
    }

    if (!contactDone && (i === 2 || isContact(line)) && !isSection(line, lang)) {
      body += `<div class="r-contact">${line}</div>`;
      if (i === 2) contactDone = true;
      continue;
    }

    if (isSection(line, lang)) {
      if (bulletOpen) { body += `</ul>`; bulletOpen = false; }
      if (inSection) body += `</div>`;
      body += `<div class="sec"><div class="sec-h"><span>${line}</span><hr/></div><div class="sec-b">`;
      inSection = true;
      continue;
    }

    if (isSubSection(line, lang)) {
      if (bulletOpen) { body += `</ul>`; bulletOpen = false; }
      body += `<div class="sub">${line}</div>`;
      continue;
    }

    if (isBullet(line)) {
      const txt = line.replace(/^[-•*▪·]\s+/, "");
      if (!bulletOpen) { body += `<ul>`; bulletOpen = true; }
      body += `<li>${txt}</li>`;
      continue;
    }

    if (bulletOpen) { body += `</ul>`; bulletOpen = false; }

    if (line.includes(" | ") || line.includes(" – ") || /\w[\s]*[-–][\s]*\w/.test(line)) {
      body += `<div class="jline">${line}</div>`;
    } else {
      body += `<p>${line}</p>`;
    }
  }

  if (bulletOpen) body += `</ul>`;
  if (inSection) body += `</div></div>`;

  const parts = body.split(`<div class="sec">`);
  const hdr = parts[0];
  const secs = parts.slice(1).map(s => `<div class="sec">${s}`).join("");

  return `<!DOCTYPE html>
<html lang="${lang}">
<head><meta charset="UTF-8">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;font-size:10.5pt;line-height:1.5;color:#111;background:#fff;width:794px;padding:50px 60px}
.r-hdr{border-bottom:1.8px solid #111;padding-bottom:9px;margin-bottom:13px}
.r-name{font-size:21pt;font-weight:700;color:#111;line-height:1.15;margin-bottom:3px;letter-spacing:-0.2px}
.r-role{font-size:11pt;font-weight:500;color:#333;margin-bottom:5px}
.r-contact{font-size:9pt;color:#555}
.sec{margin-bottom:12px}
.sec-h{display:flex;align-items:center;gap:7px;margin-bottom:7px}
.sec-h span{font-size:9pt;font-weight:700;text-transform:uppercase;letter-spacing:1.1px;color:#111;white-space:nowrap}
.sec-h hr{flex:1;border:none;border-top:1px solid #111;margin:0}
.sub{font-size:10.5pt;font-weight:600;color:#111;margin:7px 0 2px}
.jline{font-size:10pt;font-weight:600;color:#222;margin:5px 0 3px}
ul{list-style:none;margin:2px 0 5px;padding:0}
li{font-size:10pt;color:#333;padding-left:13px;position:relative;margin-bottom:2px;line-height:1.45}
li::before{content:"•";position:absolute;left:0;color:#111;font-weight:700}
p{font-size:10pt;color:#333;margin-bottom:3px;text-align:justify}
</style>
</head>
<body>
<div class="r-hdr">${hdr}</div>
${secs}
</body></html>`;
}

// ─── Public export ────────────────────────────────────────────────────────────

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

  await new Promise(r => setTimeout(r, 700));

  try {
    const canvas = await html2canvas(doc.body, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      windowWidth: 794,
      logging: false,
    });

    const PDF_W_MM = 210;
    const PDF_H_MM = 297;
    const pxPerMm = canvas.width / PDF_W_MM;
    const pageHeightPx = PDF_H_MM * pxPerMm;
    const totalPages = Math.ceil(canvas.height / pageHeightPx);

    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    for (let p = 0; p < totalPages; p++) {
      if (p > 0) pdf.addPage();
      const srcY = p * pageHeightPx;
      const sliceH = Math.min(pageHeightPx, canvas.height - srcY);
      const slice = document.createElement("canvas");
      slice.width = canvas.width;
      slice.height = sliceH;
      slice.getContext("2d")!.drawImage(canvas, 0, srcY, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
      pdf.addImage(slice.toDataURL("image/png"), "PNG", 0, 0, PDF_W_MM, sliceH / pxPerMm, undefined, "FAST");
    }

    pdf.save(lang === "en" ? "Resume_Optimized.pdf" : "Curriculo_Otimizado.pdf");
  } finally {
    document.body.removeChild(iframe);
  }
}
