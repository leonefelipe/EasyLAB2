/**
 * clientReportGenerator.ts
 * Relatório profissional de entrega ao cliente.
 * Browser print rendering — SEM html2canvas. A4, margens limpas, tipografia profissional.
 *
 * Páginas:
 *   1 — Capa
 *   2 — Score ATS + Análise detalhada
 *   3 — Keywords + Gaps + Alterações no CV
 *   4 — LinkedIn Optimization
 *   5 — Salário + Perfil do Recrutador + Próximos Passos
 */

import type { AnalysisResult } from "@/components/AnalysisLayout";

function scoreColor(s: number) { return s >= 75 ? "#16a34a" : s >= 55 ? "#d97706" : "#dc2626"; }
function scoreLabel(s: number) { return s >= 80 ? "Excelente" : s >= 65 ? "Bom" : s >= 50 ? "Regular" : "Precisa melhorar"; }
function fmtBRL(n: number) { return new Intl.NumberFormat("pt-BR").format(n); }
function today() { return new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }); }
function esc(s: string) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function buildHTML(results: AnalysisResult, clientName: string): string {
  const ats       = results.atsScore ?? results.matchScore ?? 0;
  const vp        = results.valueProposition;
  const jh        = results.jobhunterStrategy;
  const projected = results.projectedMatchScore ?? 0;
  const gain      = Math.round(projected - ats);
  const color     = scoreColor(ats);
  const label     = scoreLabel(ats);
  const salary    = results.salaryRange;
  const hasSalary = salary && salary.cltMin > 0;
  const changes   = results.changes ?? [];
  const li        = results.linkedinOptimization;

  const breakdown = results.atsScoreBreakdown ? [
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
  body{font-family:Arial,'Helvetica Neue',sans-serif;font-size:10pt;color:#1a1a2e;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}

  /* ── Cover ── */
  .cover{width:210mm;height:297mm;background:linear-gradient(150deg,#0a0f2e 0%,#0f2057 50%,#1a3a9e 100%);display:flex;flex-direction:column;justify-content:space-between;page-break-after:always;position:relative;overflow:hidden}
  .deco1{position:absolute;top:-60px;right:-60px;width:280px;height:280px;border-radius:50%;background:rgba(255,255,255,.04)}
  .deco2{position:absolute;bottom:60px;left:-80px;width:320px;height:320px;border-radius:50%;background:rgba(255,255,255,.03)}
  .cover-top{padding:52px 56px 0;position:relative;z-index:1}
  .cover-brand{font-size:8pt;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#93c5fd;margin-bottom:48px}
  .cover-label{font-size:8pt;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:#60a5fa;margin-bottom:16px}
  .cover-name{font-size:30pt;font-weight:700;line-height:1.1;color:#fff;margin-bottom:12px;font-family:Georgia,serif}
  .cover-role{font-size:12pt;color:#bfdbfe;margin-bottom:40px;font-weight:400}
  .score-box{display:inline-flex;align-items:center;gap:20px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);border-radius:12px;padding:16px 24px}
  .score-num{font-size:34pt;font-weight:700;line-height:1}
  .score-meta-label{font-size:8pt;color:#93c5fd;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:4px}
  .score-meta-verdict{font-size:13pt;font-weight:700;color:#fff;margin-bottom:4px}
  .score-meta-gain{font-size:9pt;color:#86efac}
  .cover-bottom{padding:32px 56px;border-top:1px solid rgba(255,255,255,.12);position:relative;z-index:1}
  .cover-meta{font-size:8pt;color:rgba(255,255,255,.45);display:flex;gap:24px}

  /* ── Content pages ── */
  .page{width:210mm;min-height:297mm;padding:38px 50px 44px;display:flex;flex-direction:column;page-break-after:always}
  .page:last-child{page-break-after:avoid}
  .page-footer{margin-top:auto;padding-top:14px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:7pt;color:#94a3b8}
  .page-footer strong{color:#1e3a8a}

  /* ── Section ── */
  .section{margin-bottom:24px;page-break-inside:avoid}
  .section-title{font-size:7pt;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#1e3a8a;border-bottom:2px solid #1e3a8a;padding-bottom:5px;margin-bottom:12px}

  /* ── Score hero ── */
  .score-hero{display:flex;align-items:center;gap:22px;background:#f8fafc;border:1px solid #e2e8f0;border-left:4px solid #1e3a8a;border-radius:8px;padding:18px 22px;margin-bottom:24px;page-break-inside:avoid}
  .score-circle{width:68px;height:68px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18pt;font-weight:700;color:#fff;flex-shrink:0}
  .score-text h3{font-size:11pt;font-weight:700;color:#1e293b;margin-bottom:3px}
  .score-text p{font-size:9pt;color:#64748b;line-height:1.5}
  .pills{display:flex;gap:7px;margin-top:8px;flex-wrap:wrap}
  .pill{font-size:7.5pt;font-weight:600;padding:3px 10px;border-radius:20px}
  .pill-blue{background:#dbeafe;color:#1e40af}
  .pill-green{background:#dcfce7;color:#166534}
  .pill-amber{background:#fef3c7;color:#92400e}
  .pill-purple{background:#ede9fe;color:#5b21b6}

  /* ── Bars ── */
  .bar-row{margin-bottom:9px;page-break-inside:avoid}
  .bar-labels{display:flex;justify-content:space-between;font-size:8.5pt;color:#334155;margin-bottom:3px}
  .bar-track{height:7px;background:#e2e8f0;border-radius:4px;overflow:hidden}
  .bar-fill{height:100%;border-radius:4px}

  /* ── Tags ── */
  .tags{display:flex;flex-wrap:wrap;gap:5px}
  .tag{font-size:8pt;font-weight:500;padding:3px 9px;border-radius:5px;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe}
  .tag-miss{background:#fff7ed;color:#9a3412;border:1px solid #fed7aa}
  .tag-li{background:#ede9fe;color:#5b21b6;border:1px solid #ddd6fe}

  /* ── Lists ── */
  .check-list{list-style:none}
  .check-list li{font-size:9pt;color:#334155;padding:4px 0 4px 18px;border-bottom:1px solid #f1f5f9;position:relative;line-height:1.5}
  .check-list li::before{content:'✓';position:absolute;left:0;color:#16a34a;font-weight:700}
  .risk-list li::before{content:'⚠';color:#d97706}
  .step-list li::before{content:'→';color:#1e3a8a}

  /* ── Two-col ── */
  .two-col{display:grid;grid-template-columns:1fr 1fr;gap:14px}

  /* ── Cards ── */
  .card{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px 16px;page-break-inside:avoid}
  .card-label{font-size:7.5pt;color:#64748b;text-transform:uppercase;letter-spacing:.8px;margin-bottom:4px}
  .card-value{font-size:13pt;font-weight:700;color:#1e293b;margin-bottom:3px}
  .card-sub{font-size:7.5pt;color:#94a3b8}

  /* ── Table ── */
  .changes-table{width:100%;border-collapse:collapse;font-size:8.5pt}
  .changes-table th{background:#f1f5f9;color:#475569;font-weight:700;font-size:7.5pt;text-transform:uppercase;letter-spacing:.8px;padding:8px 10px;text-align:left;border-bottom:2px solid #e2e8f0}
  .changes-table td{padding:7px 10px;color:#334155;border-bottom:1px solid #f1f5f9;vertical-align:top;line-height:1.4}
  .impact-alto{background:#dcfce7;color:#166534;padding:2px 7px;border-radius:10px;font-size:7pt;font-weight:700;white-space:nowrap}
  .impact-medio{background:#fef3c7;color:#92400e;padding:2px 7px;border-radius:10px;font-size:7pt;font-weight:700;white-space:nowrap}
  .impact-baixo{background:#f1f5f9;color:#475569;padding:2px 7px;border-radius:10px;font-size:7pt;font-weight:700;white-space:nowrap}

  /* ── LinkedIn ── */
  .li-headline{background:#eff6ff;border:1px solid #bfdbfe;border-left:4px solid #1d4ed8;border-radius:0 8px 8px 0;padding:12px 14px;margin-bottom:12px}
  .li-headline-label{font-size:7pt;font-weight:700;color:#1e40af;text-transform:uppercase;letter-spacing:.8px;margin-bottom:5px}
  .li-headline-text{font-size:10.5pt;font-weight:600;color:#1e293b;line-height:1.5}
  .li-about{background:#fafafa;border:1px solid #e2e8f0;border-radius:8px;padding:14px;margin-bottom:12px}
  .li-about-label{font-size:7pt;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px}
  .li-about-text{font-size:9pt;color:#334155;line-height:1.6;white-space:pre-wrap}

  /* ── Recruiter box ── */
  .rp-box{background:#fafafa;border-left:3px solid #1e3a8a;border-radius:0 6px 6px 0;padding:12px 14px;margin-bottom:9px;page-break-inside:avoid}
  .rp-label{font-size:7.5pt;font-weight:700;color:#1e3a8a;text-transform:uppercase;letter-spacing:.8px;margin-bottom:5px}
  .rp-text{font-size:9pt;color:#334155;line-height:1.55}

  /* ── Summary ── */
  .summary-box{background:linear-gradient(135deg,#f0f7ff,#e8f2ff);border:1px solid #bfdbfe;border-radius:10px;padding:18px 22px;margin-bottom:20px}
  .summary-box p{font-size:9.5pt;color:#1e3a8a;line-height:1.65}

  /* ── Value Proposition ── */
  .vp-box{background:#f5f3ff;border:1px solid #ddd6fe;border-left:4px solid #7c3aed;border-radius:0 8px 8px 0;padding:16px 18px;margin-bottom:10px;page-break-inside:avoid}
  .vp-label{font-size:7.5pt;font-weight:700;color:#6d28d9;text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px}
  .vp-current{background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:10px 12px;font-size:8.5pt;color:#64748b;font-style:italic;line-height:1.5;margin-bottom:8px}
  .vp-improved{background:#f5f3ff;border:1px solid #c4b5fd;border-radius:6px;padding:10px 12px;font-size:9pt;color:#4c1d95;font-weight:600;line-height:1.55}
  .vp-score{display:inline-block;padding:3px 10px;border-radius:20px;font-size:8pt;font-weight:700;margin-bottom:8px}
  .vp-gap{font-size:8pt;color:#92400e;padding:3px 0;border-bottom:1px solid #fef3c7}
  /* ── Jobhunter Strategy ── */
  .jh-platform{display:inline-block;padding:3px 10px;border-radius:20px;background:#dbeafe;color:#1e40af;font-size:8pt;font-weight:600;margin:2px}
  .jh-term{display:inline-block;padding:3px 10px;border-radius:20px;background:#f1f5f9;color:#334155;font-size:7.5pt;font-family:monospace;border:1px solid #e2e8f0;margin:2px}
  .jh-company{display:inline-block;padding:3px 10px;border-radius:20px;background:#dcfce7;color:#166534;font-size:8pt;font-weight:500;border:1px solid #bbf7d0;margin:2px}
  .jh-tip{font-size:8.5pt;color:#334155;padding:8px 10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;margin-bottom:6px;line-height:1.5}
  .urgency-alta{background:#fee2e2;color:#991b1b;padding:4px 12px;border-radius:20px;font-size:8pt;font-weight:700}
  .urgency-média{background:#fef3c7;color:#92400e;padding:4px 12px;border-radius:20px;font-size:8pt;font-weight:700}
  .urgency-baixa{background:#dcfce7;color:#166534;padding:4px 12px;border-radius:20px;font-size:8pt;font-weight:700}

  @media print{html,body{background:#fff!important}.cover{page-break-after:always!important}.page{page-break-after:always!important}}
  @media screen{body{background:#94a3b8;padding:20px}.cover,.page{box-shadow:0 4px 32px rgba(0,0,0,.2);margin-bottom:20px}.page{min-height:auto}}
</style>
</head>
<body>

<!-- ════════ CAPA ════════ -->
<div class="cover">
  <div class="deco1"></div><div class="deco2"></div>
  <div class="cover-top">
    <div class="cover-brand">Leone Consultoria de Carreira</div>
    <div class="cover-label">Relatório de Reposicionamento Profissional</div>
    <div class="cover-name">${esc(clientName)}</div>
    <div class="cover-role">
      ${results.jobTitle ? `Análise para: <strong style="color:#fff">${esc(results.jobTitle)}</strong>` : "Análise Holística de CV e Perfil Profissional"}
      ${results.seniorityLevel ? ` &nbsp;·&nbsp; ${esc(results.seniorityLevel)}` : ""}
    </div>
    <div class="score-box">
      <div class="score-num" style="color:${color}">${Math.round(ats)}</div>
      <div>
        <div class="score-meta-label">Score ATS atual</div>
        <div class="score-meta-verdict">${label}</div>
        ${gain > 0 ? `<div class="score-meta-gain">↑ Projetado: ${Math.round(projected)} (+${gain} pts)</div>` : ""}
      </div>
    </div>
  </div>
  <div class="cover-bottom">
    <div class="cover-meta">
      <span>Emitido em ${today()}</span>
      <span>Documento confidencial</span>
      <span>Leone Consultoria de Carreira</span>
    </div>
  </div>
</div>

<!-- ════════ PÁG 2: SCORE + ANÁLISE ATS ════════ -->
<div class="page">
  <div class="score-hero">
    <div class="score-circle" style="background:${color}">${Math.round(ats)}</div>
    <div class="score-text">
      <h3>Score ATS: ${label}</h3>
      <p>CV analisado contra os principais sistemas ATS do mercado brasileiro${results.jobTitle ? ` para a vaga de <strong>${esc(results.jobTitle)}</strong>` : ""}.${gain > 0 ? ` Com as optimizações, o score projetado sobe para <strong>${Math.round(projected)}/100</strong> (+${gain} pts).` : ""}</p>
      <div class="pills">
        <span class="pill pill-blue">Atual: ${Math.round(ats)}/100</span>
        ${gain > 0 ? `<span class="pill pill-green">Projetado: ${Math.round(projected)}/100</span>` : ""}
        ${gain > 0 ? `<span class="pill pill-amber">Ganho: +${gain} pts</span>` : ""}
        ${results.seniorityLevel ? `<span class="pill pill-purple">${esc(results.seniorityLevel)}</span>` : ""}
      </div>
    </div>
  </div>

  ${breakdown.length > 0 ? `
  <div class="section">
    <div class="section-title">Breakdown ATS por categoria</div>
    ${breakdown.map(([lbl, val, max]) => {
      const pct = Math.round(((val as number) / (max as number)) * 100);
      const c   = pct >= 75 ? "#16a34a" : pct >= 50 ? "#d97706" : "#dc2626";
      return `<div class="bar-row">
        <div class="bar-labels"><span>${esc(String(lbl))}</span><span style="font-weight:700;color:${c}">${val}/${max} (${pct}%)</span></div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${c}"></div></div>
      </div>`;
    }).join("")}
  </div>` : ""}

  ${results.strengths?.length ? `
  <div class="section">
    <div class="section-title">Pontos fortes identificados</div>
    <ul class="check-list">${results.strengths.slice(0,6).map(s=>`<li>${esc(s)}</li>`).join("")}</ul>
  </div>` : ""}

  ${results.careerTrajectory ? `
  <div class="section">
    <div class="section-title">Trajectória de carreira</div>
    <p style="font-size:9pt;color:#334155;line-height:1.6">${esc(results.careerTrajectory)}</p>
  </div>` : ""}

  <div class="page-footer">
    <strong>Leone Consultoria de Carreira</strong>
    <span>${esc(clientName)} · ${today()}</span>
    <span>Página 2</span>
  </div>
</div>

<!-- ════════ PÁG 3: KEYWORDS + GAPS + ALTERAÇÕES ════════ -->
<div class="page">
  ${results.keywords?.length ? `
  <div class="section">
    <div class="section-title">Keywords presentes no CV</div>
    <div class="tags">${results.keywords.slice(0,24).map(k=>`<span class="tag">${esc(k)}</span>`).join("")}</div>
  </div>` : ""}

  ${results.missingKeywords?.length ? `
  <div class="section">
    <div class="section-title">Keywords em falta — adicionar ao CV e LinkedIn</div>
    <div class="tags">${results.missingKeywords.slice(0,20).map(k=>`<span class="tag tag-miss">${esc(k)}</span>`).join("")}</div>
    <p style="font-size:8pt;color:#64748b;margin-top:8px;line-height:1.5">Incorporar naturalmente nas secções de Resumo, Competências e Experiências — tanto no CV como no perfil LinkedIn.</p>
  </div>` : ""}

  ${results.weaknesses?.length ? `
  <div class="section">
    <div class="section-title">Pontos de melhoria prioritários</div>
    <ul class="check-list risk-list">${results.weaknesses.slice(0,5).map(w=>`<li>${esc(w)}</li>`).join("")}</ul>
  </div>` : ""}

  ${changes.length > 0 ? `
  <div class="section">
    <div class="section-title">Alterações aplicadas ao CV optimizado</div>
    <table class="changes-table">
      <thead><tr><th>Secção</th><th>Alteração realizada</th><th>Impacto</th></tr></thead>
      <tbody>
        ${changes.slice(0,10).map(c=>`
        <tr>
          <td style="font-weight:600;white-space:nowrap">${esc(c.section)}</td>
          <td>${esc(c.description)}</td>
          <td><span class="impact-${c.impact}">${c.impact==="alto"?"Alto":c.impact==="medio"?"Médio":"Baixo"}</span></td>
        </tr>`).join("")}
      </tbody>
    </table>
  </div>` : ""}

  ${results.suggestions?.length ? `
  <div class="section">
    <div class="section-title">Recomendações de melhoria</div>
    <ul class="check-list step-list">${results.suggestions.slice(0,6).map(s=>`<li>${esc(s)}</li>`).join("")}</ul>
  </div>` : ""}

  <div class="page-footer">
    <strong>Leone Consultoria de Carreira</strong>
    <span>${esc(clientName)} · ${today()}</span>
    <span>Página 3</span>
  </div>
</div>

<!-- ════════ PÁG 4: LINKEDIN ════════ -->
<div class="page">
  <div class="section-title" style="margin-bottom:16px;font-size:8pt">LinkedIn — Plano de Optimização do Perfil</div>

  ${li?.headline ? `
  <div class="li-headline">
    <div class="li-headline-label">📌 Headline sugerida (copiar e colar no LinkedIn)</div>
    <div class="li-headline-text">${esc(li.headline)}</div>
  </div>` : ""}

  ${li?.about ? `
  <div class="li-about">
    <div class="li-about-label">📝 Resumo / About — Secção completa</div>
    <div class="li-about-text">${esc(li.about)}</div>
  </div>` : ""}

  ${li?.featuredSection ? `
  <div class="section">
    <div class="section-title">Secção em destaque (Featured)</div>
    <p style="font-size:9pt;color:#334155;line-height:1.6">${esc(li.featuredSection)}</p>
  </div>` : ""}

  ${li?.skillsToAdd?.length ? `
  <div class="section">
    <div class="section-title">Skills a adicionar / priorizar para endorsements</div>
    <div class="tags">${li.skillsToAdd.map(s=>`<span class="tag tag-li">${esc(s)}</span>`).join("")}</div>
  </div>` : ""}

  ${li?.profileTips?.length ? `
  <div class="section">
    <div class="section-title">Dicas específicas para o perfil</div>
    <ul class="check-list step-list">${li.profileTips.map(t=>`<li>${esc(t)}</li>`).join("")}</ul>
  </div>` : ""}

  ${!li ? `
  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:24px;text-align:center">
    <p style="font-size:9pt;color:#64748b">Optimização do LinkedIn disponível na próxima análise.</p>
  </div>` : ""}

  <div class="page-footer">
    <strong>Leone Consultoria de Carreira</strong>
    <span>${esc(clientName)} · ${today()}</span>
    <span>Página 4</span>
  </div>
</div>

<!-- ════════ PÁG 5: PROPOSTA DE VALOR + ESTRATÉGIA ════════ -->
<div class="page">

  ${vp ? `
  <div class="section">
    <div class="section-title">Proposta de valor profissional</div>
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">
      <span class="vp-score" style="background:${vp.score>=70?'#dcfce7':vp.score>=40?'#fef3c7':'#fee2e2'};color:${vp.score>=70?'#166534':vp.score>=40?'#92400e':'#991b1b'}">Score: ${vp.score}/100</span>
      ${!vp.isInTopThird ? '<span style="font-size:8pt;color:#92400e;background:#fef3c7;padding:3px 10px;border-radius:20px;border:1px solid #fde68a">⚠ Não está no terço superior do CV</span>' : '<span style="font-size:8pt;color:#166534;background:#dcfce7;padding:3px 10px;border-radius:20px;border:1px solid #bbf7d0">✓ Posicionada corretamente</span>'}
    </div>
    ${vp.currentStatement ? `<div class="vp-label">O que o CV comunica hoje</div><div class="vp-current">"${esc(vp.currentStatement)}"</div>` : ""}
    ${vp.improvedStatement ? `<div class="vp-label" style="color:#7c3aed">Proposta de valor ideal (sugestão)</div><div class="vp-improved">"${esc(vp.improvedStatement)}"</div>` : ""}
    ${vp.gaps?.length ? `<div class="vp-label" style="margin-top:10px;color:#b45309">Gaps identificados</div>${vp.gaps.map(g=>`<div class="vp-gap">${esc(g)}</div>`).join("")}` : ""}
  </div>` : ""}

  ${jh ? `
  <div class="section">
    <div class="section-title">Estratégia de busca de emprego</div>
    <div style="margin-bottom:10px">
      <span class="${jh.urgencyLevel==="alta"?"urgency-alta":jh.urgencyLevel==="média"?"urgency-média":"urgency-baixa"}">Urgência: ${jh.urgencyLevel}</span>
    </div>
    ${jh.primaryPlatforms?.length ? `<div class="vp-label">Plataformas prioritárias</div><div style="margin-bottom:10px">${jh.primaryPlatforms.map(p=>`<span class="jh-platform">${esc(p)}</span>`).join("")}</div>` : ""}
    ${jh.searchTerms?.length ? `<div class="vp-label">Termos de busca exatos</div><div style="margin-bottom:10px">${jh.searchTerms.map(t=>`<span class="jh-term">"${esc(t)}"</span>`).join("")}</div>` : ""}
    ${jh.companyTargets?.length ? `<div class="vp-label">Empresas que contratam este perfil</div><div style="margin-bottom:10px">${jh.companyTargets.map(c=>`<span class="jh-company">${esc(c)}</span>`).join("")}</div>` : ""}
    ${jh.approachTips?.length ? `<div class="vp-label">Como abordar recrutadores</div>${jh.approachTips.map((t,i)=>`<div class="jh-tip"><strong>${i+1}.</strong> ${esc(t)}</div>`).join("")}` : ""}
  </div>` : ""}

  <div class="page-footer">
    <strong>Leone Consultoria de Carreira</strong>
    <span>${esc(clientName)} · ${today()}</span>
    <span>Página 5</span>
  </div>
</div>

<!-- ════════ PÁG 6: SALÁRIO + RECRUTADOR + PRÓXIMOS PASSOS ════════ -->
<div class="page">
  ${hasSalary ? `
  <div class="section">
    <div class="section-title">Inteligência salarial — Mercado BR 2025</div>
    <div class="two-col" style="margin-bottom:10px">
      <div class="card">
        <div class="card-label">Regime CLT — Faixa mensal bruta</div>
        <div class="card-value">R$ ${fmtBRL(salary!.cltMin)} – R$ ${fmtBRL(salary!.cltMax)}</div>
        <div class="card-sub">Confiança: ${salary!.confidence==="high"?"Alta":salary!.confidence==="medium"?"Média":"Baixa"}</div>
      </div>
      <div class="card">
        <div class="card-label">Regime PJ — Faixa mensal gross</div>
        <div class="card-value">R$ ${fmtBRL(salary!.pjMin)} – R$ ${fmtBRL(salary!.pjMax)}</div>
        <div class="card-sub">Multiplicador 1.35–1.50×</div>
      </div>
    </div>
    ${salary!.rationale ? `<p style="font-size:8.5pt;color:#64748b;line-height:1.5">${esc(salary!.rationale)}</p>` : ""}
  </div>` : ""}

  ${results.negotiationTips?.length ? `
  <div class="section">
    <div class="section-title">Estratégia de negociação salarial</div>
    <ul class="check-list step-list">${results.negotiationTips.slice(0,4).map(t=>`<li>${esc(t)}</li>`).join("")}</ul>
  </div>` : ""}

  ${results.recruiterProfile ? `
  <div class="section">
    <div class="section-title">Perfil do recrutador-alvo</div>
    ${results.recruiterProfile.idealNarrative ? `<div class="rp-box"><div class="rp-label">Narrativa ideal</div><div class="rp-text">${esc(results.recruiterProfile.idealNarrative)}</div></div>` : ""}
    ${results.recruiterProfile.recruiterTriggers?.length ? `<div class="rp-box" style="border-left-color:#16a34a"><div class="rp-label">O que atrai o recrutador</div><div class="rp-text">${results.recruiterProfile.recruiterTriggers.slice(0,3).map(esc).join(" · ")}</div></div>` : ""}
    ${results.recruiterProfile.recruiterFears?.length ? `<div class="rp-box" style="border-left-color:#d97706"><div class="rp-label">O que pode preocupar o recrutador</div><div class="rp-text">${results.recruiterProfile.recruiterFears.slice(0,3).map(esc).join(" · ")}</div></div>` : ""}
  </div>` : ""}

  <div class="section">
    <div class="section-title">Próximos passos recomendados</div>
    <ul class="check-list step-list">
      <li>Substituir o CV actual pelo CV optimizado entregue em anexo</li>
      <li>Atualizar a headline do LinkedIn com o texto sugerido na Pág. 4</li>
      <li>Copiar o novo resumo "About" para o perfil LinkedIn</li>
      <li>Adicionar as ${results.linkedinOptimization?.skillsToAdd?.length ?? 0} skills sugeridas e solicitar endorsements</li>
      ${results.missingKeywords?.length ? `<li>Incorporar no CV e LinkedIn: <strong>${results.missingKeywords.slice(0,4).map(esc).join(", ")}</strong></li>` : ""}
      ${jh?.primaryPlatforms?.length ? `<li>Iniciar busca ativa nas plataformas: <strong>${jh.primaryPlatforms.slice(0,3).map(esc).join(", ")}</strong></li>` : ""}
      ${jh?.searchTerms?.length ? `<li>Usar os termos de busca: <strong>${jh.searchTerms.slice(0,3).map(t=>`"${esc(t)}"`).join(", ")}</strong></li>` : ""}
      <li>Verificar SSI em linkedin.com/sales/ssi — meta mínima de 60 pontos</li>
      <li>Solicitar recomendações de ex-gestores e colegas no LinkedIn</li>
    </ul>
  </div>

  <div class="summary-box">
    <p>
      <strong>Resumo executivo:</strong> Score ATS de <strong>${Math.round(ats)}/100</strong> (${label.toLowerCase()})
      ${results.strengths?.length ? `— ${results.strengths.length} pontos fortes identificados.` : "."}
      ${gain > 0 ? ` Com as optimizações aplicadas, o score projetado de <strong>${Math.round(projected)}/100</strong> representa +${gain} pontos — aumento significativo na taxa de passagem pelos filtros ATS.` : ""}
      ${results.missingKeywords?.length ? ` Prioridade imediata: incorporar as ${results.missingKeywords.length} keywords identificadas no CV e no LinkedIn.` : ""}
    </p>
  </div>

  <div class="page-footer">
    <strong>Leone Consultoria de Carreira</strong>
    <span>Relatório confidencial — ${esc(clientName)}</span>
    <span>Página 6</span>
  </div>
</div>

</body>
</html>`;
}

export async function generateClientReport(
  results: AnalysisResult,
  clientName: string = "Candidato"
): Promise<void> {
  const html     = buildHTML(results, clientName);
  const safeName = clientName.replace(/[^a-zA-ZÀ-ú\s]/g,"").trim().replace(/\s+/g,"_");

  const win = window.open("", "_blank", "width=960,height=800,scrollbars=yes");
  if (!win) {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `Relatorio_${safeName}.html`; a.click();
    URL.revokeObjectURL(url);
    return;
  }

  win.document.write(html);
  win.document.close();

  const doPrint = () => {
    if (!win.closed) { win.focus(); win.print(); win.onafterprint = () => win.close(); }
  };

  if (win.document.readyState === "complete") { setTimeout(doPrint, 700); }
  else { win.addEventListener("load", () => setTimeout(doPrint, 600)); setTimeout(doPrint, 2500); }
}
