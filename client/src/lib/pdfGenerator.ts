import jsPDF from "jspdf";

/**
 * Gera um PDF profissional de currículo usando jsPDF puro no frontend.
 * Funciona em qualquer ambiente (local e produção) sem depender de Puppeteer/Chromium.
 */
export function generateResumePDF(resumeText: string, lang: "pt" | "en" = "pt"): void {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  // Configurações de página A4
  const pageWidth = 210;
  const pageHeight = 297;
  const marginLeft = 20;
  const marginRight = 20;
  const marginTop = 20;
  const marginBottom = 20;
  const contentWidth = pageWidth - marginLeft - marginRight;

  // Cores
  const colorPrimary = [30, 58, 138] as [number, number, number];    // azul escuro
  const colorText = [30, 30, 30] as [number, number, number];         // quase preto
  const colorMuted = [100, 116, 139] as [number, number, number];     // cinza
  const colorBullet = [30, 58, 138] as [number, number, number];      // azul

  // Normaliza quebras de linha
  const normalized = resumeText
    .replace(/\\n/g, "\n")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");

  const lines = normalized.split("\n");

  let y = marginTop;
  let isFirstNonEmpty = true;

  const isSectionTitle = (line: string): boolean => {
    const t = line.trim();
    if (t.length < 4) return false;
    const alpha = t.replace(/[^a-zA-ZÀ-ÿ]/g, "");
    if (!alpha.length) return false;
    const upper = t.replace(/[^A-ZÀ-ÖØ-Þ]/g, "");
    return upper.length / alpha.length >= 0.7;
  };

  const isBullet = (line: string): boolean =>
    /^[•\-\*\u2022\u2023\u25E6\u2043]/.test(line.trim());

  const isJobLine = (line: string): boolean =>
    /[|\u2014\u2013]/.test(line.trim()) || /\(\d{4}/.test(line.trim());

  const addPage = () => {
    doc.addPage();
    y = marginTop;
  };

  const checkPageBreak = (neededHeight: number) => {
    if (y + neededHeight > pageHeight - marginBottom) {
      addPage();
    }
  };

  const addWrappedText = (
    text: string,
    fontSize: number,
    color: [number, number, number],
    bold: boolean,
    indent: number = 0,
    lineHeightFactor: number = 1.4
  ): number => {
    doc.setFontSize(fontSize);
    doc.setTextColor(...color);
    doc.setFont("helvetica", bold ? "bold" : "normal");

    const maxWidth = contentWidth - indent;
    const wrappedLines = doc.splitTextToSize(text, maxWidth);
    const lineHeight = fontSize * 0.352778 * lineHeightFactor; // pt to mm

    for (const wl of wrappedLines) {
      checkPageBreak(lineHeight + 1);
      doc.text(wl, marginLeft + indent, y);
      y += lineHeight;
    }
    return wrappedLines.length * lineHeight;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    // Linha vazia — espaço pequeno
    if (!line) {
      y += 2;
      continue;
    }

    // Nome do candidato (primeira linha não vazia)
    if (isFirstNonEmpty) {
      isFirstNonEmpty = false;
      checkPageBreak(12);
      doc.setFontSize(18);
      doc.setTextColor(...colorPrimary);
      doc.setFont("helvetica", "bold");
      doc.text(line, marginLeft, y);
      y += 9;
      continue;
    }

    // Título de seção (MAIÚSCULAS)
    if (isSectionTitle(line)) {
      y += 4; // espaço antes da seção
      checkPageBreak(10);

      // Linha separadora azul
      doc.setDrawColor(...colorPrimary);
      doc.setLineWidth(0.4);
      doc.line(marginLeft, y - 1, pageWidth - marginRight, y - 1);

      doc.setFontSize(8.5);
      doc.setTextColor(...colorPrimary);
      doc.setFont("helvetica", "bold");
      doc.text(line, marginLeft, y + 3);
      y += 7;
      continue;
    }

    // Bullet point
    if (isBullet(line)) {
      const text = line.replace(/^[•\-\*\u2023\u25E6\u2043]\s*/, "");
      checkPageBreak(6);

      // Marcador
      doc.setFontSize(9);
      doc.setTextColor(...colorBullet);
      doc.setFont("helvetica", "normal");
      doc.text("•", marginLeft + 2, y);

      // Texto do bullet com indent
      doc.setTextColor(...colorText);
      const wrappedLines = doc.splitTextToSize(text, contentWidth - 8);
      const lineH = 9 * 0.352778 * 1.4;
      for (let wi = 0; wi < wrappedLines.length; wi++) {
        checkPageBreak(lineH);
        doc.text(wrappedLines[wi], marginLeft + 6, y);
        y += lineH;
      }
      continue;
    }

    // Linha de cargo/empresa (contém | ou — ou (YYYY)
    if (isJobLine(line)) {
      y += 1;
      addWrappedText(line, 9.5, colorText, true, 0, 1.3);
      continue;
    }

    // Linha de contato (segunda linha — geralmente tem | separando info)
    if (line.includes("|") && !isJobLine(line)) {
      addWrappedText(line, 8.5, colorMuted, false, 0, 1.3);
      continue;
    }

    // Texto normal
    addWrappedText(line, 9, colorText, false, 0, 1.4);
  }

  // Rodapé em todas as páginas
  const totalPages = (doc as jsPDF & { internal: { getNumberOfPages: () => number } }).internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setTextColor(...colorMuted);
    doc.setFont("helvetica", "normal");
    const footer = lang === "en"
      ? `Generated by Easy Job AI • Page ${p} of ${totalPages}`
      : `Gerado por Easy Job AI • Página ${p} de ${totalPages}`;
    doc.text(footer, pageWidth / 2, pageHeight - 8, { align: "center" });
  }

  const fileName = lang === "en" ? "resume-optimized-en.pdf" : "curriculo-otimizado.pdf";
  doc.save(fileName);
}
