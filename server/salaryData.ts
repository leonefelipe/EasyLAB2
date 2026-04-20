/**
 * salaryData.ts
 * Market-calibrated salary dataset for Brazil.
 * Sources: Robert Half Salary Guide BR 2025, Michael Page Salary Guide BR 2026,
 *          Hays Salary Guide LATAM 2025, Catho, Glassdoor BR.
 * All values in BRL / month (CLT gross).
 */

export type Seniority = "estagio" | "junior" | "pleno" | "senior" | "gerente" | "diretor" | "clevel";
export type Region = "sp" | "rj" | "sul" | "nordeste" | "co" | "remoto" | "brasil";

export interface SalaryRecord {
  role: string;
  category: string;
  seniority: Seniority;
  industry: string;
  region: Region;
  cltMin: number;
  cltMedian: number;
  cltMax: number;
  pjMultiplier: number; // PJ gross = CLT * multiplier (accounts for no benefits ~1.35-1.5)
  confidence: "high" | "medium" | "low";
  source: string;
}

// ─── Industry Multipliers ──────────────────────────────────────────────────────
// Base = 1.0 (generic market). Applied to CLT values.
export const INDUSTRY_MULTIPLIERS: Record<string, number> = {
  "fintech":          1.35,
  "banco":            1.30,
  "financas":         1.28,
  "mercado_capital":  1.40,
  "tecnologia":       1.25,
  "saas":             1.30,
  "consultoria":      1.20,
  "juridico":         1.25,
  "saude":            1.10,
  "farmaceutico":     1.15,
  "energia":          1.20,
  "petroleo":         1.35,
  "varejo":           0.90,
  "educacao":         0.85,
  "ong":              0.75,
  "governo":          0.80,
  "agronegocio":      1.05,
  "imobiliario":      0.95,
  "logistica":        0.90,
  "marketing_agencia":0.85,
  "default":          1.00,
};

// ─── Regional Cost-of-Living Index ────────────────────────────────────────────
// São Paulo = 1.0 reference
export const REGIONAL_COL: Record<Region, number> = {
  sp:        1.00,
  rj:        0.93,
  sul:       0.87,
  nordeste:  0.77,
  co:        0.80,
  remoto:    0.95, // slight premium for remote flexibility
  brasil:    0.88, // national average
};

// ─── Experience Weighting ─────────────────────────────────────────────────────
export const SENIORITY_WEIGHT: Record<Seniority, number> = {
  estagio: 0.22,
  junior:  0.45,
  pleno:   0.70,
  senior:  1.00,
  gerente: 1.40,
  diretor: 1.90,
  clevel:  2.80,
};

