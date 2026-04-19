/**
 * pdfGenerator.ts
 * Gera o CV optimizado em formato 100% ATS-friendly via browser print.
 *
 * Compatível com: Gupy, Recrut.AI, Vagas.com.br, LinkedIn, Panda Pé,
 * Workday, Taleo, SAP SuccessFactors, Indeed, Catho, InfoJobs.
 *
 * Princípios ATS:
 *  - Coluna única, sem tabelas, sem colunas, sem ícones
 *  - Fontes padrão (Arial / Helvetica)
 *  - Cabeçalhos em MAIÚSCULAS com linha separadora simples
 *  - Bullets com hífen simples
 *  - Todo texto seleccionável (não imagem)
 *  - Margens A4 standard: 20mm laterais, 18mm topo/base
 */

function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Normaliza texto para comparar com headers conhecidos
function norm(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
}

const KNOWN_SECTIONS = [
  "RESUMO PROFISSIONAL","COMPETENCIAS PRINCIPAIS","COMPETENCIAS","HABILIDADES",
  "EXPERIENCIA PROFISSIONAL","EXPERIENCIAS","FORMACAO ACADEMICA","FORMACAO",
  "IDIOMAS","CERTIFICACOES","CERTIFICADOS","CURSOS","PROJETOS","PUBLICACOES",
  "VOLUNTARIADO","INFORMACOES ADICIONAIS","PREMIOS","CONQUISTAS","ATIVIDADES",
  "PROFESSIONAL SUMMARY","CORE COMPETENCIES","PROFESSIONAL EXPERIENCE",
  "EDUCATION","LANGUAGES","CERTIFICATIONS","SKILLS","COURSES","AWARDS",
];

function isKnownSection(line: string): boolean {
  const t = norm(line);
  return KNOWN_SECTIONS.some(h => t === h || t === h + ":" || t === h + " ");
}

function isBulletLine(line: string): boolean {
  return /^[-•*▪·✓→►]\s/.test(line.trim());
}

function isContactLine(line: string): boolean {
  const l = line.toLowerCase();
  return l.includes("@") || l.includes("+55") || l.includes("linkedin.com") ||
    l.includes("(11)") || l.includes("(21)") || l.includes("whatsapp") ||
    (line.includes("|") && (l.includes("sp") || l.includes("rj") || l.includes("paulo")));
}

function isJobLine(line: string): boolean {
  return line.includes(" | ") || line.includes(" – ") ||
    (line.includes(" - ") && /\d{4}/.test(line));
}

