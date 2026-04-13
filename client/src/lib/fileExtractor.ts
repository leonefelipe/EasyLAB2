/**
 * Serviço de extração de texto de diferentes formatos de arquivo
 * Suporta: PDF, DOCX, TXT
 */

import * as pdfjsLib from "pdfjs-dist";

// Set up the worker for PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

/**
 * Extrai texto de um arquivo PDF
 */
export async function extractTextFromPDF(file: File): Promise<string> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = "";

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(" ");
      fullText += pageText + "\n";
    }

    return fullText;
  } catch (error) {
    console.error("Erro ao extrair PDF:", error);
    throw new Error("Falha ao extrair texto do PDF");
  }
}

/**
 * Extrai texto de um arquivo DOCX
 * Nota: Implementação simplificada que lê o conteúdo XML do DOCX
 */
export async function extractTextFromDOCX(file: File): Promise<string> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const zip = new (await import("jszip")).default();
    await zip.loadAsync(arrayBuffer);

    // Lê o arquivo document.xml que contém o conteúdo do documento
    const documentXml = await zip.file("word/document.xml")?.async("text");

    if (!documentXml) {
      throw new Error("Arquivo DOCX inválido");
    }

    // Remove tags XML e extrai apenas o texto
    const text = documentXml
      .replace(/<[^>]*>/g, " ") // Remove tags XML
      .replace(/&nbsp;/g, " ") // Substitui nbsp
      .replace(/&amp;/g, "&") // Substitui &
      .replace(/&lt;/g, "<") // Substitui <
      .replace(/&gt;/g, ">") // Substitui >
      .replace(/\s+/g, " ") // Remove espaços múltiplos
      .trim();

    return text;
  } catch (error) {
    console.error("Erro ao extrair DOCX:", error);
    throw new Error("Falha ao extrair texto do DOCX");
  }
}

/**
 * Extrai texto de um arquivo TXT
 */
export async function extractTextFromTXT(file: File): Promise<string> {
  try {
    const text = await file.text();
    return text;
  } catch (error) {
    console.error("Erro ao extrair TXT:", error);
    throw new Error("Falha ao extrair texto do TXT");
  }
}

/**
 * Função principal que detecta o tipo de arquivo e extrai o texto
 */
export async function extractTextFromFile(file: File): Promise<string> {
  const fileType = file.type;
  const fileName = file.name.toLowerCase();

  try {
    if (fileType === "application/pdf" || fileName.endsWith(".pdf")) {
      return await extractTextFromPDF(file);
    } else if (
      fileType ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      fileName.endsWith(".docx")
    ) {
      return await extractTextFromDOCX(file);
    } else if (fileType === "text/plain" || fileName.endsWith(".txt")) {
      return await extractTextFromTXT(file);
    } else {
      throw new Error(
        "Formato de arquivo não suportado. Use PDF, DOCX ou TXT."
      );
    }
  } catch (error) {
    console.error("Erro ao extrair arquivo:", error);
    throw error;
  }
}