// ─── Core Salary Dataset ──────────────────────────────────────────────────────
// All values: São Paulo, generic industry, CLT gross monthly
export const SALARY_DATABASE: SalaryRecord[] = [
  // ── TECHNOLOGY ──────────────────────────────────────────────────────────────
  { role: "desenvolvedor backend", category: "tech", seniority: "junior",  industry: "tecnologia", region: "sp", cltMin:  4500, cltMedian:  5500, cltMax:  7000, pjMultiplier: 1.40, confidence: "high", source: "Robert Half 2025" },
  { role: "desenvolvedor backend", category: "tech", seniority: "pleno",   industry: "tecnologia", region: "sp", cltMin:  7000, cltMedian:  9000, cltMax: 13000, pjMultiplier: 1.40, confidence: "high", source: "Robert Half 2025" },
  { role: "desenvolvedor backend", category: "tech", seniority: "senior",  industry: "tecnologia", region: "sp", cltMin: 12000, cltMedian: 16000, cltMax: 22000, pjMultiplier: 1.42, confidence: "high", source: "Robert Half 2025" },
  { role: "desenvolvedor frontend", category: "tech", seniority: "junior",  industry: "tecnologia", region: "sp", cltMin:  4000, cltMedian:  5000, cltMax:  6500, pjMultiplier: 1.40, confidence: "high", source: "Robert Half 2025" },
  { role: "desenvolvedor frontend", category: "tech", seniority: "pleno",   industry: "tecnologia", region: "sp", cltMin:  6500, cltMedian:  8500, cltMax: 12000, pjMultiplier: 1.40, confidence: "high", source: "Robert Half 2025" },
  { role: "desenvolvedor frontend", category: "tech", seniority: "senior",  industry: "tecnologia", region: "sp", cltMin: 11000, cltMedian: 15000, cltMax: 20000, pjMultiplier: 1.42, confidence: "high", source: "Robert Half 2025" },
  { role: "desenvolvedor fullstack", category: "tech", seniority: "junior",  industry: "tecnologia", region: "sp", cltMin:  4500, cltMedian:  6000, cltMax:  8000, pjMultiplier: 1.40, confidence: "high", source: "Robert Half 2025" },
  { role: "desenvolvedor fullstack", category: "tech", seniority: "pleno",   industry: "tecnologia", region: "sp", cltMin:  8000, cltMedian: 11000, cltMax: 15000, pjMultiplier: 1.42, confidence: "high", source: "Robert Half 2025" },
  { role: "desenvolvedor fullstack", category: "tech", seniority: "senior",  industry: "tecnologia", region: "sp", cltMin: 13000, cltMedian: 18000, cltMax: 25000, pjMultiplier: 1.42, confidence: "high", source: "Robert Half 2025" },
  { role: "engenheiro de dados", category: "tech", seniority: "pleno",   industry: "tecnologia", region: "sp", cltMin:  9000, cltMedian: 13000, cltMax: 18000, pjMultiplier: 1.42, confidence: "high", source: "Michael Page 2026" },
  { role: "engenheiro de dados", category: "tech", seniority: "senior",  industry: "tecnologia", region: "sp", cltMin: 15000, cltMedian: 20000, cltMax: 28000, pjMultiplier: 1.45, confidence: "high", source: "Michael Page 2026" },
  { role: "cientiста de dados", category: "tech", seniority: "pleno",   industry: "tecnologia", region: "sp", cltMin: 10000, cltMedian: 14000, cltMax: 20000, pjMultiplier: 1.42, confidence: "high", source: "Hays 2025" },
  { role: "cientista de dados", category: "tech", seniority: "senior",  industry: "tecnologia", region: "sp", cltMin: 16000, cltMedian: 22000, cltMax: 30000, pjMultiplier: 1.45, confidence: "high", source: "Hays 2025" },
  { role: "product manager", category: "produto", seniority: "pleno",   industry: "tecnologia", region: "sp", cltMin:  8000, cltMedian: 12000, cltMax: 17000, pjMultiplier: 1.40, confidence: "high", source: "Robert Half 2025" },
  { role: "product manager", category: "produto", seniority: "senior",  industry: "tecnologia", region: "sp", cltMin: 14000, cltMedian: 20000, cltMax: 28000, pjMultiplier: 1.42, confidence: "high", source: "Robert Half 2025" },
  { role: "gerente de ti", category: "tech", seniority: "gerente", industry: "tecnologia", region: "sp", cltMin: 18000, cltMedian: 25000, cltMax: 38000, pjMultiplier: 1.45, confidence: "high", source: "Robert Half 2025" },
  { role: "cto", category: "tech", seniority: "clevel", industry: "tecnologia", region: "sp", cltMin: 35000, cltMedian: 55000, cltMax: 90000, pjMultiplier: 1.50, confidence: "medium", source: "Michael Page 2026" },

  // ── FINANCE & BANKING ────────────────────────────────────────────────────────
  { role: "analista financeiro", category: "financas", seniority: "junior",  industry: "banco", region: "sp", cltMin:  3500, cltMedian:  4500, cltMax:  6000, pjMultiplier: 1.38, confidence: "high", source: "Hays LATAM 2025" },
  { role: "analista financeiro", category: "financas", seniority: "pleno",   industry: "banco", region: "sp", cltMin:  5500, cltMedian:  7500, cltMax: 11000, pjMultiplier: 1.38, confidence: "high", source: "Hays LATAM 2025" },
  { role: "analista financeiro", category: "financas", seniority: "senior",  industry: "banco", region: "sp", cltMin:  9000, cltMedian: 13000, cltMax: 18000, pjMultiplier: 1.40, confidence: "high", source: "Hays LATAM 2025" },
  { role: "controller", category: "financas", seniority: "pleno",   industry: "financas", region: "sp", cltMin:  7000, cltMedian: 10000, cltMax: 14000, pjMultiplier: 1.38, confidence: "high", source: "Robert Half 2025" },
  { role: "controller", category: "financas", seniority: "senior",  industry: "financas", region: "sp", cltMin: 12000, cltMedian: 17000, cltMax: 25000, pjMultiplier: 1.40, confidence: "high", source: "Robert Half 2025" },
  { role: "gerente financeiro", category: "financas", seniority: "gerente", industry: "financas", region: "sp", cltMin: 18000, cltMedian: 25000, cltMax: 40000, pjMultiplier: 1.42, confidence: "high", source: "Robert Half 2025" },
  { role: "cfo", category: "financas", seniority: "clevel", industry: "financas", region: "sp", cltMin: 30000, cltMedian: 50000, cltMax: 80000, pjMultiplier: 1.50, confidence: "medium", source: "Michael Page 2026" },
  { role: "analista de mercado de capitais", category: "financas", seniority: "pleno",  industry: "mercado_capital", region: "sp", cltMin:  8000, cltMedian: 12000, cltMax: 18000, pjMultiplier: 1.40, confidence: "high", source: "Hays LATAM 2025" },
  { role: "analista de mercado de capitais", category: "financas", seniority: "senior", industry: "mercado_capital", region: "sp", cltMin: 15000, cltMedian: 22000, cltMax: 35000, pjMultiplier: 1.42, confidence: "high", source: "Hays LATAM 2025" },
  { role: "estruturador de project finance", category: "financas", seniority: "senior",  industry: "banco", region: "sp", cltMin: 18000, cltMedian: 28000, cltMax: 45000, pjMultiplier: 1.45, confidence: "medium", source: "Michael Page 2026" },
  { role: "estruturador de project finance", category: "financas", seniority: "gerente", industry: "banco", region: "sp", cltMin: 28000, cltMedian: 42000, cltMax: 65000, pjMultiplier: 1.45, confidence: "medium", source: "Michael Page 2026" },
  { role: "global officer", category: "financas", seniority: "senior",  industry: "banco", region: "sp", cltMin: 20000, cltMedian: 32000, cltMax: 50000, pjMultiplier: 1.45, confidence: "medium", source: "Michael Page 2026" },

  // ── SALES ────────────────────────────────────────────────────────────────────
  { role: "sdr", category: "vendas", seniority: "junior",  industry: "saas", region: "sp", cltMin:  3000, cltMedian:  4000, cltMax:  5500, pjMultiplier: 1.35, confidence: "high", source: "Robert Half 2025" },
  { role: "sdr", category: "vendas", seniority: "pleno",   industry: "saas", region: "sp", cltMin:  4500, cltMedian:  6000, cltMax:  8000, pjMultiplier: 1.35, confidence: "high", source: "Robert Half 2025" },
  { role: "bdr", category: "vendas", seniority: "junior",  industry: "saas", region: "sp", cltMin:  3500, cltMedian:  5000, cltMax:  7000, pjMultiplier: 1.35, confidence: "high", source: "Robert Half 2025" },
  { role: "account executive", category: "vendas", seniority: "pleno",  industry: "saas", region: "sp", cltMin:  6000, cltMedian:  9000, cltMax: 13000, pjMultiplier: 1.38, confidence: "high", source: "Hays LATAM 2025" },
  { role: "account executive", category: "vendas", seniority: "senior", industry: "saas", region: "sp", cltMin: 10000, cltMedian: 15000, cltMax: 22000, pjMultiplier: 1.40, confidence: "high", source: "Hays LATAM 2025" },
  { role: "gerente comercial", category: "vendas", seniority: "gerente", industry: "default", region: "sp", cltMin: 12000, cltMedian: 18000, cltMax: 30000, pjMultiplier: 1.40, confidence: "high", source: "Robert Half 2025" },
  { role: "diretor comercial", category: "vendas", seniority: "diretor", industry: "default", region: "sp", cltMin: 22000, cltMedian: 35000, cltMax: 60000, pjMultiplier: 1.45, confidence: "high", source: "Michael Page 2026" },
  { role: "key account manager", category: "vendas", seniority: "pleno",  industry: "default", region: "sp", cltMin:  7000, cltMedian: 10000, cltMax: 15000, pjMultiplier: 1.38, confidence: "high", source: "Robert Half 2025" },
  { role: "key account manager", category: "vendas", seniority: "senior", industry: "default", region: "sp", cltMin: 12000, cltMedian: 17000, cltMax: 25000, pjMultiplier: 1.40, confidence: "high", source: "Robert Half 2025" },

  // ── HR / PEOPLE ──────────────────────────────────────────────────────────────
  { role: "analista de rh", category: "rh", seniority: "junior",  industry: "default", region: "sp", cltMin:  2800, cltMedian:  3800, cltMax:  5000, pjMultiplier: 1.35, confidence: "high", source: "Robert Half 2025" },
  { role: "analista de rh", category: "rh", seniority: "pleno",   industry: "default", region: "sp", cltMin:  4500, cltMedian:  6000, cltMax:  8500, pjMultiplier: 1.35, confidence: "high", source: "Robert Half 2025" },
  { role: "business partner de rh", category: "rh", seniority: "senior", industry: "default", region: "sp", cltMin:  8000, cltMedian: 12000, cltMax: 18000, pjMultiplier: 1.38, confidence: "high", source: "Michael Page 2026" },
  { role: "talent acquisition", category: "rh", seniority: "pleno",  industry: "default", region: "sp", cltMin:  5000, cltMedian:  7000, cltMax: 10000, pjMultiplier: 1.35, confidence: "high", source: "Robert Half 2025" },
  { role: "talent acquisition", category: "rh", seniority: "senior", industry: "default", region: "sp", cltMin:  8000, cltMedian: 12000, cltMax: 17000, pjMultiplier: 1.38, confidence: "high", source: "Robert Half 2025" },
  { role: "diretor de rh", category: "rh", seniority: "diretor", industry: "default", region: "sp", cltMin: 20000, cltMedian: 32000, cltMax: 55000, pjMultiplier: 1.45, confidence: "high", source: "Michael Page 2026" },

  // ── MARKETING ───────────────────────────────────────────────────────────────
  { role: "analista de marketing", category: "marketing", seniority: "junior",  industry: "default", region: "sp", cltMin:  2500, cltMedian:  3500, cltMax:  5000, pjMultiplier: 1.35, confidence: "high", source: "Robert Half 2025" },
  { role: "analista de marketing", category: "marketing", seniority: "pleno",   industry: "default", region: "sp", cltMin:  4000, cltMedian:  6000, cltMax:  9000, pjMultiplier: 1.35, confidence: "high", source: "Robert Half 2025" },
  { role: "growth hacker", category: "marketing", seniority: "pleno",  industry: "saas", region: "sp", cltMin:  6000, cltMedian:  9000, cltMax: 14000, pjMultiplier: 1.38, confidence: "high", source: "Hays LATAM 2025" },
  { role: "cmo", category: "marketing", seniority: "clevel", industry: "default", region: "sp", cltMin: 25000, cltMedian: 40000, cltMax: 70000, pjMultiplier: 1.50, confidence: "medium", source: "Michael Page 2026" },

  // ── LEGAL / JUDICIAL ─────────────────────────────────────────────────────────
  { role: "advogado", category: "juridico", seniority: "junior",  industry: "juridico", region: "sp", cltMin:  3500, cltMedian:  5000, cltMax:  7000, pjMultiplier: 1.40, confidence: "high", source: "Robert Half 2025" },
  { role: "advogado", category: "juridico", seniority: "pleno",   industry: "juridico", region: "sp", cltMin:  6000, cltMedian:  9000, cltMax: 14000, pjMultiplier: 1.40, confidence: "high", source: "Robert Half 2025" },
  { role: "advogado", category: "juridico", seniority: "senior",  industry: "juridico", region: "sp", cltMin: 10000, cltMedian: 16000, cltMax: 28000, pjMultiplier: 1.42, confidence: "high", source: "Robert Half 2025" },
  { role: "perito judicial", category: "juridico", seniority: "senior",  industry: "juridico", region: "sp", cltMin:  8000, cltMedian: 14000, cltMax: 25000, pjMultiplier: 1.40, confidence: "medium", source: "Hays LATAM 2025" },
  { role: "perito judicial", category: "juridico", seniority: "gerente", industry: "juridico", region: "sp", cltMin: 15000, cltMedian: 25000, cltMax: 45000, pjMultiplier: 1.42, confidence: "medium", source: "Hays LATAM 2025" },
  { role: "gerente juridico", category: "juridico", seniority: "gerente", industry: "juridico", region: "sp", cltMin: 18000, cltMedian: 28000, cltMax: 50000, pjMultiplier: 1.42, confidence: "high", source: "Michael Page 2026" },

  // ── REAL ESTATE ──────────────────────────────────────────────────────────────
  { role: "corretor de imoveis", category: "imobiliario", seniority: "pleno",   industry: "imobiliario", region: "sp", cltMin:  3000, cltMedian:  5000, cltMax:  9000, pjMultiplier: 1.30, confidence: "medium", source: "Hays LATAM 2025" },
  { role: "corretor de imoveis", category: "imobiliario", seniority: "senior",  industry: "imobiliario", region: "sp", cltMin:  5000, cltMedian:  9000, cltMax: 18000, pjMultiplier: 1.30, confidence: "medium", source: "Hays LATAM 2025" },
  { role: "avaliador de imoveis", category: "imobiliario", seniority: "pleno",  industry: "imobiliario", region: "sp", cltMin:  4000, cltMedian:  7000, cltMax: 12000, pjMultiplier: 1.35, confidence: "medium", source: "Hays LATAM 2025" },
  { role: "gerente imobiliario", category: "imobiliario", seniority: "gerente", industry: "imobiliario", region: "sp", cltMin:  8000, cltMedian: 14000, cltMax: 25000, pjMultiplier: 1.38, confidence: "medium", source: "Hays LATAM 2025" },

  // ── OPERATIONS / SUPPLY CHAIN ────────────────────────────────────────────────
  { role: "analista de operacoes", category: "operacoes", seniority: "pleno",  industry: "default", region: "sp", cltMin:  4000, cltMedian:  6000, cltMax:  9000, pjMultiplier: 1.35, confidence: "high", source: "Robert Half 2025" },
  { role: "analista de operacoes", category: "operacoes", seniority: "senior", industry: "default", region: "sp", cltMin:  7000, cltMedian: 11000, cltMax: 16000, pjMultiplier: 1.38, confidence: "high", source: "Robert Half 2025" },
  { role: "gerente de operacoes", category: "operacoes", seniority: "gerente", industry: "default", region: "sp", cltMin: 14000, cltMedian: 22000, cltMax: 38000, pjMultiplier: 1.40, confidence: "high", source: "Robert Half 2025" },

  // ── CONSULTING ───────────────────────────────────────────────────────────────
  { role: "consultor", category: "consultoria", seniority: "junior",  industry: "consultoria", region: "sp", cltMin:  4000, cltMedian:  5500, cltMax:  7500, pjMultiplier: 1.40, confidence: "high", source: "Michael Page 2026" },
  { role: "consultor", category: "consultoria", seniority: "pleno",   industry: "consultoria", region: "sp", cltMin:  7000, cltMedian: 10000, cltMax: 15000, pjMultiplier: 1.40, confidence: "high", source: "Michael Page 2026" },
  { role: "consultor", category: "consultoria", seniority: "senior",  industry: "consultoria", region: "sp", cltMin: 12000, cltMedian: 18000, cltMax: 28000, pjMultiplier: 1.42, confidence: "high", source: "Michael Page 2026" },
  { role: "consultor", category: "consultoria", seniority: "gerente", industry: "consultoria", region: "sp", cltMin: 20000, cltMedian: 32000, cltMax: 55000, pjMultiplier: 1.45, confidence: "high", source: "Michael Page 2026" },
];

