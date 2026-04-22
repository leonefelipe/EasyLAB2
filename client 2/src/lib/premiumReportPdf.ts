import { jsPDF } from "jspdf";

export interface PremiumReportData {
  clientName: string;
  generatedAt: string;
  executiveSummary: {
    headline: string;
    diagnosis: string;
    beforeAfter: { before: string; after: string };
    valueDelivered: string[];
  };
  atsAnalysis: {
    currentScore: number;
    projectedScore: number;
    breakdown: { name: string; current: number; max: number }[];
    whatWasWrong: string[];
    whatWasFixed: string[];
    strategicRationale: string;
  };
  recruiterPerception: {
    currentRead: string;
    optimizedRead: string;
    triggers: string[];
    fears: string[];
    idealNarrative: string;
  };
  cvOptimization: {
    strategicSummary: string;
    improvedBullets: { section: string; before: string; after: string; reasoning: string }[];
    missingKeywords: string[];
    seniorityLevel: string;
    careerTrajectory: string;
  };
  linkedinOptimization: {
    currentScore: number;
    profileStrength: number;
    ssiEstimate: number;
    recruiterVisibility: number;
    headline: { before: string; after: string; rationale: string };
    about: { before: string; after: string; rationale: string };
    missingKeywords: string[];
    topStrengths: string[];
    quickWins: string[];
  };
  strategicKeywords: { primary: string[]; secondary: string[]; rationale: string };
  nextSteps: string[];
  closingMessage: string;
}

const NAVY: [number, number, number] = [27, 47, 74];
const GOLD: [number, number, number] = [200, 161, 94];
const WHITE: [number, number, number] = [255, 255, 255];
const GRAY_DARK: [number, number, number] = [60, 60, 60];
const GRAY: [number, number, number] = [90, 90, 90];
const CREAM: [number, number, number] = [245, 241, 235];

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 18;
const CONTENT_W = PAGE_W - MARGIN * 2;

