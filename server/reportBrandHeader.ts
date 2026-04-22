/**
 * reportBrandHeader.ts
 * Helpers de branding Leone Berto Consultoria para PDFs gerados via jsPDF.
 * 
 * Cores conforme Brand Book oficial v2:
 *   Azul Marinho Profundo  #1B2F4A  RGB(27,47,74)
 *   Dourado Elegante       #C8A15E  RGB(200,161,94)
 *   Branco Puro            #FFFFFF
 *
 * Uso em clientReportGenerator.ts:
 *   import { drawReportHeader, drawReportFooter, drawSectionTitle, drawScoreBadge, LB_COLORS } from "./reportBrandHeader";
 *
 *   drawReportHeader(doc, 210, "Maria Silva", "22/04/2026");
 *   // ... conteúdo ...
 *   drawReportFooter(doc, 210, 297, 1, 3);
 */

// ── Paleta oficial Leone Berto Consultoria ────────────────────────────────────
export const LB_COLORS = {
  navy:       [27,  47,  74]  as [number, number, number], // #1B2F4A
  navyLight:  [42,  66,  97]  as [number, number, number], // #2A4261
  gold:       [200, 161, 94]  as [number, number, number], // #C8A15E
  goldLight:  [212, 178, 120] as [number, number, number], // #D4B278
  white:      [255, 255, 255] as [number, number, number],
  creamBg:    [245, 241, 235] as [number, number, number], // #F5F1EB
  gray:       [92,  79,  58]  as [number, number, number], // #5C4F3A
  grayLight:  [227, 220, 207] as [number, number, number], // #E3DCCF
} as const;

// ── Fontes built-in jsPDF ─────────────────────────────────────────────────────
export const LB_FONTS = {
  serif:      "times",     // aproxima Cinzel/Trajan
  sans:       "helvetica", // aproxima Open Sans/Lato
  mono:       "courier",
} as const;

// ── Cabeçalho ──────────────────────────────────────────────────────────────────
export function drawReportHeader(
  doc: import("jspdf").jsPDF,
  pageWidth: number,
  clientName?: string,
  reportDate?: string,
): number {
  const HEADER_H = 28;
  const MARGIN   = 14;

  // Fundo navy
  doc.setFillColor(...LB_COLORS.navy);
  doc.rect(0, 0, pageWidth, HEADER_H, "F");

  // Linha dourada inferior
  doc.setDrawColor(...LB_COLORS.gold);
  doc.setLineWidth(0.6);
  doc.line(0, HEADER_H, pageWidth, HEADER_H);

  // Monograma "L" (branco)
  doc.setFont(LB_FONTS.serif, "bold");
  doc.setFontSize(22);
  doc.setTextColor(...LB_COLORS.white);
  doc.text("L", MARGIN, 17);

  // Monograma "B" (dourado)
  doc.setTextColor(...LB_COLORS.gold);
  doc.text("B", MARGIN + 7, 17);

  // Seta ascendente dourada
  doc.setDrawColor(...LB_COLORS.gold);
  doc.setLineWidth(0.5);
  doc.line(MARGIN + 10, 15, MARGIN + 14, 11);
  doc.setFillColor(...LB_COLORS.gold);
  doc.triangle(
    MARGIN + 14, 11,
    MARGIN + 11.5, 12.5,
    MARGIN + 13, 14,
    "F"
  );

  // Separador vertical
  doc.setDrawColor(...LB_COLORS.white);
  doc.setLineWidth(0.3);
  const sepX = MARGIN + 19;
  doc.line(sepX, 5, sepX, HEADER_H - 5);

  // "LEONE BERTO"
  const textX = sepX + 5;
  doc.setFont(LB_FONTS.serif, "bold");
  doc.setFontSize(14);
  doc.setTextColor(...LB_COLORS.white);
  doc.text("LEONE BERTO", textX, 13);

  // Linha dourada + CONSULTORIA
  const lbWidth = doc.getTextWidth("LEONE BERTO");
  doc.setDrawColor(...LB_COLORS.gold);
  doc.setLineWidth(0.4);
  doc.line(textX, 15.5, textX + 14, 15.5);

  doc.setFont(LB_FONTS.sans, "normal");
  doc.setFontSize(6);
  doc.setTextColor(...LB_COLORS.gold);
  doc.setCharSpace(2.5);
  doc.text("CONSULTORIA", textX + 15, 16.5);
  doc.setCharSpace(0);

  const consultoriaEndX = textX + 15 + doc.getTextWidth("CONSULTORIA");
  doc.line(consultoriaEndX + 3, 15.5, textX + lbWidth + 24, 15.5);

  // Cliente (direita)
  doc.setFont(LB_FONTS.sans, "normal");
  doc.setFontSize(7);
  doc.setTextColor(...LB_COLORS.white);

  if (clientName) {
    doc.text(clientName, pageWidth - MARGIN, 11, { align: "right" });
  }

  if (reportDate) {
    doc.setTextColor(...LB_COLORS.gold);
    doc.setFontSize(6.5);
    doc.text(reportDate, pageWidth - MARGIN, 17, { align: "right" });
  }

  return HEADER_H + 6;
}

