/**
 * pdfGenerator.ts
 * Gerador de PDF client-side usando jsPDF + html2canvas.
 *
 * BUG CORRIGIDO: iframe com visibility:hidden impedia o html2canvas
 * de renderizar o conteúdo — o browser não processa elementos hidden.
 * Fix: opacity:0 + srcdoc + aguardar onload + ajustar altura ao conteúdo.
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

function normalize(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
}

function isSection(line: string, lang: "pt" | "en"): boolean {
  const t = normalize(line);
  const headers = (lang === "pt" ? SECTIONS_PT : SECTIONS_EN).map(normalize);
  return headers.some(h => t === h || t.startsWith(h + " ") || t.startsWith(h + ":"));
}

function isSubSection(line: string, lang: "pt" | "en"): boolean {
  const t = line.trim();
  if (t.length < 3 || t.length > 70) return false;
  if (/[a-záàâãéêíóôõúç]/i.test(t)) return false;
  return !isSection(t, lang) && !/^[-•*▪·]/.test(t) && !/^\d/.test(t);
}

function isBullet(line: string): boolean {
  return /^[-•*▪·]\s/.test(line.trim());
}

function isContact(line: string): boolean {
  return line.includes("|") || line.includes("@") ||
    line.includes("+55") || line.toLowerCase().includes("linkedin");
}

function esc(s: string): string {
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function buildHTML(resumeText: string, lang: "pt" | "en"): string {
  const lines = resumeText.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").split("\n");

  let headerHtml = "", sectionsHtml = "", currentSection = "";
  let nameDone = false, titleDone = false, contactDone = false;
  let inSection = false, bulletOpen = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (!line) {
      if (bulletOpen) { if (inSection) currentSection += "</ul>"; bulletOpen = false; }
      continue;
    }

    if (!nameDone) {
      headerHtml += `<div class="r-name">${esc(line)}</div>`;
      nameDone = true; continue;
    }

    if (!titleDone && !isSection(line, lang)) {
      headerHtml += `<div class="r-title">${esc(line)}</div>`;
      titleDone = true; continue;
    }

    if (!contactDone && isContact(line) && !isSection(line, lang)) {
      headerHtml += `<div class="r-contact">${esc(line)}</div>`;
      contactDone = true; continue;
    }

    if (isSection(line, lang)) {
      if (bulletOpen) { currentSection += "</ul>"; bulletOpen = false; }
      if (inSection)  { sectionsHtml += currentSection + "</div></div>"; }
      currentSection = `<div class="sec"><div class="sec-hdr"><span>${esc(line)}</span></div><div class="sec-body">`;
      inSection = true; contactDone = true; continue;
    }

    if (!inSection) {
      if (isContact(line)) headerHtml += `<div class="r-contact">${esc(line)}</div>`;
      continue;
    }

    if (isSubSection(line, lang)) {
      if (bulletOpen) { currentSection += "</ul>"; bulletOpen = false; }
      currentSection += `<div class="sub">${esc(line)}</div>`; continue;
    }

    if (isBullet(line)) {
      const txt = esc(line.replace(/^[-•*▪·]\s+/, ""));
      if (!bulletOpen) { currentSection += "<ul>"; bulletOpen = true; }
      currentSection += `<li>${txt}</li>`; continue;
    }

    if (bulletOpen) { currentSection += "</ul>"; bulletOpen = false; }

    if (line.includes(" | ") || line.includes(" – ") || line.includes(" - ") || line.includes("·")) {
      currentSection += `<div class="job-line">${esc(line)}</div>`;
    } else {
      currentSection += `<p>${esc(line)}</p>`;
    }
  }

  if (bulletOpen && currentSection)  currentSection  += "</ul>";
  if (inSection  && currentSection)  sectionsHtml    += currentSection + "</div></div>";

  return `<!DOCTYPE html>
<html lang="${lang}">
<head><meta charset="UTF-8"><style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,"Helvetica Neue",Helvetica,sans-serif;font-size:10.5pt;line-height:1.5;color:#111;background:#fff;width:794px;padding:48px 60px}
.r-hdr{border-bottom:1.5px solid #111;padding-bottom:10px;margin-bottom:14px}
.r-name{font-size:22pt;font-weight:700;color:#111;line-height:1.15;margin-bottom:3px}
.r-title{font-size:11pt;font-weight:400;color:#333;margin-bottom:5px}
.r-contact{font-size:9pt;color:#555}
.sec{margin-bottom:13px}
.sec-hdr{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.sec-hdr span{font-size:9pt;font-weight:700;text-transform:uppercase;letter-spacing:1.3px;color:#111;white-space:nowrap}
.sec-hdr::after{content:'';flex:1;height:1px;background:#111;display:block}
.sub{font-size:10.5pt;font-weight:700;color:#111;margin:7px 0 2px}
.job-line{font-size:10pt;font-weight:600;color:#222;margin:5px 0 3px}
ul{list-style:none;margin:3px 0 6px 0;padding:0}
li{font-size:10pt;color:#333;padding-left:14px;position:relative;margin-bottom:2px;line-height:1.45}
li::before{content:"•";position:absolute;left:0;color:#111;font-weight:700}
p{font-size:10pt;color:#333;margin-bottom:3px;text-align:justify}
</style></head>
<body>
<div class="r-hdr">${headerHtml}</div>
${sectionsHtml}
</body></html>`;
}

async function renderHTMLtoPDF(html: string): Promise<jsPDF> {
  // Cria iframe fora do ecrã com opacity:0 (não visibility:hidden)
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;top:0;left:-10000px;width:794px;height:1200px;border:none;opacity:0;pointer-events:none;z-index:-1;";
  document.body.appendChild(iframe);

  try {
    // srcdoc é mais confiável que document.write + dispara onload correctamente
    await new Promise<void>(resolve => {
      iframe.onload = () => resolve();
      iframe.srcdoc = html;
      setTimeout(resolve, 3000); // fallback
    });

    const doc = iframe.contentDocument!;
    try { await doc.fonts.ready; } catch { /* non-critical */ }

    // Ajusta altura ao conteúdo real
    const contentH = doc.body.scrollHeight;
    if (contentH > 1200) {
      iframe.style.height = `${contentH + 50}px`;
      await new Promise(r => setTimeout(r, 300));
    }

    const canvas = await html2canvas(doc.body, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      width: 794,
      windowWidth: 794,
      scrollX: 0,
      scrollY: 0,
      logging: false,
    });

    const PDF_W = 210, PDF_H = 297;
    const pxPerMm = canvas.width / PDF_W;
    const pageH   = PDF_H * pxPerMm;
    const pages   = Math.ceil(canvas.height / pageH);
    const pdf     = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    for (let p = 0; p < pages; p++) {
      if (p > 0) pdf.addPage();
      const srcY   = p * pageH;
      const sliceH = Math.min(pageH, canvas.height - srcY);
      const slice  = document.createElement("canvas");
      slice.width  = canvas.width;
      slice.height = sliceH;
      slice.getContext("2d")!.drawImage(canvas, 0, srcY, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
      pdf.addImage(slice.toDataURL("image/png"), "PNG", 0, 0, PDF_W, sliceH / pxPerMm, undefined, "FAST");
    }

    return pdf;
  } finally {
    document.body.removeChild(iframe);
  }
}

export async function generateResumePDF(
  resumeText: string,
  lang: "pt" | "en" = "pt"
): Promise<void> {
  const pdf = await renderHTMLtoPDF(buildHTML(resumeText, lang));
  pdf.save(lang === "en" ? "Resume_Optimized.pdf" : "Curriculo_Otimizado.pdf");
}
