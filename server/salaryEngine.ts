/**
 * salaryEngine.ts
 *
 * Market-grade salary estimation engine for Brazil / LATAM.
 * Implements: percentile smoothing, outlier detection, role clustering,
 * industry multipliers, regional CoL index, experience weighting, and
 * similarity-based inference when exact match is unavailable.
 */

import {
  SALARY_DATABASE,
  INDUSTRY_MULTIPLIERS,
  REGIONAL_COL,
  SENIORITY_WEIGHT,
  ROLE_CLUSTERS,
  type SalaryRecord,
  type Seniority,
  type Region,
} from "./salaryData";

// ─── Public Types ─────────────────────────────────────────────────────────────

export interface SalaryInput {
  role: string;
  seniority: Seniority;
  industry?: string;
  region?: Region;
  skills?: string[];
  yearsExperience?: number;
}

export interface SalaryEstimate {
  cltMin: number;
  cltMedian: number;
  cltMax: number;
  pjMin: number;
  pjMedian: number;
  pjMax: number;
  marketPercentile: number;    // where median sits (always 50 for dataset median)
  confidenceScore: number;     // 0-100
  confidence: "high" | "medium" | "low";
  matchMethod: "exact" | "seniority_adjusted" | "cluster_similar" | "industry_estimated";
  marketReferences: string[];
  rationale: string;
  currency: "BRL";
}

// ─── Normalization helpers ────────────────────────────────────────────────────

function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function inferRegion(regionInput: string | undefined): Region {
  if (!regionInput) return "brasil";
  const n = normalizeText(regionInput);
  if (n.includes("sao paulo") || n.includes("sp") || n.includes("campinas") || n.includes("santos")) return "sp";
  if (n.includes("rio de janeiro") || n.includes("rj") || n.includes("niteroi")) return "rj";
  if (n.includes("sul") || n.includes("porto alegre") || n.includes("curitiba") || n.includes("florianopolis") || n.includes("rs") || n.includes("sc") || n.includes("pr")) return "sul";
  if (n.includes("nordeste") || n.includes("recife") || n.includes("fortaleza") || n.includes("salvador") || n.includes("ba") || n.includes("pe") || n.includes("ce")) return "nordeste";
  if (n.includes("brasilia") || n.includes("df") || n.includes("goiania") || n.includes("go") || n.includes("ms") || n.includes("mt")) return "co";
  if (n.includes("remoto") || n.includes("remote") || n.includes("homeoffice") || n.includes("home office")) return "remoto";
  return "brasil";
}

function inferIndustryKey(input: string | undefined): string {
  if (!input) return "default";
  const n = normalizeText(input);
  for (const key of Object.keys(INDUSTRY_MULTIPLIERS)) {
    const nk = normalizeText(key);
    if (n.includes(nk) || nk.includes(n)) return key;
  }
  // Keyword matching
  if (/banco|fintech|financ|credito|seguro|invest/.test(n)) return "financas";
  if (/tech|software|saas|startup|digital/.test(n)) return "tecnologia";
  if (/consul/.test(n)) return "consultoria";
  if (/juridic|advoc|legal/.test(n)) return "juridico";
  if (/saude|hospital|clinic|farm/.test(n)) return "saude";
  if (/varejo|retail|e-commerce/.test(n)) return "varejo";
  if (/energia|petroleo|oil|gas/.test(n)) return "energia";
  if (/imovel|imobili|real estate/.test(n)) return "imobiliario";
  return "default";
}

// ─── Role similarity scoring ──────────────────────────────────────────────────

function roleSimilarityScore(queryRole: string, dbRole: string): number {
  const q = normalizeText(queryRole);
  const d = normalizeText(dbRole);

  if (q === d) return 1.0;
  if (q.includes(d) || d.includes(q)) return 0.85;

  // Token overlap
  const qTokens = new Set(q.split(" "));
  const dTokens = new Set(d.split(" "));
  const intersection = [...qTokens].filter(t => dTokens.has(t)).length;
  const union = new Set([...qTokens, ...dTokens]).size;
  const jaccard = union > 0 ? intersection / union : 0;

  // Category cluster bonus
  let clusterBonus = 0;
  for (const [, keywords] of Object.entries(ROLE_CLUSTERS)) {
    const qInCluster = keywords.some(k => q.includes(k));
    const dInCluster = keywords.some(k => d.includes(k));
    if (qInCluster && dInCluster) { clusterBonus = 0.15; break; }
  }

  return Math.min(0.80, jaccard + clusterBonus);
}

