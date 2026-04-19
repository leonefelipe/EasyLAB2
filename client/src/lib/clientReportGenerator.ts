/**
 * clientReportGenerator.ts
 * Gera o PDF de entrega profissional para o cliente.
 * Usa jsPDF + html2canvas — mesma correcção do pdfGenerator.ts.
 *
 * BUG CORRIGIDO: visibility:hidden → opacity:0 + srcdoc + onload
 */

import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import type { AnalysisResult } from "@/components/AnalysisLayout";

function scoreColor(score: number): string {
  if (score >= 75) return "#16a34a";
  if (score >= 55) return "#d97706";
  return "#dc2626";
}

function scoreLabel(score: number): string {
  if (score >= 80) return "Excelente";
  if (score >= 65) return "Bom";
  if (score >= 50) return "Regular";
  return "Precisa melhorar";
}

function fmtBRL(n: number): string {
  return new Intl.NumberFormat("pt-BR").format(n);
}

function today(): string {
  return new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

function buildReportHTML(results: AnalysisResult, clientName: string): string {
  const ats       = results.atsScore ?? results.matchScore ?? 0;
  const projected = results.projectedMatchScore ?? 0;
  const gain      = projected - ats;
  const color     = scoreColor(ats);
  const label     = scoreLabel(ats);
  const salary    = results.salaryRange;
  const hasSalary = salary && salary.cltMin > 0;

  const breakdownRows = results.atsScoreBreakdown ? [
    ["Parseabilidade ATS",       results.atsScoreBreakdown.parsing,          20],
    ["Match de palavras-chave",  results.atsScoreBreakdown.keywordMatch,      25],
    ["Qualidade da experiência", results.atsScoreBreakdown.experienceQuality, 20],
    ["Métricas de impacto",      results.atsScoreBreakdown.impactMetrics,     15],
    ["Formatação",               results.atsScoreBreakdown.formatting,        10],
    ["Alinhamento de skills",    results.atsScoreBreakdown.skillsAlignment,   10],
  ] : [];

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',Arial,sans-serif;font-size:10pt;color:#1a1a2e;background:#fff;width:794px;padding:0}

/* Capa */
.cover{background:linear-gradient(135deg,#0f172a 0%,#1e3a8a 60%,#1d4ed8 100%);color:#fff;padding:56px 56px 44px;position:relative;overflow:hidden}
.cover::after{content:'';position:absolute;top:-40px;right:-40px;width:220px;height:220px;border-radius:50%;background:rgba(255,255,255,0.05)}
.cover-tag{font-size:7.5pt;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:#93c5fd;margin-bottom:12px}
.cover-name{font-size:26pt;font-weight:700;line-height:1.15;color:#fff;margin-bottom:8px}
.cover-sub{font-size:10pt;color:#bfdbfe;margin-bottom:20px}
.cover-meta{font-size:8pt;color:#93c5fd;padding-top:14px;border-top:1px solid rgba(255,255,255,0.15)}

/* Body */
.body{padding:36px 56px}

/* Score hero */
.score-hero{display:flex;align-items:center;gap:28px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:22px 26px;margin-bottom:26px}
.score-ring{width:82px;height:82px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:20pt;font-weight:700;color:#fff}
.score-info h2{font-size:12pt;font-weight:600;color:#1e293b;margin-bottom:4px}
.score-info p{font-size:9pt;color:#64748b;line-height:1.5}
.score-pills{display:flex;gap:8px;margin-top:8px;flex-wrap:wrap}
.pill{font-size:8pt;font-weight:500;padding:3px 10px;border-radius:20px}
.pill-green{background:#dcfce7;color:#166534}
.pill-blue{background:#dbeafe;color:#1e40af}
.pill-amber{background:#fef3c7;color:#92400e}

/* Secções */
.section{margin-bottom:22px}
.section-title{font-size:8pt;font-weight:700;text-transform:uppercase;letter-spacing:1.4px;color:#1e3a8a;border-bottom:2px solid #1e3a8a;padding-bottom:5px;margin-bottom:12px}

/* Barras de progresso */
.bar-row{margin-bottom:9px}
.bar-label{display:flex;justify-content:space-between;font-size:8.5pt;color:#334155;margin-bottom:3px}
.bar-track{height:6px;background:#e2e8f0;border-radius:4px;overflow:hidden}
.bar-fill{height:100%;border-radius:4px}

/* Tags */
.tag-cloud{display:flex;flex-wrap:wrap;gap:5px}
.tag{font-size:8pt;font-weight:500;padding:3px 9px;border-radius:6px;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe}
.tag-miss{background:#fff7ed;color:#9a3412;border:1px solid #fed7aa}

/* Listas */
.check-list{list-style:none}
.check-list li{font-size:9pt;color:#334155;padding:4px 0 4px 18px;border-bottom:1px solid #f1f5f9;position:relative;line-height:1.5}
.check-list li::before{content:'✓';position:absolute;left:0;color:#16a34a;font-weight:700}
.risk-list li::before{content:'!';color:#dc2626}

/* Salário */
.salary-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.salary-card{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:13px 15px}
.salary-card .s-label{font-size:7.5pt;color:#64748b;margin-bottom:3px}
.salary-card .s-range{font-size:12pt;font-weight:600;color:#1e293b}
.salary-card .s-sub{font-size:7.5pt;color:#94a3b8;margin-top:2px}

/* Perfil recrutador */
.rp-box{background:#fafafa;border-left:3px solid #1e3a8a;border-radius:0 8px 8px 0;padding:12px 15px;margin-bottom:10px}
.rp-label{font-size:7.5pt;font-weight:600;color:#64748b;margin-bottom:3px;text-transform:uppercase;letter-spacing:0.8px}
.rp-text{font-size:9pt;color:#334155;line-height:1.5}

/* Rodapé */
.footer{margin-top:28px;padding-top:14px;border-top:1px solid #e2e8f0;font-size:7.5pt;color:#94a3b8;text-align:center}
.footer strong{color:#1e3a8a}
</style>
</head>
<body>

<div class="cover">
  <div class="cover-tag">Relatório de Reposicionamento de Carreira</div>
  <div class="cover-name">${clientName}</div>
  <div class="cover-sub">
    ${results.jobTitle ? `Análise para: <strong style="color:#fff">${results.jobTitle}</strong>` : "Análise de CV e Perfil Profissional"}
    ${results.seniorityLevel ? ` · ${results.seniorityLevel}` : ""}
  </div>
  <div class="cover-meta">Emitido em ${today()} &nbsp;·&nbsp; Leone Consultoria de Carreira</div>
</div>

<div class="body">

<div class="score-hero">
  <div class="score-ring" style="background:${color}">${Math.round(ats)}</div>
  <div class="score-info">
    <h2>Score ATS: ${label}</h2>
    <p>
      CV analisado contra os principais sistemas de triagem automática (ATS)
      ${results.jobTitle ? `para a vaga de <strong>${results.jobTitle}</strong>` : ""}.
      ${gain > 0 ? `Com as optimizações aplicadas, o score projectado sobe para <strong>${Math.round(projected)}</strong> (+${Math.round(gain)} pts).` : ""}
    </p>
    <div class="score-pills">
      <span class="pill pill-blue">Score actual: ${Math.round(ats)}</span>
      ${gain > 0 ? `<span class="pill pill-green">Score projectado: ${Math.round(projected)}</span>` : ""}
      ${results.seniorityLevel ? `<span class="pill pill-amber">${results.seniorityLevel}</span>` : ""}
    </div>
  </div>
</div>

${breakdownRows.length > 0 ? `
<div class="section">
  <div class="section-title">Análise detalhada ATS</div>
  ${breakdownRows.map(([lbl, val, max]) => {
    const pct = Math.round(((val as number) / (max as number)) * 100);
    const c   = pct >= 75 ? "#16a34a" : pct >= 50 ? "#d97706" : "#dc2626";
    return `<div class="bar-row">
      <div class="bar-label"><span>${lbl}</span><span style="font-weight:600;color:${c}">${val}/${max}</span></div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${c}"></div></div>
    </div>`;
  }).join("")}
</div>` : ""}

${results.strengths?.length ? `
<div class="section">
  <div class="section-title">Pontos fortes identificados</div>
  <ul class="check-list">${results.strengths.slice(0, 6).map(s => `<li>${s}</li>`).join("")}</ul>
</div>` : ""}

${results.keywords?.length ? `
<div class="section">
  <div class="section-title">Palavras-chave no CV</div>
  <div class="tag-cloud">${results.keywords.slice(0, 20).map(k => `<span class="tag">${k}</span>`).join("")}</div>
</div>` : ""}

${results.missingKeywords?.length ? `
<div class="section">
  <div class="section-title">Palavras-chave a adicionar</div>
  <div class="tag-cloud">${results.missingKeywords.slice(0, 16).map(k => `<span class="tag tag-miss">${k}</span>`).join("")}</div>
</div>` : ""}

${results.competitiveEdges?.length ? `
<div class="section">
  <div class="section-title">Vantagens competitivas</div>
  <ul class="check-list">${results.competitiveEdges.slice(0, 5).map(e => `<li>${e}</li>`).join("")}</ul>
</div>` : ""}

${results.competitiveRisks?.length ? `
<div class="section">
  <div class="section-title">Pontos de atenção</div>
  <ul class="check-list risk-list">${results.competitiveRisks.slice(0, 4).map(r => `<li>${r}</li>`).join("")}</ul>
</div>` : ""}

${hasSalary ? `
<div class="section">
  <div class="section-title">Inteligência salarial de mercado</div>
  <div class="salary-grid">
    <div class="salary-card">
      <div class="s-label">Regime CLT — Faixa mensal bruta</div>
      <div class="s-range">R$ ${fmtBRL(salary!.cltMin)} – R$ ${fmtBRL(salary!.cltMax)}</div>
      <div class="s-sub">Confiança: ${salary!.confidence === "high" ? "Alta" : salary!.confidence === "medium" ? "Média" : "Baixa"}</div>
    </div>
    <div class="salary-card">
      <div class="s-label">Regime PJ — Faixa mensal</div>
      <div class="s-range">R$ ${fmtBRL(salary!.pjMin)} – R$ ${fmtBRL(salary!.pjMax)}</div>
      <div class="s-sub">Multiplicador 1.35–1.50×</div>
    </div>
  </div>
  ${salary!.rationale ? `<p style="font-size:8.5pt;color:#64748b;margin-top:9px;line-height:1.5">${salary!.rationale}</p>` : ""}
</div>` : ""}

${results.recruiterProfile ? `
<div class="section">
  <div class="section-title">Perfil do recrutador-alvo</div>
  <div class="rp-box">
    <div class="rp-label">Narrativa ideal</div>
    <div class="rp-text">${results.recruiterProfile.idealNarrative}</div>
  </div>
  ${results.recruiterProfile.recruiterTriggers?.length ? `
  <div class="rp-box" style="border-left-color:#16a34a">
    <div class="rp-label">O que atrai o recrutador</div>
    <div class="rp-text">${results.recruiterProfile.recruiterTriggers.slice(0,3).join(" · ")}</div>
  </div>` : ""}
  ${results.recruiterProfile.recruiterFears?.length ? `
  <div class="rp-box" style="border-left-color:#dc2626">
    <div class="rp-label">O que preocupa o recrutador</div>
    <div class="rp-text">${results.recruiterProfile.recruiterFears.slice(0,3).join(" · ")}</div>
  </div>` : ""}
</div>` : ""}

${results.negotiationTips?.length ? `
<div class="section">
  <div class="section-title">Dicas de negociação salarial</div>
  <ul class="check-list">${results.negotiationTips.slice(0,4).map(t => `<li>${t}</li>`).join("")}</ul>
</div>` : ""}

<div class="section">
  <div class="section-title">Próximos passos recomendados</div>
  <ul class="check-list">
    <li>Substituir o CV original pelo CV optimizado entregue em anexo</li>
    <li>Actualizar o headline do LinkedIn com as palavras-chave identificadas</li>
    <li>Adicionar as palavras-chave em falta na secção "Sobre" e nas experiências</li>
    ${results.missingKeywords?.length ? `<li>Incorporar gradualmente: ${results.missingKeywords.slice(0,4).join(", ")}</li>` : ""}
    <li>Solicitar recomendações de ex-gestores no LinkedIn</li>
  </ul>
</div>

<div class="footer">
  Relatório confidencial preparado por <strong>Leone Consultoria de Carreira</strong> &nbsp;·&nbsp;
  Análise gerada com tecnologia proprietária de inteligência de mercado &nbsp;·&nbsp; ${today()}
</div>

</div>
</body>
</html>`;
}

export async function generateClientReport(
  results: AnalysisResult,
  clientName: string = "Candidato"
): Promise<void> {
  const html = buildReportHTML(results, clientName);

  // FIX: opacity:0 em vez de visibility:hidden + srcdoc + onload
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;top:0;left:-10000px;width:794px;height:2000px;border:none;opacity:0;pointer-events:none;z-index:-1;";
  document.body.appendChild(iframe);

  try {
    await new Promise<void>(resolve => {
      iframe.onload = () => resolve();
      iframe.srcdoc = html;
      setTimeout(resolve, 4000); // fallback generoso para o relatório (maior)
    });

    const doc = iframe.contentDocument!;
    try { await doc.fonts.ready; } catch { /* non-critical */ }

    // Ajusta altura ao conteúdo real
    const contentH = doc.body.scrollHeight;
    if (contentH > 2000) {
      iframe.style.height = `${contentH + 100}px`;
      await new Promise(r => setTimeout(r, 400));
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

    const safeName = clientName.replace(/[^a-zA-ZÀ-ú\s]/g, "").trim().replace(/\s+/g, "_");
    pdf.save(`Relatorio_${safeName}.pdf`);
  } finally {
    document.body.removeChild(iframe);
  }
}