export function generatePremiumReportPDF(data: PremiumReportData): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  let pageNumber = 1;

  function drawHeader() {
    doc.setFillColor(...NAVY);
    doc.rect(0, 0, PAGE_W, 22, "F");
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.6);
    doc.line(0, 22, PAGE_W, 22);

    doc.setFont("times", "bold");
    doc.setFontSize(18);
    doc.setTextColor(...WHITE);
    doc.text("L", MARGIN, 14);
    doc.setTextColor(...GOLD);
    doc.text("B", MARGIN + 5.5, 14);

    doc.setDrawColor(...WHITE);
    doc.setLineWidth(0.3);
    doc.line(MARGIN + 13, 4, MARGIN + 13, 18);

    doc.setFont("times", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...WHITE);
    doc.text("LEONE BERTO", MARGIN + 16, 11);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.5);
    doc.setTextColor(...GOLD);
    doc.setCharSpace(2.5);
    doc.text("CONSULTORIA", MARGIN + 16, 16);
    doc.setCharSpace(0);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(...WHITE);
    doc.text("ESTRATÉGIA DE CARREIRA E POSICIONAMENTO PROFISSIONAL", MARGIN + 16, 19);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...GOLD);
    const dateStr = new Date(data.generatedAt).toLocaleDateString("pt-BR");
    doc.text(dateStr, PAGE_W - MARGIN, 14, { align: "right" });
  }

  function drawFooter() {
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.4);
    doc.line(MARGIN, PAGE_H - 14, PAGE_W - MARGIN, PAGE_H - 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...GRAY);
    doc.text("Leone Berto Consultoria · Relatório Estratégico Premium", MARGIN, PAGE_H - 9);
    doc.setTextColor(...GOLD);
    doc.text(`Página ${pageNumber}`, PAGE_W - MARGIN, PAGE_H - 9, { align: "right" });
  }

  let y = 30;

  function ensureSpace(h: number) {
    if (y + h > PAGE_H - 20) {
      drawFooter();
      doc.addPage();
      pageNumber++;
      drawHeader();
      y = 30;
    }
  }

  function sectionTitle(title: string) {
    ensureSpace(14);
    doc.setFillColor(...CREAM);
    doc.rect(MARGIN, y, CONTENT_W, 9, "F");
    doc.setFillColor(...GOLD);
    doc.rect(MARGIN, y, 2, 9, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...NAVY);
    doc.setCharSpace(1.2);
    doc.text(title.toUpperCase(), MARGIN + 5, y + 6);
    doc.setCharSpace(0);
    y += 13;
  }

  function subTitle(title: string) {
    ensureSpace(8);
    doc.setFont("times", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...NAVY);
    doc.text(title, MARGIN, y);
    y += 6;
  }

  function paragraph(text: string, size = 9) {
    if (!text) return;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(size);
    doc.setTextColor(...GRAY_DARK);
    const lines = doc.splitTextToSize(text, CONTENT_W);
    for (const line of lines) {
      ensureSpace(5);
      doc.text(line, MARGIN, y);
      y += size * 0.45 + 1.3;
    }
    y += 1;
  }

  function bulletList(items: string[], size = 9) {
    if (!items || items.length === 0) return;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(size);
    doc.setTextColor(...GRAY_DARK);
    for (const item of items) {
      const lines = doc.splitTextToSize(item, CONTENT_W - 6);
      ensureSpace(5);
      doc.setTextColor(...GOLD);
      doc.text("▸", MARGIN, y);
      doc.setTextColor(...GRAY_DARK);
      doc.text(lines[0], MARGIN + 4, y);
      y += size * 0.45 + 1.3;
      for (let i = 1; i < lines.length; i++) {
        ensureSpace(5);
        doc.text(lines[i], MARGIN + 4, y);
        y += size * 0.45 + 1.3;
      }
    }
    y += 1;
  }

  function scoreBadge(x: number, label: string, value: number, max = 100) {
    const radius = 10;
    doc.setFillColor(...NAVY);
    doc.circle(x, y + radius, radius, "F");
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.8);
    doc.circle(x, y + radius, radius, "S");
    doc.setFont("times", "bold");
    doc.setFontSize(14);
    doc.setTextColor(...GOLD);
    doc.text(`${value}`, x, y + radius + 1.5, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.5);
    doc.setTextColor(...GRAY_DARK);
    doc.setCharSpace(0.5);
    const labelLines = doc.splitTextToSize(label.toUpperCase(), 28);
    doc.text(labelLines, x, y + radius * 2 + 4, { align: "center" });
    doc.setCharSpace(0);
  }

  function beforeAfterBlock(before: string, after: string) {
    const colW = (CONTENT_W - 4) / 2;
    const needed = 30 + Math.ceil(Math.max(before.length, after.length) / 70) * 4;
    ensureSpace(needed);

    const startY = y;

    doc.setFillColor(250, 245, 245);
    doc.rect(MARGIN, y, colW, needed - 2, "F");
    doc.setDrawColor(200, 100, 100);
    doc.setLineWidth(0.3);
    doc.line(MARGIN, y, MARGIN, y + needed - 2);

    doc.setFillColor(245, 250, 245);
    doc.rect(MARGIN + colW + 4, y, colW, needed - 2, "F");
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.5);
    doc.line(MARGIN + colW + 4, y, MARGIN + colW + 4, y + needed - 2);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(160, 60, 60);
    doc.text("ANTES", MARGIN + 3, y + 5);
    doc.setTextColor(...GOLD);
    doc.text("DEPOIS", MARGIN + colW + 7, y + 5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...GRAY_DARK);
    const beforeLines = doc.splitTextToSize(before || "—", colW - 6);
    const afterLines = doc.splitTextToSize(after || "—", colW - 6);

    let ly = startY + 9;
    for (const line of beforeLines) {
      doc.text(line, MARGIN + 3, ly);
      ly += 3.8;
    }
    ly = startY + 9;
    for (const line of afterLines) {
      doc.text(line, MARGIN + colW + 7, ly);
      ly += 3.8;
    }

    y += needed;
  }

  function keywordChips(keywords: string[]) {
    if (!keywords || keywords.length === 0) return;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    let cx = MARGIN;
    const chipPadX = 3;
    const chipH = 5.5;
    for (const kw of keywords) {
      const w = doc.getTextWidth(kw) + chipPadX * 2;
      if (cx + w > PAGE_W - MARGIN) {
        y += chipH + 2;
        cx = MARGIN;
        ensureSpace(chipH + 2);
      }
      doc.setFillColor(...CREAM);
      doc.roundedRect(cx, y, w, chipH, 1, 1, "F");
      doc.setTextColor(...NAVY);
      doc.text(kw, cx + chipPadX, y + 4);
      cx += w + 2;
    }
    y += chipH + 4;
  }

  drawHeader();

  doc.setFont("times", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...NAVY);
  doc.text("Relatório Estratégico Premium", MARGIN, 40);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...GOLD);
  doc.setCharSpace(2);
  doc.text("DIAGNÓSTICO · ESTRATÉGIA · POSICIONAMENTO", MARGIN, 46);
  doc.setCharSpace(0);

  doc.setFont("times", "normal");
  doc.setFontSize(12);
  doc.setTextColor(...GRAY_DARK);
  doc.text(`Cliente: `, MARGIN, 58);
  doc.setFont("times", "bold");
  doc.setTextColor(...NAVY);
  doc.text(data.clientName, MARGIN + 17, 58);

  y = 70;

  sectionTitle("Sumário Executivo");

  doc.setFont("times", "bolditalic");
  doc.setFontSize(12);
  doc.setTextColor(...NAVY);
  const headlineLines = doc.splitTextToSize(data.executiveSummary.headline, CONTENT_W);
  for (const l of headlineLines) {
    ensureSpace(6);
    doc.text(l, MARGIN, y);
    y += 5.5;
  }
  y += 2;

  paragraph(data.executiveSummary.diagnosis, 9);
  y += 1;

  subTitle("Antes vs. Depois");
  beforeAfterBlock(data.executiveSummary.beforeAfter.before, data.executiveSummary.beforeAfter.after);

  subTitle("Valor Entregue");
  bulletList(data.executiveSummary.valueDelivered);

  sectionTitle("Análise ATS — Applicant Tracking System");

  ensureSpace(40);
  const badgesY = y;
  scoreBadge(MARGIN + 15, "Score Atual", data.atsAnalysis.currentScore);
  scoreBadge(MARGIN + 55, "Score Projetado", data.atsAnalysis.projectedScore);
  y = badgesY + 32;

  subTitle("Breakdown Técnico");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  for (const b of data.atsAnalysis.breakdown) {
    ensureSpace(6);
    const barX = MARGIN + 55;
    const barW = 80;
    const pct = b.max > 0 ? b.current / b.max : 0;
    doc.setTextColor(...GRAY_DARK);
    doc.text(b.name, MARGIN, y + 3);
    doc.setFillColor(230, 230, 230);
    doc.rect(barX, y, barW, 3, "F");
    doc.setFillColor(...GOLD);
    doc.rect(barX, y, barW * pct, 3, "F");
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...NAVY);
    doc.text(`${b.current}/${b.max}`, barX + barW + 3, y + 3);
    doc.setFont("helvetica", "normal");
    y += 6;
  }
  y += 2;

  subTitle("O que estava prejudicando");
  bulletList(data.atsAnalysis.whatWasWrong);

  subTitle("O que foi corrigido");
  bulletList(data.atsAnalysis.whatWasFixed);

  subTitle("Racional estratégico");
  paragraph(data.atsAnalysis.strategicRationale);

  sectionTitle("Percepção do Recrutador");

  subTitle("Como o perfil era lido");
  paragraph(data.recruiterPerception.currentRead);

  subTitle("Como será lido agora");
  paragraph(data.recruiterPerception.optimizedRead);

  subTitle("O que ativa interesse");
  bulletList(data.recruiterPerception.triggers);

  subTitle("O que gera receio (e foi neutralizado)");
  bulletList(data.recruiterPerception.fears);

  subTitle("Narrativa ideal");
  paragraph(data.recruiterPerception.idealNarrative);

  sectionTitle("Otimização do Currículo");

  subTitle("Síntese estratégica");
  paragraph(data.cvOptimization.strategicSummary);

  ensureSpace(10);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...NAVY);
  doc.text(`Senioridade detectada: `, MARGIN, y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...GRAY_DARK);
  doc.text(data.cvOptimization.seniorityLevel, MARGIN + 40, y);
  y += 5;
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...NAVY);
  doc.text(`Trajetória: `, MARGIN, y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...GRAY_DARK);
  const trajLines = doc.splitTextToSize(data.cvOptimization.careerTrajectory, CONTENT_W - 25);
  doc.text(trajLines[0] || "", MARGIN + 21, y);
  y += 5;
  for (let i = 1; i < trajLines.length; i++) {
    ensureSpace(5);
    doc.text(trajLines[i], MARGIN + 21, y);
    y += 4;
  }
  y += 3;

  subTitle("Bullets reescritos");
  for (const b of data.cvOptimization.improvedBullets) {
    ensureSpace(15);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...GOLD);
    doc.text(b.section.toUpperCase(), MARGIN, y);
    y += 4;
    beforeAfterBlock(b.before, b.after);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7.5);
    doc.setTextColor(...GRAY);
    const rLines = doc.splitTextToSize(`Por que funciona: ${b.reasoning}`, CONTENT_W);
    for (const l of rLines) {
      ensureSpace(4);
      doc.text(l, MARGIN, y);
      y += 3.5;
    }
    y += 2;
  }

  subTitle("Palavras-chave integradas ao CV");
  keywordChips(data.cvOptimization.missingKeywords);

  sectionTitle("Otimização do LinkedIn");

  ensureSpace(34);
  const liBadgesY = y;
  scoreBadge(MARGIN + 12, "Força do Perfil", data.linkedinOptimization.profileStrength);
  scoreBadge(MARGIN + 48, "SSI Estimado", data.linkedinOptimization.ssiEstimate);
  scoreBadge(MARGIN + 84, "Visibilidade Recrutador", data.linkedinOptimization.recruiterVisibility);
  y = liBadgesY + 32;

  subTitle("Headline");
  beforeAfterBlock(data.linkedinOptimization.headline.before, data.linkedinOptimization.headline.after);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7.5);
  doc.setTextColor(...GRAY);
  const hrLines = doc.splitTextToSize(data.linkedinOptimization.headline.rationale, CONTENT_W);
  for (const l of hrLines) {
    ensureSpace(4);
    doc.text(l, MARGIN, y);
    y += 3.5;
  }
  y += 3;

  subTitle("Sobre (About)");
  beforeAfterBlock(data.linkedinOptimization.about.before, data.linkedinOptimization.about.after);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7.5);
  doc.setTextColor(...GRAY);
  const arLines = doc.splitTextToSize(data.linkedinOptimization.about.rationale, CONTENT_W);
  for (const l of arLines) {
    ensureSpace(4);
    doc.text(l, MARGIN, y);
    y += 3.5;
  }
  y += 3;

  subTitle("Palavras-chave a adicionar no LinkedIn");
  keywordChips(data.linkedinOptimization.missingKeywords);

  subTitle("Quick wins — ganhos rápidos no LinkedIn");
  bulletList(data.linkedinOptimization.quickWins);

  subTitle("Pontos fortes do perfil");
  bulletList(data.linkedinOptimization.topStrengths);

  sectionTitle("Palavras-chave Estratégicas");

  subTitle("Primárias — uso intensivo");
  keywordChips(data.strategicKeywords.primary);

  subTitle("Secundárias — uso complementar");
  keywordChips(data.strategicKeywords.secondary);

  subTitle("Racional de seleção");
  paragraph(data.strategicKeywords.rationale);

  sectionTitle("Próximos Passos");
  bulletList(data.nextSteps);

  sectionTitle("Mensagem de Fechamento");
  doc.setFont("times", "italic");
  doc.setFontSize(10);
  doc.setTextColor(...NAVY);
  const closeLines = doc.splitTextToSize(data.closingMessage, CONTENT_W);
  for (const l of closeLines) {
    ensureSpace(5);
    doc.text(l, MARGIN, y);
    y += 5;
  }

  drawFooter();

  return doc;
}
