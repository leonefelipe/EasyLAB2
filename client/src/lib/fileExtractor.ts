/**
 * Extração de texto de currículos — PDF, DOCX, TXT
 *
 * DOCX: usa mammoth (biblioteca dedicada a DOCX → texto limpo, preserva
 *       estrutura de parágrafos, bullets e datas sem perder conteúdo).
 *
 * PDF:  usa pdfjs-dist com estratégia de reconstrução de linhas que preserva
 *       ordem de leitura, seções, bullets e datas.
 *
 * A extração anterior de DOCX era um regex de strip de XML que perdia toda a
 * estrutura. A nova usa mammoth, que entende o modelo semântico do Word.
 */

import * as pdfjsLib from "pdfjs-dist";
import mammoth from "mammoth";

// Worker do PDF.js via CDN
pdfjsLib.GlobalWorkerOptions.workerSrc =
  `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

// ─── PDF ─────────────────────────────────────────────────────────────────────

/**
 * Reconstrói o texto de cada página preservando linhas e seções.
 * O pdfjs retorna spans com coordenadas Y; agrupa-os por proximidade vertical
 * para reconstruir linhas naturais em vez de um blob contínuo.
 */
export async function extractTextFromPDF(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const pages: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const { items } = await page.getTextContent();

    // Group items into lines by Y position (tolerance ±3px)
    type PdfItem = { str: string; transform: number[] };
    const lines: Map<number, string[]> = new Map();

    for (const raw of items) {
      const item = raw as PdfItem;
      if (!item.str.trim()) continue;
      const y = Math.round(item.transform[5] / 3) * 3; // bucket to 3px grid
      if (!lines.has(y)) lines.set(y, []);
      lines.get(y)!.push(item.str);
    }

    // Sort lines top→bottom (higher Y = higher on page in PDF coords)
    const sorted = [...lines.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, words]) => words.join(" ").trim())
      .filter(Boolean);

    pages.push(sorted.join("\n"));
  }

  const result = pages.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();

  if (!result || result.length < 50) {
    throw new Error(
      "O PDF parece ser uma imagem escaneada ou está protegido. Por favor, converta para DOCX ou copie o texto manualmente."
    );
  }

  return result;
}

// ─── DOCX ─────────────────────────────────────────────────────────────────────

/**
 * Usa mammoth para extrair texto limpo do DOCX.
 * mammoth entende o modelo semântico Word (parágrafos, listas, títulos)
 * e produz texto com quebras de linha naturais — muito melhor que strip XML.
 */
export async function extractTextFromDOCX(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();

  // mammoth.extractRawText preserves paragraph breaks without HTML conversion
  const result = await mammoth.extractRawText({ arrayBuffer });

  if (result.messages.length > 0) {
    // Non-fatal warnings — log but don't throw
    console.warn("Avisos ao processar DOCX:", result.messages);
  }

  const text = result.value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n") // max 3 consecutive blank lines
    .trim();

  if (!text || text.length < 50) {
    throw new Error("Não foi possível extrair texto do DOCX. Verifique se o arquivo não está corrompido.");
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