function buildResumeHTML(resumeText: string): string {
  const raw = resumeText.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  const lines = raw.split("\n");

  let nameHtml = "";
  let titleHtml = "";
  let contactHtml = "";
  let bodyHtml = "";

  let nameDone = false;
  let titleDone = false;
  let contactDone = false;
  let inSection = false;
  let currentSectionTitle = "";
  let sectionBody = "";
  let inBulletList = false;

  function flushSection() {
    if (!currentSectionTitle) return;
    if (inBulletList) { sectionBody += `</ul>`; inBulletList = false; }
    bodyHtml += `
      <div class="section">
        <div class="section-header">${esc(currentSectionTitle)}</div>
        ${sectionBody}
      </div>`;
    sectionBody = "";
    currentSectionTitle = "";
  }

  for (let i = 0; i < lines.length; i++) {
    const raw_line = lines[i];
    const line = raw_line.trim();

    // Skip blank lines inside sections (we'll manage spacing via CSS)
    if (!line) {
      if (inBulletList && inSection) {
        sectionBody += `</ul>`;
        inBulletList = false;
      }
      continue;
    }

    // ── Header zone (before first section) ──────────────────────────
    if (!nameDone) {
      nameHtml = `<div class="resume-name">${esc(line)}</div>`;
      nameDone = true;
      continue;
    }

    if (!titleDone && !isKnownSection(line) && !isContactLine(line)) {
      titleHtml = `<div class="resume-title">${esc(line)}</div>`;
      titleDone = true;
      continue;
    }

    if (!contactDone && isContactLine(line) && !isKnownSection(line)) {
      contactHtml = `<div class="resume-contact">${esc(line)}</div>`;
      contactDone = true;
      continue;
    }

    // If we're still in the pre-section header zone
    if (!inSection && !isKnownSection(line)) {
      // Extra contact/info lines before first section
      if (isContactLine(line)) {
        contactHtml += `<div class="resume-contact">${esc(line)}</div>`;
      }
      continue;
    }

    // ── Section detection ─────────────────────────────────────────────
    if (isKnownSection(line)) {
      flushSection();
      inSection = true;
      contactDone = true;
      currentSectionTitle = line;
      continue;
    }

    if (!inSection) continue;

    // ── Inside a section ──────────────────────────────────────────────

    // Sub-section (ALL CAPS, short, not a main header)
    const isAllCaps = line.length >= 3 && line.length <= 80 &&
      line === line.toUpperCase() && /[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ]/.test(line) &&
      !isBulletLine(line) && !/^\d/.test(line);

    if (isAllCaps && !isKnownSection(line)) {
      if (inBulletList) { sectionBody += `</ul>`; inBulletList = false; }
      sectionBody += `<div class="subsection">${esc(line)}</div>`;
      continue;
    }

    // Job/experience line (Company | Role | Period)
    if (isJobLine(line)) {
      if (inBulletList) { sectionBody += `</ul>`; inBulletList = false; }
      sectionBody += `<div class="job-line">${esc(line)}</div>`;
      continue;
    }

    // Bullet point
    if (isBulletLine(line)) {
      const text = line.replace(/^[-•*▪·✓→►]\s+/, "").trim();
      if (!inBulletList) { sectionBody += `<ul>`; inBulletList = true; }
      sectionBody += `<li>${esc(text)}</li>`;
      continue;
    }

    // Regular paragraph
    if (inBulletList) { sectionBody += `</ul>`; inBulletList = false; }
    sectionBody += `<p>${esc(line)}</p>`;
  }

  // Flush the last section
  flushSection();

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Currículo Optimizado — ATS Ready</title>
<style>
  /* ── Reset ── */
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  /* ── Print page setup ── */
  @page {
    size: A4;
    margin: 18mm 20mm 18mm 20mm;
  }

  /* ── Base ── */
  body {
    font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif;
    font-size: 10.5pt;
    line-height: 1.45;
    color: #000000;
    background: #ffffff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* ── Screen wrapper (print ignores padding from @page) ── */
  .page-wrap {
    max-width: 794px;
    margin: 0 auto;
  }

  /* ── Header ── */
  .resume-header {
    text-align: center;
    padding-bottom: 10pt;
    margin-bottom: 10pt;
    border-bottom: 1.5pt solid #000000;
  }

  .resume-name {
    font-size: 20pt;
    font-weight: 700;
    letter-spacing: 0.5pt;
    color: #000000;
    margin-bottom: 3pt;
    text-transform: uppercase;
  }

  .resume-title {
    font-size: 10.5pt;
    font-weight: 400;
    color: #111111;
    margin-bottom: 4pt;
  }

  .resume-contact {
    font-size: 9.5pt;
    color: #222222;
    margin-bottom: 2pt;
  }

  /* ── Sections ── */
  .section {
    margin-bottom: 10pt;
    page-break-inside: avoid;
  }

  .section-header {
    font-size: 9.5pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1.2pt;
    color: #000000;
    padding-bottom: 2pt;
    margin-bottom: 6pt;
    border-bottom: 1pt solid #000000;
  }

  /* ── Sub-sections (category labels inside Competências) ── */
  .subsection {
    font-size: 10pt;
    font-weight: 700;
    color: #000000;
    margin-top: 6pt;
    margin-bottom: 3pt;
  }

  /* ── Job lines (Company | Role | Period) ── */
  .job-line {
    font-size: 10.5pt;
    font-weight: 700;
    color: #000000;
    margin-top: 7pt;
    margin-bottom: 3pt;
  }

  /* ── Bullet lists ── */
  ul {
    list-style: none;
    margin: 2pt 0 6pt 0;
    padding: 0;
  }

  li {
    font-size: 10pt;
    color: #111111;
    padding-left: 14pt;
    position: relative;
    margin-bottom: 2pt;
    line-height: 1.45;
    page-break-inside: avoid;
  }

  li::before {
    content: "-";
    position: absolute;
    left: 0;
    font-weight: 700;
    color: #000000;
  }

  /* ── Paragraphs ── */
  p {
    font-size: 10pt;
    color: #111111;
    margin-bottom: 3pt;
    line-height: 1.5;
    text-align: justify;
  }

  /* ── Screen-only styles ── */
  @media screen {
    body {
      background: #e2e8f0;
      padding: 24px;
    }
    .page-wrap {
      background: #ffffff;
      padding: 20mm;
      box-shadow: 0 4px 40px rgba(0, 0, 0, 0.18);
      border-radius: 2px;
    }
  }

  /* ── Print overrides ── */
  @media print {
    body {
      background: #ffffff !important;
    }
    .page-wrap {
      padding: 0;
      box-shadow: none;
    }
  }
</style>
</head>
<body>
<div class="page-wrap">
  <div class="resume-header">
    ${nameHtml}
    ${titleHtml}
    ${contactHtml}
  </div>
  ${bodyHtml}
</div>
</body>
</html>`;
}

export async function generateResumePDF(
  resumeText: string,
  _lang: "pt" | "en" = "pt"
): Promise<void> {
  const html = buildResumeHTML(resumeText);

  const win = window.open("", "_blank", "width=900,height=800,scrollbars=yes");
  if (!win) {
    // Fallback: download HTML
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "Curriculo_Otimizado_ATS.html";
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

  // Wait for fonts and layout to settle
  if (win.document.readyState === "complete") {
    setTimeout(doPrint, 800);
  } else {
    win.addEventListener("load", () => setTimeout(doPrint, 700));
    setTimeout(doPrint, 2500); // fallback
  }
}
