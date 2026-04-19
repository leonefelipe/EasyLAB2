/**
 * clientReportGenerator.ts
 * Gera o relatório PDF profissional para entrega ao cliente.
 * Usa browser print rendering — SEM html2canvas, SEM dependências externas.
 * Formato A4, margens limpas, tipografia profissional, quebras de página.
 */

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

function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildReportHTML(results: AnalysisResult, clientName: string): string {
  const ats       = results.atsScore ?? results.matchScore ?? 0;
  const projected = results.projectedMatchScore ?? 0;
  const gain      = Math.round(projected - ats);
  const color     = scoreColor(ats);
  const label     = scoreLabel(ats);
  const salary    = results.salaryRange;
  const hasSalary = salary && salary.cltMin > 0;
  const changes   = results.changes ?? [];

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
<title>Relatório — ${esc(clientName)}</title>
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  @page{size:A4;margin:0}
  body{font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;font-size:10pt;color:#1a1a2e;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}

  /* Cover */
  .cover{width:210mm;height:297mm;background:linear-gradient(160deg,#0a0f2e 0%,#0f2057 45%,#1a3a9e 100%);display:flex;flex-direction:column;justify-content:space-between;padding:0;page-break-after:always;position:relative;overflow:hidden}
  .cover-deco-1{position:absolute;top:-60px;right:-60px;width:300px;height:300px;border-radius:50%;background:rgba(255,255,255,.04)}
  .cover-deco-2{position:absolute;bottom:80px;left:-80px;width:350px;height:350px;border-radius:50%;background:rgba(255,255,255,.03)}
  .cover-top{padding:52px 56px 0}
  .cover-brand{font-size:8pt;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#93c5fd;margin-bottom:48px}
  .cover-label{font-size:8pt;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:#60a5fa;margin-bottom:16px}
  .cover-name{font-size:32pt;font-weight:700;line-height:1.1;color:#fff;margin-bottom:12px;font-family:Georgia,serif}
  .cover-role{font-size:12pt;color:#bfdbfe;margin-bottom:40px}
  .cover-score-block{display:inline-flex;align-items:center;gap:20px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);border-radius:12px;padding:16px 24px;margin-bottom:32px}
  .cover-score-num{font-size:36pt;font-weight:700;line-height:1}
  .cover-score-label{font-size:8pt;color:#93c5fd;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:4px}
  .cover-score-verdict{font-size:14pt;font-weight:600;color:#fff;margin-bottom:4px}
  .cover-score-gain{font-size:9pt;color:#86efac}
  .cover-bottom{padding:32px 56px;border-top:1px solid rgba(255,255,255,.1)}
  .cover-meta-line{font-size:8.5pt;color:rgba(255,255,255,.5);display:flex;gap:24px}

  /* Content pages */
  .content-page{width:210mm;min-height:297mm;padding:40px 52px 48px;display:flex;flex-direction:column;page-break-after:always}
  .content-page:last-child{page-break-after:avoid}

  /* Sections */
  .section{margin-bottom:26px;page-break-inside:avoid}
  .section-title{font-size:7pt;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#1e3a8a;border-bottom:2px solid #1e3a8a;padding-bottom:6px;margin-bottom:14px}

  /* Score hero */
  .score-hero{display:flex;align-items:center;gap:24px;background:#f8fafc;border:1px solid #e2e8f0;border-left:4px solid #1e3a8a;border-radius:8px;padding:20px 24px;margin-bottom:28px;page-break-inside:avoid}
  .score-circle{width:72px;height:72px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:20pt;font-weight:700;color:#fff}
  .score-text h3{font-size:12pt;font-weight:700;color:#1e293b;margin-bottom:4px}
  .score-text p{font-size:9pt;color:#64748b;line-height:1.5}
  .score-pills{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}
  .pill{font-size:7.5pt;font-weight:600;padding:3px 10px;border-radius:20px}
  .pill-blue{background:#dbeafe;color:#1e40af}
  .pill-green{background:#dcfce7;color:#166534}
  .pill-amber{background:#fef3c7;color:#92400e}
  .pill-purple{background:#ede9fe;color:#5b21b6}

  /* Bars */
  .bar-row{margin-bottom:10px;page-break-inside:avoid}
  .bar-label-row{display:flex;justify-content:space-between;align-items:center;font-size:8.5pt;color:#334155;margin-bottom:4px}
  .bar-track{height:7px;background:#e2e8f0;border-radius:4px;overflow:hidden}
  .bar-fill{height:100%;border-radius:4px}

  /* Tags */
  .tag-cloud{display:flex;flex-wrap:wrap;gap:5px}
  .tag{font-size:8pt;font-weight:500;padding:3px 9px;border-radius:5px;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe}
  .tag-miss{background:#fff7ed;color:#9a3412;border:1px solid #fed7aa}

  /* Lists */
  .check-list{list-style:none}
  .check-list li{font-size:9pt;color:#334155;padding:5px 0 5px 20px;border-bottom:1px solid #f1f5f9;position:relative;line-height:1.5}
  .check-list li::before{content:'✓';position:absolute;left:0;color:#16a34a;font-weight:700;font-size:10pt}
  .risk-list li::before{content:'⚠';color:#d97706;font-size:9pt}
  .step-list li::before{content:'→';color:#1e3a8a;font-size:10pt}

  /* Two col */
  .two-col{display:grid;grid-template-columns:1fr 1fr;gap:16px}

  /* Salary */
  .salary-card{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px 16px;page-break-inside:avoid}
  .salary-card .s-label{font-size:7.5pt;color:#64748b;text-transform:uppercase;letter-spacing:.8px;margin-bottom:4px}
  .salary-card .s-range{font-size:13pt;font-weight:700;color:#1e293b;margin-bottom:3px}
  .salary-card .s-sub{font-size:7.5pt;color:#94a3b8}

  /* Recruiter */
  .rp-box{background:#fafafa;border-left:3px solid #1e3a8a;border-radius:0 6px 6px 0;padding:12px 14px;margin-bottom:10px;page-break-inside:avoid}
  .rp-label{font-size:7.5pt;font-weight:700;color:#1e3a8a;text-transform:uppercase;letter-spacing:.8px;margin-bottom:5px}
  .rp-text{font-size:9pt;color:#334155;line-height:1.55}

  /* Changes table */
  .changes-table{width:100%;border-collapse:collapse;font-size:8.5pt}
  .changes-table th{background:#f1f5f9;color:#475569;font-weight:700;font-size:7.5pt;text-transform:uppercase;letter-spacing:.8px;padding:8px 10px;text-align:left;border-bottom:2px solid #e2e8f0}
  .changes-table td{padding:7px 10px;color:#334155;border-bottom:1px solid #f1f5f9;vertical-align:top;line-height:1.45}
  .impact-alto{background:#dcfce7;color:#166534;padding:2px 7px;border-radius:10px;font-size:7pt;font-weight:700}
  .impact-medio{background:#fef3c7;color:#92400e;padding:2px 7px;border-radius:10px;font-size:7pt;font-weight:700}
  .impact-baixo{background:#f1f5f9;color:#475569;padding:2px 7px;border-radius:10px;font-size:7pt;font-weight:700}

  /* Summary */
  .summary-box{background:linear-gradient(135deg,#f0f7ff 0%,#e8f2ff 100%);border:1px solid #bfdbfe;border-radius:10px;padding:20px 24px;margin-bottom:24px}
  .summary-box p{font-size:9.5pt;color:#1e3a8a;line-height:1.65}

  /* Footer */
  .page-footer{margin-top:auto;padding-top:16px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;font-size:7pt;color:#94a3b8}
  .page-footer strong{color:#1e3a8a}

  @media print{
    html,body{background:white!important}
    .cover{page-break-after:always!important}
    .content-page{page-break-after:always!important}
  }
  @media screen{
    body{background:#94a3b8;padding:20px}
    .cover,.content-page{box-shadow:0 4px 32px rgba(0,0,0,.2);margin-bottom:20px}
    .content-page{min-height:auto}
  }
</style>
</head>
<body>

<!-- COVER -->
<div class="cover">
  <div class="cover-deco-1"></div>
  <div class="cover-deco-2"></div>
  <div class="cover-top">
    <div class="cover-brand">Leone Consultoria de Carreira</div>
    <div class="cover-label">Relatório de Reposicionamento Profissional</div>
    <div class="cover-name">${esc(clientName)}</div>
    <div class="cover-role">
      ${results.jobTitle ? `Análise para: <strong style="color:#fff">${esc(results.jobTitle)}</strong>` : "Análise Geral de CV e Perfil Profissional"}
      ${results.seniorityLevel ? ` &nbsp;·&nbsp; ${esc(results.seniorityLevel)}` : ""}
    </div>
    <div class="cover-score-block">
      <div class="cover-score-num" style="color:${color}">${Math.round(ats)}</div>
      <div>
        <div class="cover-score-label">Score ATS atual</div>
        <div class="cover-score-verdict">${label}</div>
        ${gain > 0 ? `<div class="cover-score-gain">↑ Score projetado: ${Math.round(projected)} (+${gain} pts)</div>` : ""}
      </div>
    </div>
  </div>
  <div class="cover-bottom">
    <div class="cover-meta-line">
      <span>Emitido em ${today()}</span>
      <span>Documento confidencial</span>
      <span>Leone Consultoria de Carreira</span>
    </div>
  </div>
</div>

<!-- PAGE 2: SCORE + KEYWORDS -->
<div class="content-page">
  <div class="score-hero">
    <div class="score-circle" style="background:${color}">${Math.round(ats)}</div>
    <div class="score-text">
      <h3>Score ATS: ${label}</h3>
      <p>CV analisado contra os principais sistemas de triagem automática (ATS)${results.jobTitle ? ` para a vaga de <strong>${esc(results.jobTitle)}</strong>` : ""}.${gain > 0 ? ` Com as optimizações, o score projetado sobe para <strong>${Math.round(projected)}</strong> (+${gain} pts).` : ""}</p>
      <div class="score-pills">
        <span class="pill pill-blue">Score atual: ${Math.round(ats)}/100</span>
        ${gain > 0 ? `<span class="pill pill-green">Score projetado: ${Math.round(projected)}/100</span>` : ""}
        ${gain > 0 ? `<span class="pill pill-amber">Ganho: +${gain} pts</span>` : ""}
        ${results.seniorityLevel ? `<span class="pill pill-purple">${esc(results.seniorityLevel)}</span>` : ""}
      </div>
    </div>
  </div>

  ${breakdownRows.length > 0 ? `
  <div class="section">
    <div class="section-title">Análise Detalhada ATS por Categoria</div>
    ${breakdownRows.map(([lbl, val, max]) => {
      const pct = Math.round(((val as number) / (max as number)) * 100);
      const c   = pct >= 75 ? "#16a34a" : pct >= 50 ? "#d97706" : "#dc2626";
      return `<div class="bar-row">
        <div class="bar-label-row"><span>${esc(String(lbl))}</span><span style="font-weight:700;color:${c}">${val}/${max} (${pct}%)</span></div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${c}"></div></div>
      </div>`;
    }).join("")}
  </div>` : ""}

  ${results.strengths?.length ? `
  <div class="section">
    <div class="section-title">Pontos Fortes Identificados</div>
    <ul class="check-list">${results.strengths.slice(0, 6).map(s => `<li>${esc(s)}</li>`).join("")}</ul>
  </div>` : ""}

  ${results.keywords?.length ? `
  <div class="section">
    <div class="section-title">Palavras-Chave Presentes no CV</div>
    <div class="tag-cloud">${results.keywords.slice(0, 24).map(k => `<span class="tag">${esc(k)}</span>`).join("")}</div>
  </div>` : ""}

  <div class="page-footer">
    <strong>Leone Consultoria de Carreira</strong>
    <span>${esc(clientName)} &nbsp;·&nbsp; ${today()}</span>
    <span>Página 2</span>
  </div>
</div>

<!-- PAGE 3: GAPS + CHANGES -->
<div class="content-page">
  ${results.missingKeywords?.length ? `
  <div class="section">
    <div class="section-title">Palavras-Chave a Adicionar ao CV</div>
    <div class="tag-cloud">${results.missingKeywords.slice(0, 20).map(k => `<span class="tag tag-miss">${esc(k)}</span>`).join("")}</div>
    <p style="font-size:8.5pt;color:#64748b;margin-top:10px;line-height:1.5">Estas palavras-chave estão ausentes mas são frequentemente exigidas nas vagas desta área. Incorpore-as naturalmente nas secções de resumo, competências e experiências.</p>
  </div>` : ""}

  ${results.weaknesses?.length ? `
  <div class="section">
    <div class="section-title">Pontos de Melhoria Prioritários</div>
    <ul class="check-list risk-list">${results.weaknesses.slice(0, 5).map(w => `<li>${esc(w)}</li>`).join("")}</ul>
  </div>` : ""}

  ${results.competitiveEdges?.length ? `
  <div class="section">
    <div class="section-title">Vantagens Competitivas</div>
    <ul class="check-list">${results.competitiveEdges.slice(0, 5).map(e => `<li>${esc(e)}</li>`).join("")}</ul>
  </div>` : ""}

  ${changes.length > 0 ? `
  <div class="section">
    <div class="section-title">Alterações Aplicadas ao CV Optimizado</div>
    <table class="changes-table">
      <thead><tr><th>Secção</th><th>Alteração</th><th>Impacto</th></tr></thead>
      <tbody>
        ${changes.slice(0, 10).map(c => `
        <tr>
          <td style="font-weight:600;white-space:nowrap">${esc(c.section)}</td>
          <td>${esc(c.description)}</td>
          <td><span class="impact-${c.impact}">${c.impact === "alto" ? "Alto" : c.impact === "medio" ? "Médio" : "Baixo"}</span></td>
        </tr>`).join("")}
      </tbody>
    </table>
  </div>` : ""}

  ${results.suggestions?.length ? `
  <div class="section">
    <div class="section-title">Recomendações de Melhoria</div>
    <ul class="check-list step-list">${results.suggestions.slice(0, 6).map(s => `<li>${esc(s)}</li>`).join("")}</ul>
  </div>` : ""}

  <div class="page-footer">
    <strong>Leone Consultoria de Carreira</strong>
    <span>${esc(clientName)} &nbsp;·&nbsp; ${today()}</span>
    <span>Página 3</span>
  </div>
</div>

<!-- PAGE 4: SALARY + RECRUITER + NEXT STEPS -->
<div class="content-page">
  ${hasSalary ? `
  <div class="section">
    <div class="section-title">Inteligência Salarial de Mercado</div>
    <div class="two-col" style="margin-bottom:12px">
      <div class="salary-card">
        <div class="s-label">Regime CLT — Faixa Mensal Bruta</div>
        <div class="s-range">R$ ${fmtBRL(salary!.cltMin)} – R$ ${fmtBRL(salary!.cltMax)}</div>
        <div class="s-sub">Confiança: ${salary!.confidence === "high" ? "Alta" : salary!.confidence === "medium" ? "Média" : "Baixa"}</div>
      </div>
      <div class="salary-card">
        <div class="s-label">Regime PJ — Faixa Mensal</div>
        <div class="s-range">R$ ${fmtBRL(salary!.pjMin)} – R$ ${fmtBRL(salary!.pjMax)}</div>
        <div class="s-sub">Multiplicador 1.35–1.50×</div>
      </div>
    </div>
    ${salary!.rationale ? `<p style="font-size:8.5pt;color:#64748b;line-height:1.5">${esc(salary!.rationale)}</p>` : ""}
  </div>` : ""}

  ${results.negotiationTips?.length ? `
  <div class="section">
    <div class="section-title">Estratégia de Negociação Salarial</div>
    <ul class="check-list step-list">${results.negotiationTips.slice(0, 4).map(t => `<li>${esc(t)}</li>`).join("")}</ul>
  </div>` : ""}

  ${results.recruiterProfile ? `
  <div class="section">
    <div class="section-title">Perfil do Recrutador-Alvo</div>
    ${results.recruiterProfile.idealNarrative ? `<div class="rp-box"><div class="rp-label">Narrativa Ideal</div><div class="rp-text">${esc(results.recruiterProfile.idealNarrative)}</div></div>` : ""}
    ${results.recruiterProfile.recruiterTriggers?.length ? `<div class="rp-box" style="border-left-color:#16a34a"><div class="rp-label">O que Atrai o Recrutador</div><div class="rp-text">${results.recruiterProfile.recruiterTriggers.slice(0,3).map(esc).join(" &nbsp;·&nbsp; ")}</div></div>` : ""}
    ${results.recruiterProfile.recruiterFears?.length ? `<div class="rp-box" style="border-left-color:#d97706"><div class="rp-label">O que Pode Preocupar o Recrutador</div><div class="rp-text">${results.recruiterProfile.recruiterFears.slice(0,3).map(esc).join(" &nbsp;·&nbsp; ")}</div></div>` : ""}
  </div>` : ""}

  <div class="section">
    <div class="section-title">Próximos Passos Recomendados</div>
    <ul class="check-list step-list">
      <li>Substituir o CV original pelo CV optimizado entregue em anexo</li>
      <li>Atualizar o headline do LinkedIn com as palavras-chave identificadas</li>
      <li>Adicionar as palavras-chave em falta nas secções "Sobre" e nas experiências</li>
      ${results.missingKeywords?.length ? `<li>Incorporar gradualmente: <strong>${results.missingKeywords.slice(0,4).map(esc).join(", ")}</strong></li>` : ""}
      <li>Solicitar recomendações de ex-gestores no LinkedIn</li>
      <li>Alinhar o perfil do LinkedIn com o novo posicionamento do CV</li>
    </ul>
  </div>

  <div class="summary-box">
    <p>
      <strong>Resumo executivo:</strong> Com score ATS atual de <strong>${Math.round(ats)}/100</strong> (${label.toLowerCase()}),
      este CV apresenta ${results.strengths?.length ? `${results.strengths.length} pontos fortes identificados` : "potencial relevante"}.
      ${gain > 0 ? `Após as optimizações, o score projetado de <strong>${Math.round(projected)}/100</strong> representa +${gain} pontos — aumento significativo na taxa de passagem nos filtros ATS.` : ""}
      ${results.missingKeywords?.length ? ` A incorporação das ${results.missingKeywords.length} palavras-chave identificadas é prioridade imediata.` : ""}
    </p>
  </div>

  <div class="page-footer">
    <strong>Leone Consultoria de Carreira</strong>
    <span>Relatório confidencial — ${esc(clientName)}</span>
    <span>${today()}</span>
  </div>
</div>

</body>
</html>`;
}

export async function generateClientReport(
  results: AnalysisResult,
  clientName: string = "Candidato"
): Promise<void> {
  const html     = buildReportHTML(results, clientName);
  const safeName = clientName.replace(/[^a-zA-ZÀ-ú\s]/g, "").trim().replace(/\s+/g, "_");

  const win = window.open("", "_blank", "width=900,height=750,scrollbars=yes");
  if (!win) {
    // Fallback: download HTML for manual printing
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `Relatorio_${safeName}.html`;
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

  // Wait for fonts + layout
  if (win.document.readyState === "complete") {
    setTimeout(doPrint, 800);
  } else {
    win.addEventListener("load", () => setTimeout(doPrint, 600));
    setTimeout(doPrint, 2500); // fallback
  }
}