// ─── Outlier detection (IQR method) ──────────────────────────────────────────

function removeOutliers(values: number[]): number[] {
  if (values.length < 4) return values;
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  const iqr = q3 - q1;
  const lower = q1 - 1.5 * iqr;
  const upper = q3 + 1.5 * iqr;
  return sorted.filter(v => v >= lower && v <= upper);
}

// ─── Percentile smoothing ─────────────────────────────────────────────────────

function smoothPercentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  if (values.length === 1) return values[0];
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const frac = idx - lo;
  return Math.round(sorted[lo] * (1 - frac) + sorted[hi] * frac);
}

// ─── Apply regional + industry adjustments ───────────────────────────────────

function applyAdjustments(
  record: SalaryRecord,
  targetRegion: Region,
  targetIndustry: string,
): { min: number; median: number; max: number } {
  const regionDelta = REGIONAL_COL[targetRegion] / REGIONAL_COL[record.region];
  const industryMult = INDUSTRY_MULTIPLIERS[targetIndustry] ?? INDUSTRY_MULTIPLIERS.default;
  const baseMult = industryMult / (INDUSTRY_MULTIPLIERS[record.industry] ?? INDUSTRY_MULTIPLIERS.default);
  const totalMult = regionDelta * baseMult;

  return {
    min:    Math.round(record.cltMin    * totalMult / 100) * 100,
    median: Math.round(record.cltMedian * totalMult / 100) * 100,
    max:    Math.round(record.cltMax    * totalMult / 100) * 100,
  };
}

// ─── Seniority interpolation ──────────────────────────────────────────────────
// When exact seniority not in DB, interpolate from adjacent records.

function interpolateSeniority(
  records: SalaryRecord[],
  targetSeniority: Seniority,
  region: Region,
  industry: string,
): { min: number; median: number; max: number } | null {
  const sorted: Seniority[] = ["estagio", "junior", "pleno", "senior", "gerente", "diretor", "clevel"];
  const targetIdx = sorted.indexOf(targetSeniority);
  if (targetIdx < 0) return null;

  // Find closest available seniorities
  const available = records.map(r => ({ sen: r.seniority, idx: sorted.indexOf(r.seniority) }))
    .sort((a, b) => Math.abs(a.idx - targetIdx) - Math.abs(b.idx - targetIdx));

  if (available.length === 0) return null;

  const closest = records.find(r => r.seniority === available[0].sen)!;
  const adj = applyAdjustments(closest, region, industry);

  // Scale by seniority weight ratio
  const scale = SENIORITY_WEIGHT[targetSeniority] / SENIORITY_WEIGHT[closest.seniority];
  return {
    min:    Math.round(adj.min    * scale / 100) * 100,
    median: Math.round(adj.median * scale / 100) * 100,
    max:    Math.round(adj.max    * scale / 100) * 100,
  };
}

// ─── Main estimation function ─────────────────────────────────────────────────