// ─── Role category clusters for similarity search ─────────────────────────────
export const ROLE_CLUSTERS: Record<string, string[]> = {
  tech:         ["desenvolvedor", "engenheiro", "arquiteto", "programador", "devops", "sre", "qa", "qa", "mobile", "data", "ml", "ia", "ai", "cloud"],
  produto:      ["product manager", "pm", "po", "product owner", "ux", "ui", "designer", "pesquisa", "research"],
  financas:     ["financeiro", "contabil", "controller", "tesouraria", "controladoria", "planejamento", "fp&a", "budget", "mercado", "capital", "investimento", "credito", "risco", "compliance"],
  vendas:       ["vendas", "comercial", "sales", "sdr", "bdr", "account", "closer", "hunter", "cs", "customer success", "pre-vendas", "inside sales"],
  marketing:    ["marketing", "growth", "brand", "cro", "seo", "ppc", "social", "conteudo", "crm"],
  rh:           ["rh", "recursos humanos", "people", "talent", "recrutamento", "selecao", "treinamento", "hrbp"],
  juridico:     ["juridico", "advogado", "legal", "perito", "compliance", "contrato", "litigio"],
  operacoes:    ["operacoes", "operacional", "supply", "logistica", "procurement", "projetos", "pmo"],
  consultoria:  ["consultor", "consulting", "advisory"],
  imobiliario:  ["corretor", "imoveis", "imobiliario", "avaliador", "creci"],
};
