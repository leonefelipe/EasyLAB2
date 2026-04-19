/**
 * pdfGenerator.ts
 * Gera o PDF do CV optimizado usando browser print rendering.
 * SEM html2canvas — solução mais robusta e sem problemas de renderização.
 */

function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const SECTIONS_PT = [
  "RESUMO PROFISSIONAL","COMPETÊNCIAS PRINCIPAIS","COMPETENCIAS PRINCIPAIS",
  "EXPERIÊNCIA PROFISSIONAL","EXPERIENCIA PROFISSIONAL",
  "FORMAÇÃO ACADÊMICA","FORMACAO ACADEMICA",
  "IDIOMAS","CERTIFICAÇÕES","CERTIFICACOES","HABILIDADES",
  "CURSOS","INFORMAÇÕES ADICIONAIS","INFORMACOES ADICIONAIS",
  "PUBLICAÇÕES","PUBLICACOES","VOLUNTARIADO","PROJETOS",
];

function normalize(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
}

function isSection(line: string): boolean {
  const t = normalize(line);
  return SECTIONS_PT.map(normalize).some(h => t === h || t.startsWith(h + " ") || t.startsWith(h + ":"));
}

function isBullet(line: string): boolean {
  return /^[-•*▪·]\s/.test(line.trim());
}

function isContact(line: string): boolean {
  return line.includes("|") || line.includes("@") ||
    line.includes("+55") || line.toLowerCase().includes("linkedin");
}

function buildPrintHTML(resumeText: string): string {
  const lines = resumeText.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").split("\n");

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
      if (bulletOpen) { if (inSection) currentSection += "</ul>"; bulletOpen = false; }
      continue;
    }

    if (!nameDone) {
      headerHtml += `<div class="r-name">${esc(line)}</div>`;
      nameDone = true; continue;
    }

    if (!titleDone && !isSection(line)) {
      headerHtml += `<div class="r-title">${esc(line)}</div>`;
      titleDone = true; continue;
    }

    if (!contactDone && isContact(line) && !isSection(line)) {
      headerHtml += `<div class="r-contact">${esc(line)}</div>`;
      contactDone = true; continue;
    }

    if (isSection(line)) {
      if (bulletOpen) { currentSection += "</ul>"; bulletOpen = false; }
      if (inSection) { sectionsHtml += currentSection + "</div></div>"; }
      currentSection = `<div class="sec"><div class="sec-hdr"><span>${esc(line)}</span></div><div class="sec-body">`;
      inSection = true; contactDone = true; continue;
    }

    if (!inSection) {
      if (isContact(line)) headerHtml += `<div class="r-contact">${esc(line)}</div>`;
      continue;
    }

    // Sub-section detection: ALL CAPS line without bullets
    const t = line.trim();
    const isSubSec = t.length >= 3 && t.length <= 70 && t === t.toUpperCase() &&
      /[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ]/.test(t) && !isBullet(t) && !/^\d/.test(t) && !isSection(t);

    if (isSubSec) {
      if (bulletOpen) { currentSection += "</ul>"; bulletOpen = false; }
      currentSection += `<div class="sub">${esc(t)}</div>`; continue;
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

  if (bulletOpen && currentSection) currentSection += "</ul>";
  if (inSection && currentSection) sectionsHtml += currentSection + "</div></div>";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Currículo Optimizado</title>
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  @page{size:A4;margin:18mm 20mm 18mm 20mm}
  body{font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;font-size:10.5pt;line-height:1.5;color:#111;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}

  .r-hdr{border-bottom:2px solid #111;padding-bottom:10px;margin-bottom:14px;page-break-inside:avoid}
  .r-name{font-size:22pt;font-weight:700;color:#111;line-height:1.15;margin-bottom:3px}
  .r-title{font-size:11pt;font-weight:400;color:#333;margin-bottom:5px}
  .r-contact{font-size:9pt;color:#555}

  .sec{margin-bottom:13px;page-break-inside:avoid}
  .sec-hdr{display:flex;align-items:center;gap:8px;margin-bottom:8px}
  .sec-hdr span{font-size:9pt;font-weight:700;text-transform:uppercase;letter-spacing:1.3px;color:#111;white-space:nowrap}
  .sec-hdr::after{content:'';flex:1;height:1px;background:#111;display:block}
  .sec-body{page-break-inside:avoid}

  .sub{font-size:10.5pt;font-weight:700;color:#111;margin:7px 0 2px}
  .job-line{font-size:10pt;font-weight:600;color:#222;margin:5px 0 3px}
  ul{list-style:none;margin:3px 0 6px 0;padding:0}
  li{font-size:10pt;color:#333;padding-left:14px;position:relative;margin-bottom:2px;line-height:1.45}
  li::before{content:"•";position:absolute;left:0;color:#111;font-weight:700}
  p{font-size:10pt;color:#333;margin-bottom:3px;text-align:justify}

  @media screen{
    body{background:#94a3b8;padding:20px}
    .page-wrap{background:#fff;width:210mm;margin:0 auto;padding:18mm 20mm;box-shadow:0 4px 32px rgba(0,0,0,.2)}
  }
  @media print{
    body{background:#fff!important}
    .page-wrap{padding:0;margin:0;box-shadow:none}
  }
</style>
</head>
<body>
<div class="page-wrap">
  <div class="r-hdr">${headerHtml}</div>
  ${sectionsHtml}
</div>
</body>
</html>`;
}

export async function generateResumePDF(
  resumeText: string,
  _lang: "pt" | "en" = "pt"
): Promise<void> {
  const html = buildPrintHTML(resumeText);

  const win = window.open("", "_blank", "width=900,height=750,scrollbars=yes");
  if (!win) {
    // Fallback: download HTML file
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "Curriculo_Otimizado.html";
    a.click();
    URL.revokeObjectURL(url);
    return;
  }

  win.document.write(html);
  win.document.close();

  const doPrint = () => {
    if (!win.closed) {
      win.focus();
      win.print();
      win.onafterprint = () => win.close();
    }
  };

  if (win.document.readyState === "complete") {
    setTimeout(doPrint, 600);
  } else {
    win.addEventListener("load", () => setTimeout(doPrint, 500));
    setTimeout(doPrint, 2000);
  }
}