export function estimateSalary(input: SalaryInput): SalaryEstimate {
  const normalizedRole = normalizeText(input.role);
  const region        = inferRegion(input.region);
  const industryKey   = inferIndustryKey(input.industry);

  const references: string[] = [];
  let matchMethod: SalaryEstimate["matchMethod"] = "exact";
  let confidenceScore = 0;

  // ── Step 1: Find exact or close role+seniority matches ────────────────────
  const candidates = SALARY_DATABASE
    .map(r => ({ record: r, score: roleSimilarityScore(normalizedRole, r.role) }))
    .filter(c => c.score >= 0.50)
    .sort((a, b) => b.score - a.score);

  const exactMatches = candidates
    .filter(c => c.score >= 0.85 && c.record.seniority === input.seniority);

  let rawMin: number, rawMedian: number, rawMax: number;
  let pjMult = 1.40;

  if (exactMatches.length > 0) {
    // ── Exact match path ────────────────────────────────────────────────────
    matchMethod = "exact";
    const adjustedValues = exactMatches.map(c => applyAdjustments(c.record, region, industryKey));
    const mins    = removeOutliers(adjustedValues.map(v => v.min));
    const medians = removeOutliers(adjustedValues.map(v => v.median));
    const maxes   = removeOutliers(adjustedValues.map(v => v.max));

    rawMin    = smoothPercentile(mins,    25);
    rawMedian = smoothPercentile(medians, 50);
    rawMax    = smoothPercentile(maxes,   75);
    pjMult    = exactMatches[0].record.pjMultiplier;

    exactMatches.slice(0, 2).forEach(c => {
      if (!references.includes(c.record.source)) references.push(c.record.source);
    });
    confidenceScore = Math.round(exactMatches[0].score * 90 + (exactMatches.length > 1 ? 10 : 0));

  } else if (candidates.length > 0) {
    // ── Seniority interpolation or cluster similar ────────────────────────
    const topCandidates = candidates.slice(0, 4).map(c => c.record);
    const interpolated  = interpolateSeniority(topCandidates, input.seniority, region, industryKey);

    if (interpolated) {
      rawMin    = interpolated.min;
      rawMedian = interpolated.median;
      rawMax    = interpolated.max;
      matchMethod = candidates[0].score >= 0.80 ? "seniority_adjusted" : "cluster_similar";
      pjMult = topCandidates[0].pjMultiplier;
      topCandidates.slice(0, 2).forEach(r => {
        if (!references.includes(r.source)) references.push(r.source);
      });
      confidenceScore = Math.round(candidates[0].score * 70);
    } else {
      // Pure industry estimation fallback
      matchMethod = "industry_estimated";
      const baseWeight = SENIORITY_WEIGHT[input.seniority] ?? 1.0;
      const industryM  = INDUSTRY_MULTIPLIERS[industryKey] ?? 1.0;
      const regionM    = REGIONAL_COL[region] ?? 0.88;
      const baseSenior = { min: 9000, median: 14000, max: 22000 }; // senior baseline
      rawMin    = Math.round(baseSenior.min    * baseWeight * industryM * regionM / 100) * 100;
      rawMedian = Math.round(baseSenior.median * baseWeight * industryM * regionM / 100) * 100;
      rawMax    = Math.round(baseSenior.max    * baseWeight * industryM * regionM / 100) * 100;
      confidenceScore = 35;
      references.push("Estimativa baseada em benchmarks de mercado BR 2025");
    }
  } else {
    // ── No candidates — pure parametric estimate ───────────────────────────
    matchMethod = "industry_estimated";
    const baseWeight = SENIORITY_WEIGHT[input.seniority] ?? 1.0;
    const industryM  = INDUSTRY_MULTIPLIERS[industryKey] ?? 1.0;
    const regionM    = REGIONAL_COL[region] ?? 0.88;
    rawMin    = Math.round(8000 * baseWeight * industryM * regionM / 100) * 100;
    rawMedian = Math.round(12000 * baseWeight * industryM * regionM / 100) * 100;
    rawMax    = Math.round(20000 * baseWeight * industryM * regionM / 100) * 100;
    confidenceScore = 25;
    references.push("Estimativa paramétrica — dados insuficientes para este cargo específico");
  }

  // ── Step 2: Apply years-of-experience fine tuning ─────────────────────────
  if (input.yearsExperience !== undefined) {
    const expMap: Record<Seniority, [number, number]> = {
      estagio: [0, 1], junior: [1, 3], pleno: [3, 6],
      senior: [6, 12], gerente: [10, 20], diretor: [15, 30], clevel: [20, 40],
    };
    const [expMin, expMax] = expMap[input.seniority] ?? [0, 40];
    const expMidpoint = (expMin + expMax) / 2;
    const expDelta = (input.yearsExperience - expMidpoint) / Math.max(expMax - expMin, 1);
    // ±10% adjustment based on experience relative to seniority midpoint
    const expFactor = 1 + Math.max(-0.10, Math.min(0.10, expDelta * 0.10));
    rawMin    = Math.round(rawMin    * expFactor / 100) * 100;
    rawMedian = Math.round(rawMedian * expFactor / 100) * 100;
    rawMax    = Math.round(rawMax    * expFactor / 100) * 100;
  }

  // ── Step 3: Ensure monotonicity min ≤ median ≤ max ───────────────────────
  rawMin    = Math.min(rawMin, rawMedian);
  rawMax    = Math.max(rawMax, rawMedian);
  if (rawMin <= 0) rawMin = Math.round(rawMedian * 0.75 / 100) * 100;
  if (rawMax <= rawMedian) rawMax = Math.round(rawMedian * 1.35 / 100) * 100;

  // ── Step 4: Compute PJ values ─────────────────────────────────────────────
  const pjMin    = Math.round(rawMin    * pjMult / 100) * 100;
  const pjMedian = Math.round(rawMedian * pjMult / 100) * 100;
  const pjMax    = Math.round(rawMax    * pjMult / 100) * 100;

  // ── Step 5: Confidence classification ────────────────────────────────────
  const confidence: "high" | "medium" | "low" =
    confidenceScore >= 70 ? "high" : confidenceScore >= 45 ? "medium" : "low";

  // ── Step 6: Rationale ─────────────────────────────────────────────────────
  const regionLabel: Record<Region, string> = {
    sp: "São Paulo", rj: "Rio de Janeiro", sul: "Sul do Brasil",
    nordeste: "Nordeste", co: "Centro-Oeste", remoto: "Remoto (BR)", brasil: "Brasil",
  };

  const rationale = [
    `Estimativa para ${input.seniority.charAt(0).toUpperCase() + input.seniority.slice(1)} em ${regionLabel[region]}.`,
    industryKey !== "default"
      ? `Multiplicador de indústria (${industryKey}): ${INDUSTRY_MULTIPLIERS[industryKey]}x.`
      : null,
    matchMethod === "exact"
      ? `Match direto com dados de mercado.`
      : matchMethod === "seniority_adjusted"
        ? `Interpolado a partir de cargo similar com ajuste de senioridade.`
        : matchMethod === "cluster_similar"
          ? `Estimado por similaridade de cluster de função.`
          : `Estimado parametricamente — dados de mercado limitados para este cargo.`,
    `Valores CLT bruto mensal. PJ = CLT × ${pjMult} (sem benefícios, antes de impostos).`,
  ].filter(Boolean).join(" ");

  if (references.length === 0) references.push("Benchmarks de mercado BR 2025");

  return {
    cltMin: rawMin,
    cltMedian: rawMedian,
    cltMax: rawMax,
    pjMin,
    pjMedian,
    pjMax,
    marketPercentile: 50,
    confidenceScore,
    confidence,
    matchMethod,
    marketReferences: references,
    rationale,
    currency: "BRL",
  };
}

// ─── Batch benchmarks for market trends ──────────────────────────────────────

export function getMarketBenchmarks(category: string): SalaryRecord[] {
  const norm = normalizeText(category);
  return SALARY_DATABASE.filter(r =>
    normalizeText(r.category).includes(norm) ||
    normalizeText(r.role).includes(norm)
  );
}

export function getMarketTrends(category: string) {
  const records = getMarketBenchmarks(category);
  if (records.length === 0) return null;

  const bySeniority = records.reduce<Record<string, number[]>>((acc, r) => {
    if (!acc[r.seniority]) acc[r.seniority] = [];
    acc[r.seniority].push(r.cltMedian);
    return acc;
  }, {});

  return Object.entries(bySeniority).map(([seniority, values]) => ({
    seniority,
    medianClt: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
    count: values.length,
  }));
}
