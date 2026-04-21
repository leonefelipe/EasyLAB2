/**
 * sanitizers.ts
 * Centralized output sanitization for AI-generated content.
 *
 * Enforces product rules that must hold regardless of what the LLM produces.
 *
 * Today:
 *  - LinkedIn profiles MUST NEVER suggest the candidate is "open to work",
 *    "aberto a oportunidades", "buscando recolocação", or similar passive
 *    job-seeking phrasing. Product rule is absolute.
 *  - LinkedIn headline has a hard 220-char limit imposed by the platform.
 *
 * This module is framework-agnostic and has zero external dependencies.
 * Every function is pure and idempotent — safe to re-run on already-clean text.
 */

// ─── LinkedIn compliance — forbidden "open to work" phrases ───────────────────

/**
 * Phrases that violate the "no open to work" rule.
 * Order does not matter — each pattern is checked independently.
 * Flags: `i` for case-insensitive. We do NOT use `g` here so tests remain deterministic;
 * the stripping function adds `g` when it performs replacements.
 */
const LINKEDIN_FORBIDDEN_PATTERNS: readonly RegExp[] = [
  /aberto[oa]?\s+a\s+oportunidades/i,
  /aberto[oa]?\s+a\s+conversas/i,
  /aberto[oa]?\s+a\s+novos?\s+desafios/i,
  /aberto[oa]?\s+a\s+novas?\s+propostas/i,
  /open\s+to\s+work/i,
  /open\s+to\s+opportunities/i,
  /open\s+to\s+new\s+(?:opportunities|roles|challenges)/i,
  /buscando\s+recoloca[cç][aã]o/i,
  /buscando\s+nova\s+oportunidade/i,
  /buscando\s+nova\s+coloca[cç][aã]o/i,
  /em\s+busca\s+de\s+(?:novos?\s+)?desafios/i,
  /em\s+busca\s+de\s+(?:nova\s+)?oportunidade/i,
  /em\s+busca\s+de\s+recoloca[cç][aã]o/i,
  /em\s+busca\s+de\s+(?:nova\s+)?coloca[cç][aã]o/i,
  /procurando\s+(?:nova\s+)?oportunidade/i,
  /procurando\s+(?:nova\s+)?coloca[cç][aã]o/i,
  /dispon[ií]vel\s+para\s+(?:novos?\s+)?desafios/i,
];

/**
 * Returns true if the text contains any forbidden "open to work" phrase.
 * Safe for empty / null / undefined input.
 */
export function hasOpenToWorkPhrase(text: string | null | undefined): boolean {
  if (!text) return false;
  return LINKEDIN_FORBIDDEN_PATTERNS.some((p) => p.test(text));
}

/**
 * Strips CTAs matching a forbidden pattern from the text.
 *
 * Strategy:
 *  1. Split into paragraphs (separated by blank lines).
 *  2. Within each paragraph, split into lines.
 *  3. Within each line, split into sentences (terminated by . ! ?).
 *  4. Drop any sentence that matches a forbidden pattern.
 *  5. Secondary pass: nuke any residual inline match (e.g. list item without terminator).
 *  6. Cleanup orphan punctuation and collapse whitespace.
 *
 * Idempotent.
 */
export function stripOpenToWorkCTA(text: string): string {
  if (!text) return text;

  // Step 1-4: structural drop by sentence
  const paragraphs = text.split(/\n{2,}/);
  const cleanedParagraphs = paragraphs
    .map((paragraph) => {
      const lines = paragraph
        .split("\n")
        .map((line) => {
          // split by sentence terminator but KEEP the terminator with the sentence
          const sentences = line.split(/(?<=[.!?])\s+/);
          const kept = sentences.filter((s) => !hasOpenToWorkPhrase(s));
          return kept.join(" ").trim();
        })
        .filter((line) => line.length > 0);
      return lines.join("\n");
    })
    .filter((p) => p.trim().length > 0);

  let result = cleanedParagraphs.join("\n\n");

  // Step 5: residual inline matches (e.g. bullet list without punctuation)
  for (const pattern of LINKEDIN_FORBIDDEN_PATTERNS) {
    const globalPattern = new RegExp(pattern.source, "gi");
    result = result.replace(globalPattern, "");
  }

  // Step 6: cleanup
  result = result
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/([,;:])\s*(?=[,.!?;:])/g, "$1")
    .replace(/^[\s,;:.]+|[\s,;:.]+$/g, "")
    .trim();

  return result;
}

/**
 * Public gate for LinkedIn outputs. Returns the sanitized string plus a flag
 * indicating whether any stripping occurred (useful for audit logs / metrics).
 */
export function validateLinkedInCompliance(text: string | null | undefined): {
  sanitized: string;
  wasStripped: boolean;
} {
  if (!text) return { sanitized: text ?? "", wasStripped: false };
  const had = hasOpenToWorkPhrase(text);
  if (!had) return { sanitized: text, wasStripped: false };
  return { sanitized: stripOpenToWorkCTA(text), wasStripped: true };
}

// ─── LinkedIn headline hard length limit ──────────────────────────────────────

/**
 * LinkedIn enforces a 220-character limit on the headline field.
 * Truncates at word boundary when possible to preserve the highest-impact prefix.
 */
export function enforceLinkedInHeadlineLimit(
  headline: string | null | undefined,
  limit = 220
): string {
  if (!headline) return headline ?? "";
  const cleaned = headline.trim();
  if (cleaned.length <= limit) return cleaned;

  const truncated = cleaned.slice(0, limit);
  const lastSpace = truncated.lastIndexOf(" ");
  // Only use word-boundary truncation if the last space is in the final 30% of the string;
  // otherwise hard-cut to preserve content.
  if (lastSpace > limit * 0.7) {
    return truncated.slice(0, lastSpace).trim();
  }
  return truncated.trim();
}
