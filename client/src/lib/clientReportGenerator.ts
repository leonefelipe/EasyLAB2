/**
 * clientReportGenerator.ts
 * Gera o PDF de entrega profissional para o cliente.
 * Usa jsPDF + html2canvas — funciona no browser, sem dependências extras.
 *
 * Uso no AnalysisLayout.tsx:
 *   import { generateClientReport } from "@/lib/clientReportGenerator";
 *   generateClientReport(results, clientName);
 */

import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import type { AnalysisResult } from "@/components/AnalysisLayout";

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function fmt(n: number): string {
  return new Intl.NumberFormat("pt-BR").format(n);
}

function today(): string {
  return new Date().toLocaleDateString("pt-BR", {
    day: "2-digit", month: "long", year: "numeric",
  });
}

// ─── HTML do relatório ────────────────────────────────────────────────────────

function buildReportHTML(results: AnalysisResult, clientName: string): string {
  const ats = results.atsScore ?? results.matchScore ?? 0;
  const projected = results.projectedMatchScore ?? 0;
  const gain = projected - ats;
  const color = scoreColor(ats);
  const label = scoreLabel(ats);

  const salary = results.salaryRange;
  const hasSalary = salary && salary.cltMin > 0;

  const breakdownRows = results.atsScoreBreakdown ? [
    ["Parseabilidade ATS", results.atsScoreBreakdown.parsing, 20],
    ["Match de palavras-chave", results.atsScoreBreakdown.keywordMatch, 25],
    ["Qualidade da experiência", results.atsScoreBreakdown.experienceQuality, 20],
    ["Métricas de impacto", results.atsScoreBreakdown.impactMetrics, 15],
    ["Formatação", results.atsScoreBreakdown.formatting, 10],
    ["Alinhamento de skills", results.atsScoreBreakdown.skillsAlignment, 10],
  ] : [];

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Serif+Display&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'DM Sans', Arial, sans-serif;
    font-size: 10pt;
    color: #1a1a2e;
    background: #ffffff;
    width: 794px;
    padding: 0;
  }

  /* ── Capa ── */
  .cover {
    background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 60%, #1d4ed8 100%);
    color: #ffffff;
    padding: 60px 56px 48px;
    min-height: 220px;
    position: relative;
    overflow: hidden;
  }
  .cover::after {
    content: '';
    position: absolute;
    top: -40px; right: -40px;
    width: 220px; height: 220px;
    border-radius: 50%;
    background: rgba(255,255,255,0.05);
  }
  .cover-tag {
    font-size: 8pt;
    font-weight: 600;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: #93c5fd;
    margin-bottom: 12px;
  }
  .cover-name {
    font-family: 'DM Serif Display', Georgia, serif;
    font-size: 28pt;
    font-weight: 400;
    line-height: 1.15;
    color: #ffffff;
    margin-bottom: 8px;
  }
  .cover-sub {
    font-size: 10pt;
    color: #bfdbfe;
    margin-bottom: 20px;
  }
  .cover-meta {
    font-size: 8.5pt;
    color: #93c5fd;
    padding-top: 16px;
    border-top: 1px solid rgba(255,255,255,0.15);
  }

  /* ── Layout principal ── */
  .body { padding: 36px 56px; }

  /* ── Score hero ── */
  .score-hero {
    display: flex;
    align-items: center;
    gap: 28px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 24px 28px;
    margin-bottom: 28px;
  }
  .score-ring {
    width: 88px; height: 88px;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
    font-size: 22pt;
    font-weight: 700;
    color: #ffffff;
  }
  .score-info h2 { font-size: 13pt; font-weight: 600; color: #1e293b; margin-bottom: 4px; }
  .score-info p { font-size: 9.5pt; color: #64748b; line-height: 1.5; }
  .score-pills { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
  .pill {
    font-size: 8.5pt; font-weight: 500;
    padding: 3px 10px; border-radius: 20px;
  }
  .pill-green { background: #dcfce7; color: #166534; }
  .pill-blue  { background: #dbeafe; color: #1e40af; }
  .pill-amber { background: #fef3c7; color: #92400e; }

  /* ── Secções ── */
  .section { margin-bottom: 24px; }
  .section-title {
    font-size: 8.5pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1.4px;
    color: #1e3a8a;
    border-bottom: 2px solid #1e3a8a;
    padding-bottom: 5px;
    margin-bottom: 14px;
  }

  /* ── Breakdown ── */
  .bar-row { margin-bottom: 10px; }
  .bar-label {
    display: flex; justify-content: space-between;
    font-size: 9pt; color: #334155; margin-bottom: 4px;
  }
  .bar-track {
    height: 7px; background: #e2e8f0; border-radius: 4px; overflow: hidden;
  }
  .bar-fill { height: 100%; border-radius: 4px; }

  /* ── Listas ── */
  .tag-cloud { display: flex; flex-wrap: wrap; gap: 6px; }
  .tag {
    font-size: 8.5pt; font-weight: 500;
    padding: 4px 10px; border-radius: 6px;
    background: #eff6ff; color: #1d4ed8;
    border: 1px solid #bfdbfe;
  }
  .tag-miss {
    background: #fff7ed; color: #9a3412;
    border: 1px solid #fed7aa;
  }
  .check-list { list-style: none; }
  .check-list li {
    font-size: 9.5pt; color: #334155;
    padding: 5px 0; padding-left: 18px;
    border-bottom: 1px solid #f1f5f9;
    position: relative; line-height: 1.5;
  }
  .check-list li::before {
    content: '✓';
    position: absolute; left: 0;
    color: #16a34a; font-weight: 700;
  }
  .risk-list li::before { content: '!'; color: #dc2626; }

  /* ── Salário ── */
  .salary-grid {
    display: grid; grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .salary-card {
    background: #f8fafc; border: 1px solid #e2e8f0;
    border-radius: 8px; padding: 14px 16px;
  }
  .salary-card .s-label { font-size: 8pt; color: #64748b; margin-bottom: 4px; }
  .salary-card .s-range { font-size: 12pt; font-weight: 600; color: #1e293b; }
  .salary-card .s-sub { font-size: 8pt; color: #94a3b8; margin-top: 2px; }

  /* ── Recruiter profile ── */
  .rp-box {
    background: #fafafa; border-left: 3px solid #1e3a8a;
    border-radius: 0 8px 8px 0;
    padding: 14px 16px; margin-bottom: 12px;
  }
  .rp-label { font-size: 8pt; font-weight: 600; color: #64748b; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.8px; }
  .rp-text { font-size: 9.5pt; color: #334155; line-height: 1.55; }

  /* ── Rodapé ── */
  .footer {
    margin-top: 32px;
    padding-top: 16px;
    border-top: 1px solid #e2e8f0;
    font-size: 8pt; color: #94a3b8;
    text-align: center;
  }
  .footer strong { color: #1e3a8a; }
</style>
</head>
<body>

<!-- ── Capa ── -->
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

<!-- ── Score principal ── -->
<div class="score-hero">
  <div class="score-ring" style="background:${color}">
    ${Math.round(ats)}
  </div>
  <div class="score-info">
    <h2>Score ATS: ${label}</h2>
    <p>
      O teu CV foi analisado contra os principais sistemas de triagem automática (ATS)
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

<!-- ── Breakdown ATS ── -->
${breakdownRows.length > 0 ? `
<div class="section">
  <div class="section-title">Análise detalhada ATS</div>
  ${breakdownRows.map(([label, val, max]) => {
    const pct = Math.round(((val as number) / (max as number)) * 100);
    const c = pct >= 75 ? "#16a34a" : pct >= 50 ? "#d97706" : "#dc2626";
    return `
    <div class="bar-row">
      <div class="bar-label">
        <span>${label}</span>
        <span style="font-weight:600;color:${c}">${val}/${max}</span>
      </div>
      <div class="bar-track">
        <div class="bar-fill" style="width:${pct}%;background:${c}"></div>
      </div>
    </div>`;
  }).join("")}
</div>` : ""}

<!-- ── Pontos fortes ── -->
${results.strengths && results.strengths.length > 0 ? `
<div class="section">
  <div class="section-title">Pontos fortes identificados</div>
  <ul class="check-list">
    ${results.strengths.slice(0, 6).map(s => `<li>${s}</li>`).join("")}
  </ul>
</div>` : ""}

<!-- ── Palavras-chave presentes ── -->
${results.keywords && results.keywords.length > 0 ? `
<div class="section">
  <div class="section-title">Palavras-chave identificadas no CV</div>
  <div class="tag-cloud">
    ${results.keywords.slice(0, 20).map(k => `<span class="tag">${k}</span>`).join("")}
  </div>
</div>` : ""}

<!-- ── Keywords em falta ── -->
${results.missingKeywords && results.missingKeywords.length > 0 ? `
<div class="section">
  <div class="section-title">Palavras-chave a adicionar</div>
  <div class="tag-cloud">
    ${results.missingKeywords.slice(0, 16).map(k => `<span class="tag tag-miss">${k}</span>`).join("")}
  </div>
</div>` : ""}

<!-- ── Vantagens competitivas ── -->
${results.competitiveEdges && results.competitiveEdges.length > 0 ? `
<div class="section">
  <div class="section-title">Vantagens competitivas</div>
  <ul class="check-list">
    ${results.competitiveEdges.slice(0, 5).map(e => `<li>${e}</li>`).join("")}
  </ul>
</div>` : ""}

<!-- ── Riscos ── -->
${results.competitiveRisks && results.competitiveRisks.length > 0 ? `
<div class="section">
  <div class="section-title">Pontos de atenção</div>
  <ul class="check-list risk-list">
    ${results.competitiveRisks.slice(0, 4).map(r => `<li>${r}</li>`).join("")}
  </ul>
</div>` : ""}

<!-- ── Salário ── -->
${hasSalary ? `
<div class="section">
  <div class="section-title">Inteligência salarial de mercado</div>
  <div class="salary-grid">
    <div class="salary-card">
      <div class="s-label">Regime CLT — Faixa mensal bruta</div>
      <div class="s-range">R$ ${fmt(salary!.cltMin)} – R$ ${fmt(salary!.cltMax)}</div>
      <div class="s-sub">Confiança: ${salary!.confidence === "high" ? "Alta" : salary!.confidence === "medium" ? "Média" : "Baixa"}</div>
    </div>
    <div class="salary-card">
      <div class="s-label">Regime PJ — Faixa mensal</div>
      <div class="s-range">R$ ${fmt(salary!.pjMin)} – R$ ${fmt(salary!.pjMax)}</div>
      <div class="s-sub">Multiplicador 1.35–1.50×</div>
    </div>
  </div>
  ${salary!.rationale ? `<p style="font-size:9pt;color:#64748b;margin-top:10px;line-height:1.5">${salary!.rationale}</p>` : ""}
</div>` : ""}

<!-- ── Perfil do recrutador ── -->
${results.recruiterProfile ? `
<div class="section">
  <div class="section-title">Perfil do recrutador-alvo</div>
  <div class="rp-box">
    <div class="rp-label">Narrativa ideal</div>
    <div class="rp-text">${results.recruiterProfile.idealNarrative}</div>
  </div>
  ${results.recruiterProfile.recruiterTriggers && results.recruiterProfile.recruiterTriggers.length > 0 ? `
  <div class="rp-box" style="border-left-color:#16a34a">
    <div class="rp-label">O que atrai o recrutador</div>
    <div class="rp-text">${results.recruiterProfile.recruiterTriggers.slice(0, 3).join(" · ")}</div>
  </div>` : ""}
  ${results.recruiterProfile.recruiterFears && results.recruiterProfile.recruiterFears.length > 0 ? `
  <div class="rp-box" style="border-left-color:#dc2626">
    <div class="rp-label">O que preocupa o recrutador</div>
    <div class="rp-text">${results.recruiterProfile.recruiterFears.slice(0, 3).join(" · ")}</div>
  </div>` : ""}
</div>` : ""}

<!-- ── Dicas de negociação ── -->
${results.negotiationTips && results.negotiationTips.length > 0 ? `
<div class="section">
  <div class="section-title">Dicas de negociação salarial</div>
  <ul class="check-list">
    ${results.negotiationTips.slice(0, 4).map(t => `<li>${t}</li>`).join("")}
  </ul>
</div>` : ""}

<!-- ── Próximos passos ── -->
<div class="section">
  <div class="section-title">Próximos passos recomendados</div>
  <ul class="check-list">
    <li>Substituir o CV original pelo CV optimizado entregue em anexo</li>
    <li>Actualizar o headline do LinkedIn com as palavras-chave identificadas</li>
    <li>Adicionar as palavras-chave em falta na secção "Sobre" e nas experiências</li>
    ${results.missingKeywords && results.missingKeywords.length > 0 ? `<li>Incorporar gradualmente: ${results.missingKeywords.slice(0, 4).join(", ")}</li>` : ""}
    <li>Solicitar recomendações de ex-gestores no LinkedIn</li>
  </ul>
</div>

<div class="footer">
  Relatório confidencial preparado por <strong>Leone Consultoria de Carreira</strong> &nbsp;·&nbsp;
  Análise gerada com tecnologia proprietária de inteligência de mercado &nbsp;·&nbsp;
  ${today()}
</div>

</div>
</body>
</html>`;
}

// ─── Gerador principal ────────────────────────────────────────────────────────

export async function generateClientReport(
  results: AnalysisResult,
  clientName: string = "Candidato"
): Promise<void> {
  const html = buildReportHTML(results, clientName);

  const iframe = document.createElement("iframe");
  iframe.style.cssText =
    "position:fixed;top:-9999px;left:-9999px;width:794px;height:2000px;border:none;visibility:hidden;";
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument!;
  doc.open();
  doc.write(html);
  doc.close();

  // Aguarda fontes e layout
  await new Promise(r => setTimeout(r, 1200));

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

    const safeName = clientName.replace(/[^a-zA-ZÀ-ú\s]/g, "").trim().replace(/\s+/g, "_");
    pdf.save(`Relatorio_${safeName}.pdf`);
  } finally {
    document.body.removeChild(iframe);
  }
}