// ── Rodapé ────────────────────────────────────────────────────────────────────
export function drawReportFooter(
  doc: import("jspdf").jsPDF,
  pageWidth: number,
  pageHeight: number,
  currentPage: number,
  totalPages: number,
): void {
  const FOOTER_Y = pageHeight - 12;
  const MARGIN   = 14;

  doc.setDrawColor(...LB_COLORS.gold);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, FOOTER_Y, pageWidth - MARGIN, FOOTER_Y);

  doc.setFont(LB_FONTS.sans, "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...LB_COLORS.gray);
  doc.text("Leone Berto Consultoria · Estratégia de Carreira e Posicionamento Profissional", MARGIN, FOOTER_Y + 5);

  doc.setTextColor(...LB_COLORS.gold);
  doc.text(
    `Página ${currentPage} de ${totalPages}`,
    pageWidth - MARGIN,
    FOOTER_Y + 5,
    { align: "right" }
  );
}

// ── Título de seção ────────────────────────────────────────────────────────────
export function drawSectionTitle(
  doc: import("jspdf").jsPDF,
  title: string,
  y: number,
  pageWidth: number,
): number {
  const MARGIN = 14;

  doc.setFillColor(...LB_COLORS.creamBg);
  doc.rect(MARGIN, y, pageWidth - MARGIN * 2, 8, "F");

  doc.setFillColor(...LB_COLORS.gold);
  doc.rect(MARGIN, y, 2, 8, "F");

  doc.setFont(LB_FONTS.sans, "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...LB_COLORS.navy);
  doc.setCharSpace(1.5);
  doc.text(title.toUpperCase(), MARGIN + 5, y + 5.5);
  doc.setCharSpace(0);

  return y + 12;
}

// ── Badge de Score ────────────────────────────────────────────────────────────
export function drawScoreBadge(
  doc: import("jspdf").jsPDF,
  score: number,
  x: number,
  y: number,
  label: string,
  size = 12,
): void {
  let scoreColor: [number, number, number];
  if (score >= 75)      scoreColor = [34, 139, 34];
  else if (score >= 55) scoreColor = [200, 161, 94]; // LB_COLORS.gold
  else                  scoreColor = [185, 60, 60];

  doc.setFillColor(...LB_COLORS.navy);
  doc.circle(x, y, size, "F");

  doc.setDrawColor(...LB_COLORS.gold);
  doc.setLineWidth(0.8);
  doc.circle(x, y, size, "S");

  doc.setFont(LB_FONTS.serif, "bold");
  doc.setFontSize(size > 10 ? 18 : 13);
  doc.setTextColor(...scoreColor);
  doc.text(`${score}`, x, y + 2.5, { align: "center" });

  doc.setFont(LB_FONTS.sans, "normal");
  doc.setFontSize(6);
  doc.setTextColor(...LB_COLORS.gray);
  doc.setCharSpace(0.8);
  doc.text(label.toUpperCase(), x, y + size + 5, { align: "center" });
  doc.setCharSpace(0);
}
