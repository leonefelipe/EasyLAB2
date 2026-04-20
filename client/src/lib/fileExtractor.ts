/**
 * Extração de texto de currículos — PDF, DOCX, TXT
 *
 * DOCX: usa jszip (já no projeto) com parsing semântico do word/document.xml.
 *       Preserva parágrafos, bullets, quebras de linha e estrutura de seções.
 *       Muito melhor que um simples strip de tags — entende <w:p>, <w:r>,
 *       <w:br>, <w:tab>, listas e estilos de heading.
 *
 * PDF:  usa pdfjs-dist com reconstrução de linhas por coordenada Y,
 *       preservando ordem de leitura, seções, bullets e datas.
 */

import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

// ─── PDF ─────────────────────────────────────────────────────────────────────

export async function extractTextFromPDF(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const { items } = await page.getTextContent();

    type PdfItem = { str: string; transform: number[] };
    const lines: Map<number, string[]> = new Map();

    for (const raw of items) {
      const item = raw as PdfItem;
      if (!item.str.trim()) continue;
      // Bucket Y to 3pt grid so nearby text merges into the same line
      const y = Math.round(item.transform[5] / 3) * 3;
      if (!lines.has(y)) lines.set(y, []);
      lines.get(y)!.push(item.str);
    }

    // Sort top→bottom (higher Y = higher on page in PDF coord space)
    const sorted = [...lines.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, words]) => words.join(" ").trim())
      .filter(Boolean);

    pages.push(sorted.join("\n"));
  }

  const result = pages.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();

  if (!result || result.length < 50) {
    throw new Error(
      "O PDF parece ser uma imagem escaneada ou está protegido. " +
      "Por favor, converta para DOCX ou copie o texto manualmente."
    );
  }

  return result;
}

// ─── DOCX ─────────────────────────────────────────────────────────────────────

/**
 * Parses word/document.xml semantically using jszip.
 *
 * Strategy:
 * - Each <w:p> (paragraph) becomes one line / bullet point
 * - <w:br w:type="page"> inserts a blank line (page break → section separator)
 * - <w:tab> inserts a tab character (preserves table-like alignment)
 * - Consecutive empty paragraphs are collapsed to max 2 blank lines
 * - Heading paragraphs (w:pStyle containing "Heading" or "Ttulo") get an
 *   extra blank line before them so sections are visually separated
 *
 * This produces text that faithfully mirrors what a human reads in Word,
 * including bullet lists, dates, section titles, and multi-column layouts
 * rendered as sequential paragraphs.
 */
export async function extractTextFromDOCX(file: File): Promise<string> {
  const { default: JSZip } = await import("jszip");
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  const xmlFile = zip.file("word/document.xml");
  if (!xmlFile) throw new Error("Arquivo DOCX inválido ou corrompido.");

  const xml = await xmlFile.async("text");

  // Parse with DOMParser (available in browser)
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "application/xml");

  const NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

  const paragraphs = doc.getElementsByTagNameNS(NS, "p");
  const lines: string[] = [];

  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i];

    // Detect heading style for section separation
    const pStyle = para.querySelector("pStyle");
    const styleName = pStyle?.getAttributeNS(NS, "val") ?? "";
    const isHeading = /heading|h[1-6]|título|titulo|title|section/i.test(styleName);

    // Extract text runs, handling <w:br> and <w:tab> inline
    const parts: string[] = [];
    const runs = para.getElementsByTagNameNS(NS, "r");

    for (let j = 0; j < runs.length; j++) {
      const run = runs[j];

      // Handle tab characters
      const tabs = run.getElementsByTagNameNS(NS, "tab");
      if (tabs.length > 0) parts.push("\t");

      // Handle explicit line breaks within a run
      const breaks = run.getElementsByTagNameNS(NS, "br");
      for (let k = 0; k < breaks.length; k++) {
        parts.push("\n");
      }

      // Text content — <w:t> elements
      const textNodes = run.getElementsByTagNameNS(NS, "t");
      for (let k = 0; k < textNodes.length; k++) {
        parts.push(textNodes[k].textContent ?? "");
      }
    }

    // Also capture <w:hyperlink> text (LinkedIn URLs etc.)
    const hyperlinks = para.getElementsByTagNameNS(NS, "hyperlink");
    for (let j = 0; j < hyperlinks.length; j++) {
      const hTexts = hyperlinks[j].getElementsByTagNameNS(NS, "t");
      for (let k = 0; k < hTexts.length; k++) {
        const t = hTexts[k].textContent ?? "";
        if (t && !parts.join("").includes(t)) parts.push(t);
      }
    }

    const lineText = parts.join("").replace(/\t/g, " ").trim();

    if (isHeading && lineText) {
      // Add blank line before headings for section clarity
      lines.push("");
    }

    lines.push(lineText);
  }

  // Collapse consecutive blank lines (max 2)
  const collapsed: string[] = [];
  let blankCount = 0;
  for (const line of lines) {
    if (line === "") {
      blankCount++;
      if (blankCount <= 2) collapsed.push("");
    } else {
      blankCount = 0;
      collapsed.push(line);
    }
  }

  const text = collapsed.join("\n").trim();

  if (!text || text.length < 50) {
    throw new Error(
      "Não foi possível extrair texto do DOCX. Verifique se o arquivo não está corrompido."
    );
  }

  return text;
}

// ─── TXT ──────────────────────────────────────────────────────────────────────

export async function extractTextFromTXT(file: File): Promise<string> {
  return file.text();
}

// ─── Router ───────────────────────────────────────────────────────────────────

export async function extractTextFromFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  const type = file.type;

  if (type === "application/pdf" || name.endsWith(".pdf")) {
    return extractTextFromPDF(file);
  }

  if (
    type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    name.endsWith(".docx")
  ) {
    return extractTextFromDOCX(file);
  }

  if (type === "text/plain" || name.endsWith(".txt")) {
    return extractTextFromTXT(file);
  }

  throw new Error("Formato não suportado. Use PDF, DOCX ou TXT.");
}
