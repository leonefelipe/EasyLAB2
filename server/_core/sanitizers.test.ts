import { describe, expect, it } from "vitest";
import {
  hasOpenToWorkPhrase,
  stripOpenToWorkCTA,
  validateLinkedInCompliance,
  enforceLinkedInHeadlineLimit,
} from "./sanitizers";

// ─── hasOpenToWorkPhrase ─────────────────────────────────────────────────────

describe("hasOpenToWorkPhrase", () => {
  it.each([
    "Aberto a oportunidades em Tech",
    "Aberta a oportunidades",
    "Open to work",
    "Open to opportunities",
    "Estou open to new opportunities",
    "Aberto a conversas sobre vendas",
    "Aberta a novas propostas",
    "Aberto a novos desafios",
    "Em busca de recolocação profissional",
    "Em busca de novos desafios",
    "Em busca de desafios",
    "Em busca de colocação",
    "Buscando recolocação na área de RH",
    "Buscando nova oportunidade",
    "Procurando oportunidade em startups",
    "Procurando nova oportunidade",
    "Procurando nova colocação",
    "Disponível para novos desafios",
    "Disponivel para novos desafios",
  ])("detects forbidden phrase: %s", (phrase) => {
    expect(hasOpenToWorkPhrase(phrase)).toBe(true);
  });

  it.each([
    "Líder de vendas com 12 anos de experiência em SaaS",
    "Especialista em M&A com track record em operações cross-border",
    "Converso com gestores sobre retenção de talentos",
    "Compartilho insights sobre liderança no LinkedIn",
    "Troco ideias sobre arquitetura de dados com CTOs",
    "Escrevo sobre finanças corporativas para executivos",
  ])("does NOT flag legitimate content: %s", (phrase) => {
    expect(hasOpenToWorkPhrase(phrase)).toBe(false);
  });

  it("returns false for empty / null / undefined input", () => {
    expect(hasOpenToWorkPhrase("")).toBe(false);
    expect(hasOpenToWorkPhrase(null)).toBe(false);
    expect(hasOpenToWorkPhrase(undefined)).toBe(false);
  });
});

// ─── stripOpenToWorkCTA ──────────────────────────────────────────────────────

describe("stripOpenToWorkCTA", () => {
  it("removes the exact sentence containing the CTA and preserves the rest", () => {
    const input =
      "Líder comercial com 18 anos de experiência. Aberto a oportunidades em vendas. Especialista em MEDDIC.";
    const output = stripOpenToWorkCTA(input);
    expect(output).not.toMatch(/aberto/i);
    expect(output).toMatch(/Líder comercial/);
    expect(output).toMatch(/MEDDIC/);
  });

  it("handles CTA on its own line", () => {
    const input = "Tenho 15 anos em TI.\nAberto a oportunidades em arquitetura.";
    const output = stripOpenToWorkCTA(input);
    expect(output).not.toMatch(/aberto/i);
    expect(output).toMatch(/Tenho 15 anos/);
  });

  it("returns empty string when the entire input is a forbidden CTA", () => {
    expect(stripOpenToWorkCTA("Aberto a oportunidades")).toBe("");
    expect(stripOpenToWorkCTA("Open to work")).toBe("");
  });

  it("is idempotent", () => {
    const input =
      "Profissional com experiência sólida. Buscando nova oportunidade no mercado brasileiro.";
    const once = stripOpenToWorkCTA(input);
    const twice = stripOpenToWorkCTA(once);
    expect(once).toBe(twice);
    expect(once).not.toMatch(/buscando/i);
  });

  it("preserves multi-paragraph structure", () => {
    const input =
      "Parágrafo 1 com conteúdo válido sobre a carreira.\n\n" +
      "Aberto a oportunidades em Tech.\n\n" +
      "Parágrafo 3 também relevante sobre M&A.";
    const output = stripOpenToWorkCTA(input);
    expect(output).toMatch(/Parágrafo 1/);
    expect(output).toMatch(/Parágrafo 3/);
    expect(output).not.toMatch(/aberto a oportunidades/i);
  });

  it("handles mixed EN / PT-BR CTAs in the same text", () => {
    const input =
      "Expertise em liderança. Open to work. Focado em crescimento. Em busca de novos desafios.";
    const output = stripOpenToWorkCTA(input);
    expect(output).toMatch(/Expertise em liderança/);
    expect(output).toMatch(/Focado em crescimento/);
    expect(output).not.toMatch(/open to work/i);
    expect(output).not.toMatch(/em busca de/i);
  });
});

// ─── validateLinkedInCompliance ──────────────────────────────────────────────

describe("validateLinkedInCompliance", () => {
  it("returns wasStripped=false when input is clean", () => {
    const result = validateLinkedInCompliance("Consultor sênior em vendas B2B.");
    expect(result.wasStripped).toBe(false);
    expect(result.sanitized).toBe("Consultor sênior em vendas B2B.");
  });

  it("returns wasStripped=true and sanitized text when forbidden phrase is found", () => {
    const result = validateLinkedInCompliance(
      "Vendas B2B consultiva. Aberto a oportunidades."
    );
    expect(result.wasStripped).toBe(true);
    expect(result.sanitized).not.toMatch(/aberto/i);
    expect(result.sanitized).toMatch(/Vendas B2B/);
  });

  it("handles null / undefined / empty string safely", () => {
    expect(validateLinkedInCompliance(null)).toEqual({ sanitized: "", wasStripped: false });
    expect(validateLinkedInCompliance(undefined)).toEqual({ sanitized: "", wasStripped: false });
    expect(validateLinkedInCompliance("")).toEqual({ sanitized: "", wasStripped: false });
  });
});

// ─── enforceLinkedInHeadlineLimit ────────────────────────────────────────────

describe("enforceLinkedInHeadlineLimit", () => {
  it("preserves a headline that is under the limit", () => {
    const input = "CFO | IPO-ready | R$500M sob gestão";
    expect(enforceLinkedInHeadlineLimit(input)).toBe(input);
  });

  it("truncates at word boundary when a space is near the end", () => {
    const input =
      "Headhunter Sênior | Executive Search | Talent Acquisition | +18 anos B2B | Especialista em Tech e Saúde com atuação em clientes como McKinsey, Google, Ambev, Itaú e Natura e diversas empresas premium";
    const result = enforceLinkedInHeadlineLimit(input);
    expect(result.length).toBeLessThanOrEqual(220);
    expect(result.endsWith(" ")).toBe(false);
    expect(result.endsWith(",")).toBe(false);
  });

  it("hard-truncates when there is no usable space in the tail", () => {
    const input = "X".repeat(300);
    const result = enforceLinkedInHeadlineLimit(input);
    expect(result.length).toBe(220);
  });

  it("returns empty string for empty / null / undefined input", () => {
    expect(enforceLinkedInHeadlineLimit("")).toBe("");
    expect(enforceLinkedInHeadlineLimit(null)).toBe("");
    expect(enforceLinkedInHeadlineLimit(undefined)).toBe("");
  });

  it("respects a custom limit parameter", () => {
    const input = "Frase que deve ser cortada em vinte e cinco caracteres aproximadamente.";
    const result = enforceLinkedInHeadlineLimit(input, 25);
    expect(result.length).toBeLessThanOrEqual(25);
  });
});
