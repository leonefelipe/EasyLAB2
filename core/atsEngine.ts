/**
 * atsEngine.ts — Deterministic ATS pre-scorer
 *
 * Runs locally BEFORE the LLM call to:
 *  1. Normalize text
 *  2. Expand skills via ontology
 *  3. Detect keyword spam
 *  4. Compute a weighted score + semantic-like TF-IDF boost
 *
 * Used by resumeRouter to enrich the userMessage sent to the LLM,
 * giving the model a pre-computed anchor so it calibrates its own
 * scores more accurately.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ATSInput {
  cvText: string;
  jobText: string;
}

export interface ATSResult {
  score: number;               // 0-100
  matchedSkills: string[];
  missingSkills: string[];
  transferableSkills: string[];
  spamDetected: boolean;
  spamWarning?: string;
  suggestions: string[];
  breakdown: {
    keywordMatch: number;      // 0-40
    skillCoverage: number;     // 0-30
    semanticBoost: number;     // 0-20
    spamPenalty: number;       // negative, 0 to -20
    formatting: number;        // 0-10
  };
}

// ─── Skill Ontology ───────────────────────────────────────────────────────────
// Each entry: canonical term → synonyms/aliases

const SKILL_ONTOLOGY: Record<string, string[]> = {
  // CRM / Sales tools
  "salesforce": ["sfdc", "sales cloud", "service cloud", "salesforce crm"],
  "hubspot": ["hubspot crm", "hubspot sales", "hubspot marketing"],
  "pipedrive": ["pipe drive"],
  "rdstation": ["rd station", "rd station crm"],
  "zoho crm": ["zoho"],

  // Sales methodologies
  "spin selling": ["spin"],
  "meddic": ["meddpicc", "meddicc"],
  "bant": ["budget authority need timeline"],
  "challenger sale": ["challenger sales"],
  "sandler": ["sandler selling"],

  // Analytics / BI
  "power bi": ["powerbi", "pbi", "microsoft power bi"],
  "tableau": ["tableau desktop", "tableau server"],
  "google analytics": ["ga4", "google analytics 4", "universal analytics"],
  "looker": ["looker studio", "google data studio", "data studio"],
  "sql": ["mysql", "postgresql", "postgres", "t-sql", "plsql", "pl/sql"],
  "excel": ["microsoft excel", "planilha excel", "ms excel"],
  "python": ["python3", "py"],

  // HR / Recruitment
  "linkedin recruiter": ["lir", "linkedin talent solutions"],
  "greenhouse": ["greenhouse ats"],
  "workday": ["workday hcm", "workday recruiting"],
  "gupy": ["gupy ats"],
  "taleo": ["oracle taleo"],
  "successfactors": ["sap successfactors", "sf"],
  "lever": ["lever ats"],
  "icims": ["icims ats"],
  "boolean search": ["boolean sourcing", "busca booleana", "pesquisa booleana"],
  "talent acquisition": ["ta", "aquisição de talentos", "recrutamento e seleção", "r&s"],
  "people analytics": ["hr analytics", "workforce analytics"],
  "employer branding": ["marca empregadora"],

  // Marketing
  "google ads": ["adwords", "google adwords", "gads"],
  "meta ads": ["facebook ads", "instagram ads", "fb ads"],
  "seo": ["search engine optimization", "otimização para mecanismos de busca"],
  "inbound marketing": ["inbound"],
  "content marketing": ["marketing de conteúdo"],
  "email marketing": ["e-mail marketing"],

  // Finance
  "financial modeling": ["modelagem financeira", "financial model"],
  "valuation": ["avaliação de empresas", "dcf", "discounted cash flow"],
  "cge": ["chartered financial analyst", "cfa"],

  // Tech
  "react": ["reactjs", "react.js"],
  "node.js": ["nodejs", "node js"],
  "typescript": ["ts"],
  "javascript": ["js", "ecmascript"],
  "docker": ["containerização", "containers"],
  "aws": ["amazon web services"],
  "azure": ["microsoft azure"],
  "gcp": ["google cloud", "google cloud platform"],
  "agile": ["ágil", "metodologia ágil", "agile methodology"],
  "scrum": ["scrum master", "scrum methodology"],
  "kanban": [],
  "devops": ["dev ops"],
  "machine learning": ["ml", "aprendizado de máquina"],

  // Soft skills (weighted lower)
  "liderança": ["leadership", "gestão de equipe", "team management", "team lead"],
  "comunicação": ["communication", "comunicação assertiva"],
  "negociação": ["negotiation", "negociation"],
  "gestão de projetos": ["project management", "gerenciamento de projetos", "pm"],
  "planejamento estratégico": ["strategic planning", "planejamento"],

  // ── SAÚDE / FARMÁCIA / BIOTECH ──────────────────────────────────────────────
  "anvisa": ["agência nacional de vigilância sanitária", "regulatório anvisa", "registro anvisa"],
  "boas práticas de fabricação": ["bpf", "gmp", "good manufacturing practice", "bpf/bpc"],
  "farmácia hospitalar": ["farmacêutico hospitalar", "farmacêutico clínico", "farmácia clínica"],
  "gestão de qualidade": ["quality management", "gq", "qualidade", "gestão da qualidade"],
  "iso 9001": ["iso9001", "norma iso 9001", "certificação iso"],
  "iso 13485": ["dispositivos médicos", "medical devices", "iso13485"],
  "farmacovigilância": ["pharmacovigilance", "pv", "segurança de medicamentos"],
  "ensaios clínicos": ["clinical trials", "pesquisa clínica", "protocolo clínico"],
  "hemodinâmica": ["hemodinâmica", "cateterismo", "intervenção cardiovascular"],
  "enfermagem": ["técnico de enfermagem", "enfermeiro", "coren"],
  "prontuário eletrônico": ["pep", "prontuário do paciente", "tasy", "soul mv", "ehr"],

  // ── LOGÍSTICA / SUPPLY CHAIN ────────────────────────────────────────────────
  "gestão de estoque": ["inventory management", "controle de estoque", "wms", "warehouse management"],
  "supply chain": ["cadeia de suprimentos", "supply chain management", "scm", "gestão da cadeia"],
  "logística reversa": ["reverse logistics", "logística de devolução", "pós-venda logística"],
  "gestão de transportes": ["tms", "transportation management", "frete", "gestão de frotas"],
  "lean manufacturing": ["lean", "manufatura enxuta", "toyota production system", "tps"],
  "six sigma": ["6 sigma", "seis sigma", "dmaic", "dmadv", "black belt", "green belt"],
  "armazenagem": ["warehouse", "armazém", "almoxarifado", "cross-docking"],
  "sap mm": ["sap materials management", "sap compras", "módulo mm"],
  "sap wm": ["sap warehouse management", "sap ewm", "módulo wm"],
  "erp": ["enterprise resource planning", "totvs", "protheus", "sap", "oracle", "sankhya", "senior sistemas"],
  "importação": ["comércio exterior", "import", "siscomex", "drawback", "radar"],
  "exportação": ["export", "comex", "ncm", "incoterms", "câmbio"],
  "planejamento de demanda": ["demand planning", "s&op", "sales and operations planning"],

  // ── FINANÇAS / CONTABILIDADE / CONTROLADORIA ────────────────────────────────
  "contabilidade": ["ciências contábeis", "contador", "contábil", "crc"],
  "controladoria": ["controller", "controlling", "controle de gestão"],
  "conciliação contábil": ["reconciliação contábil", "account reconciliation", "conciliação bancária"],
  "fiscal": ["tributário", "tributação", "sped fiscal", "sped contábil", "obrigações acessórias"],
  "auditoria": ["audit", "auditoria interna", "auditoria externa", "sox", "auditoria independente"],
  "planejamento financeiro": ["fp&a", "financial planning", "orçamento", "budget", "forecast"],
  "fluxo de caixa": ["cash flow", "gestão de caixa", "tesouraria", "treasury"],
  "contas a pagar": ["accounts payable", "ap", "pagamentos"],
  "contas a receber": ["accounts receivable", "ar", "cobranças", "crédito e cobrança"],
  "ifrs": ["international financial reporting standards", "cpc", "normas contábeis"],
  "due diligence": ["dd", "auditoria de aquisição", "m&a", "fusões e aquisições"],
  "cpa 20": ["cpa-20", "anbima cpa20", "certificação cpa-20"],
  "cpa 10": ["cpa-10", "anbima cpa10", "certificação cpa-10"],
  "cea": ["certificação de especialista em investimentos", "anbima cea"],
  "análise de crédito": ["credit analysis", "risco de crédito", "concessão de crédito"],
  "gestão de riscos": ["risk management", "gestão de risco", "controles internos"],

  // ── JURÍDICO / COMPLIANCE ───────────────────────────────────────────────────
  "compliance": ["conformidade", "compliance officer", "programa de integridade"],
  "contratos": ["gestão de contratos", "contract management", "elaboração de contratos", "análise contratual"],
  "lgpd": ["lei geral de proteção de dados", "privacidade de dados", "gdpr", "dpo", "data protection"],
  "direito trabalhista": ["clt", "trabalhista", "legislação trabalhista", "relações trabalhistas"],
  "propriedade intelectual": ["patentes", "marcas", "inpi", "direito autoral"],
  "direito empresarial": ["societário", "direito corporativo", "corporate law"],
  "licitação": ["licitações", "pregão", "lei 14133", "lei 8666", "contratos públicos"],
  "antitruste": ["defesa da concorrência", "cade", "antitrust"],

  // ── ENGENHARIA / CONSTRUÇÃO CIVIL ───────────────────────────────────────────
  "gestão de obras": ["construção civil", "engenheiro de obras", "gerenciamento de obras", "construção"],
  "autocad": ["auto cad", "cad", "desenho técnico", "desenho auxiliado por computador"],
  "revit": ["bim", "building information modeling", "modelagem 3d"],
  "ms project": ["microsoft project", "cronograma de obras", "cronograma físico-financeiro", "primavera"],
  "normas abnt": ["nbr", "abnt", "normas técnicas", "normas regulamentadoras"],
  "pcp": ["planejamento e controle de produção", "production planning", "chão de fábrica"],
  "segurança do trabalho": ["nr", "nr-35", "nr-10", "nr-12", "ssma", "hse", "ehs", "cipa"],
  "manutenção": ["manutenção industrial", "manutenção preventiva", "manutenção corretiva", "pcm"],
  "engenharia elétrica": ["sistemas elétricos", "quadros elétricos", "spda", "nr-10"],
  "engenharia mecânica": ["projetos mecânicos", "solidworks", "catia", "ansys"],
  "geotecnia": ["mecânica dos solos", "fundações", "sondagem", "geologia"],
  "orçamento de obras": ["orçamentação", "composição de preços", "sinapi", "tcpo"],
  "controle de qualidade": ["cq", "inspeção de qualidade", "ensaios", "controle de processos"],

  // ── EDUCAÇÃO / TREINAMENTO ──────────────────────────────────────────────────
  "design instrucional": ["instrucional design", "instructional design", "di", "conteúdo educacional"],
  "ead": ["ensino a distância", "e-learning", "lms", "moodle", "blackboard", "canvas"],
  "treinamento e desenvolvimento": ["t&d", "training and development", "t&d corporativo", "educação corporativa"],
  "universidade corporativa": ["corporate university", "escola de negócios", "academia corporativa"],
  "pedagogia": ["pedagogo", "ciências da educação", "educação"],
  "avaliação de aprendizagem": ["kirkpatrick", "roi de treinamento", "eficácia de treinamento"],

  // ── VAREJO / E-COMMERCE ─────────────────────────────────────────────────────
  "gestão de categoria": ["category management", "gestão de mix", "buyer", "comprador"],
  "e-commerce": ["ecommerce", "loja virtual", "marketplace", "shopify", "magento"],
  "vtex": ["plataforma vtex", "vtex io", "vtex commerce"],
  "merchandising": ["visual merchandising", "planograma", "exposição de produtos"],
  "trade marketing": ["trade", "pdv", "ponto de venda", "go-to-market varejo"],
  "gestão de loja": ["gerente de loja", "gestão de ponto de venda", "store management"],

  // ── AGRONEGÓCIO / AGRO ──────────────────────────────────────────────────────
  "agronomia": ["engenheiro agrônomo", "ciências agrárias", "agro"],
  "agricultura de precisão": ["gps agrícola", "sensoriamento remoto", "drones agrícolas", "agricultura 4.0"],
  "defensivos agrícolas": ["agroquímicos", "fitossanidade", "receituário agronômico"],
  "gestão rural": ["fazenda", "pecuária", "bovinocultura", "suinocultura", "avicultura"],
  "irrigação": ["sistemas de irrigação", "pivot central", "gotejamento"],

  // ── SETOR PÚBLICO ───────────────────────────────────────────────────────────
  "gestão pública": ["administração pública", "serviço público", "políticas públicas"],
  "orçamento público": ["lei orçamentária anual", "loa", "ldo", "ppa", "siafi"],
  "pregão eletrônico": ["comprasnet", "bec", "sistema de compras governamentais"],
  "concurso público": ["aprovado em concurso", "servidão pública", "estatutário"],
};

// Transferable skill clusters — if candidate has one, they may transfer to related roles
const TRANSFERABLE_CLUSTERS: Array<{ source: string[]; target: string[] }> = [
  {
    source: ["salesforce", "hubspot", "pipedrive", "rdstation"],
    target: ["crm", "gestão de pipeline", "pipeline management"],
  },
  {
    source: ["sql", "power bi", "tableau", "looker"],
    target: ["análise de dados", "data analysis", "business intelligence", "bi"],
  },
  {
    source: ["linkedin recruiter", "boolean search", "talent acquisition"],
    target: ["sourcing", "headhunting", "atração de talentos"],
  },
  {
    source: ["scrum", "kanban", "agile"],
    target: ["gestão ágil", "metodologia ágil", "entrega ágil"],
  },
  {
    source: ["google ads", "meta ads", "seo"],
    target: ["performance marketing", "mídia paga", "marketing digital"],
  },
  {
    source: ["financial modeling", "valuation", "dcf"],
    target: ["análise financeira", "financial analysis", "corporate finance"],
  },
  // ── Novos clusters ───────────────────────────────────────────────────────────
  {
    source: ["lean manufacturing", "six sigma", "pcp"],
    target: ["melhoria contínua", "operational excellence", "eficiência operacional", "kaizen"],
  },
  {
    source: ["supply chain", "gestão de estoque", "gestão de transportes"],
    target: ["operações", "operations management", "logística integrada"],
  },
  {
    source: ["auditoria", "compliance", "gestão de riscos"],
    target: ["controles internos", "governança corporativa", "risk management"],
  },
  {
    source: ["contabilidade", "controladoria", "planejamento financeiro"],
    target: ["finanças corporativas", "gestão financeira", "finance"],
  },
  {
    source: ["contratos", "lgpd", "compliance"],
    target: ["jurídico empresarial", "assessoria jurídica", "legal"],
  },
  {
    source: ["treinamento e desenvolvimento", "design instrucional", "ead"],
    target: ["educação corporativa", "people development", "learning & development"],
  },
  {
    source: ["e-commerce", "vtex", "gestão de categoria"],
    target: ["varejo digital", "digital commerce", "marketplace management"],
  },
  {
    source: ["gestão de obras", "autocad", "ms project"],
    target: ["gestão de projetos de engenharia", "construção e infraestrutura"],
  },
  {
    source: ["anvisa", "boas práticas de fabricação", "farmácia hospitalar"],
    target: ["regulatório", "regulatory affairs", "qualidade farmacêutica"],
  },
];

// ─── Text Normalization ───────────────────────────────────────────────────────

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove diacritics
    .replace(/[^\w\s+#.]/g, " ")    // keep +, #, . for C++, C#, Node.js
    .replace(/\s{2,}/g, " ")
    .trim();
}

function tokenize(text: string): string[] {
  const norm = normalize(text);
  // extract 1-gram, 2-gram, 3-gram phrases
  const words = norm.split(/\s+/);
  const tokens = new Set<string>();
  for (let i = 0; i < words.length; i++) {
    tokens.add(words[i]);
    if (i + 1 < words.length) tokens.add(`${words[i]} ${words[i + 1]}`);
    if (i + 2 < words.length) tokens.add(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
  }
  return Array.from(tokens).filter(t => t.length > 1);
}

// ─── Ontology Expansion ───────────────────────────────────────────────────────

function expandWithOntology(tokens: Set<string>): Set<string> {
  const expanded = new Set(tokens);
  for (const [canonical, aliases] of Object.entries(SKILL_ONTOLOGY)) {
    const normCanonical = normalize(canonical);
    const normAliases = aliases.map(normalize);
    const allTerms = [normCanonical, ...normAliases];
    const found = allTerms.some(t => tokens.has(t));
    if (found) {
      // add canonical + all aliases to expanded set
      allTerms.forEach(t => expanded.add(t));
    }
  }
  return expanded;
}

// ─── Extract canonical skill set from text ───────────────────────────────────

function extractSkills(text: string): Set<string> {
  const tokens = new Set(tokenize(text));
  const expanded = expandWithOntology(tokens);

  const found = new Set<string>();
  for (const [canonical, aliases] of Object.entries(SKILL_ONTOLOGY)) {
    const normCanonical = normalize(canonical);
    const normAliases = aliases.map(normalize);
    if ([normCanonical, ...normAliases].some(t => expanded.has(t))) {
      found.add(canonical); // always store canonical form
    }
  }
  return found;
}

// ─── Keyword Spam Detection ───────────────────────────────────────────────────

function detectSpam(cvText: string, jobText: string): { spam: boolean; warning?: string } {
  const jobTokens = new Set(tokenize(jobText));
  const cvWords = normalize(cvText).split(/\s+/);

  // Count how many job keywords appear in a tiny window of the CV
  // (spam = dump all keywords in a tiny summary)
  const summaryWindow = cvWords.slice(0, 150); // first ~150 words
  let summaryHits = 0;
  for (const token of jobTokens) {
    if (token.split(" ").length === 1 && summaryWindow.includes(token)) {
      summaryHits++;
    }
  }

  // Calculate density
  const density = summaryHits / Math.max(summaryWindow.length, 1);
  if (density > 0.35) {
    return {
      spam: true,
      warning: `Keyword stuffing detected: ${summaryHits} job keywords in the first 150 CV words (density ${(density * 100).toFixed(0)}%). ATS may penalize.`,
    };
  }

  // Check for exact phrase repetition (same phrase 4+ times)
  const phraseCount: Record<string, number> = {};
  for (const t of tokenize(cvText)) {
    if (t.split(" ").length >= 2) {
      phraseCount[t] = (phraseCount[t] ?? 0) + 1;
    }
  }
  const spamPhrases = Object.entries(phraseCount).filter(([, n]) => n >= 4);
  if (spamPhrases.length > 0) {
    return {
      spam: true,
      warning: `Repeated phrases detected (${spamPhrases.map(([p]) => `"${p}"`).join(", ")}). Remove duplicates.`,
    };
  }

  return { spam: false };
}

// ─── TF-IDF Semantic Boost ────────────────────────────────────────────────────

function tfidfBoost(cvText: string, jobText: string): number {
  const cvTokens = tokenize(cvText);
  const jobTokens = tokenize(jobText);

  const jobFreq: Record<string, number> = {};
  for (const t of jobTokens) jobFreq[t] = (jobFreq[t] ?? 0) + 1;

  // Normalize job frequencies to IDF proxy
  const totalJobTerms = jobTokens.length || 1;
  let overlap = 0;
  let totalWeight = 0;

  for (const [term, freq] of Object.entries(jobFreq)) {
    const tf = freq / totalJobTerms;
    // terms appearing in 30-70% of job text are most discriminating
    const idfProxy = tf < 0.01 ? 2 : tf < 0.05 ? 1.5 : 1;
    const weight = tf * idfProxy;
    totalWeight += weight;
    if (cvTokens.includes(term)) overlap += weight;
  }

  if (totalWeight === 0) return 0;
  return Math.min(1, overlap / totalWeight);
}

// ─── Formatting Score ─────────────────────────────────────────────────────────

function scoreParsability(cvText: string): number {
  let score = 10;

  // Penalize ATS-hostile patterns
  if (/[\u2600-\u27BF]|[\uD800-\uDFFF]/.test(cvText)) score -= 4; // emojis
  if (/\*\*|\*[^*]|__/.test(cvText)) score -= 2;                   // markdown
  if (/#{1,6}\s/.test(cvText)) score -= 1;                          // md headers
  if (/\|.+\|.+\|/.test(cvText)) score -= 2;                        // tables
  if (/●●|★★|■■/.test(cvText)) score -= 2;                          // skill bars

  return Math.max(0, score);
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export function calculateATSScore(input: ATSInput): ATSResult {
  const { cvText, jobText } = input;

  // 1. Extract skill sets
  const cvSkills = extractSkills(cvText);
  const jobSkills = extractSkills(jobText);

  // 2. Matched / Missing
  const matchedSkills = Array.from(jobSkills).filter(s => cvSkills.has(s));
  const missingSkills = Array.from(jobSkills).filter(s => !cvSkills.has(s));

  // 3. Transferable skills
  const transferableSkills: string[] = [];
  for (const cluster of TRANSFERABLE_CLUSTERS) {
    const hasSource = cluster.source.some(s => cvSkills.has(s));
    const needsTarget = cluster.target.some(t =>
      missingSkills.some(m => normalize(m).includes(normalize(t)))
    );
    if (hasSource && needsTarget) {
      // candidate has related skills
      const owned = cluster.source.filter(s => cvSkills.has(s));
      transferableSkills.push(...owned);
    }
  }

  // 4. Skill coverage score (0-30)
  const coverageRatio = jobSkills.size === 0 ? 1 : matchedSkills.length / jobSkills.size;
  const skillCoverage = Math.round(coverageRatio * 30);

  // 5. Keyword match score (0-40) — raw token overlap
  const cvTokenSet = new Set(tokenize(cvText));
  const jobTokenSet = new Set(tokenize(jobText));
  const rawTokenMatches = Array.from(jobTokenSet).filter(t => cvTokenSet.has(t)).length;
  const rawRatio = jobTokenSet.size === 0 ? 0 : rawTokenMatches / jobTokenSet.size;
  const keywordMatch = Math.round(rawRatio * 40);

  // 6. Semantic TF-IDF boost (0-20)
  const boostRatio = tfidfBoost(cvText, jobText);
  const semanticBoost = Math.round(boostRatio * 20);

  // 7. Spam penalty (0 to -20)
  const spamResult = detectSpam(cvText, jobText);
  const spamPenalty = spamResult.spam ? -15 : 0;

  // 8. Formatting score (0-10)
  const formatting = scoreParsability(cvText);

  // 9. Total (capped 0-100)
  const rawTotal = keywordMatch + skillCoverage + semanticBoost + spamPenalty + formatting;
  const score = Math.min(100, Math.max(0, rawTotal));

  // 10. Suggestions
  const suggestions: string[] = [];

  if (missingSkills.length > 0) {
    suggestions.push(
      `Add these missing keywords to your resume: ${missingSkills.slice(0, 5).join(", ")}.`
    );
  }
  if (transferableSkills.length > 0) {
    suggestions.push(
      `Highlight transferable skills: ${[...new Set(transferableSkills)].slice(0, 3).join(", ")} — relevant to this role.`
    );
  }
  if (spamResult.spam && spamResult.warning) {
    suggestions.push(spamResult.warning);
  }
  if (formatting < 6) {
    suggestions.push(
      "Remove emojis, markdown formatting, and tables — they break ATS parsing."
    );
  }
  if (coverageRatio < 0.3) {
    suggestions.push(
      "Skill coverage is below 30%. Consider whether this role aligns with your background."
    );
  }
  if (semanticBoost < 8) {
    suggestions.push(
      "Use the exact terminology from the job description in your Professional Summary."
    );
  }

  return {
    score,
    matchedSkills,
    missingSkills,
    transferableSkills: [...new Set(transferableSkills)],
    spamDetected: spamResult.spam,
    spamWarning: spamResult.warning,
    suggestions,
    breakdown: {
      keywordMatch,
      skillCoverage,
      semanticBoost,
      spamPenalty,
      formatting,
    },
  };
}

/**
 * Serialize ATSResult into a compact string for LLM context injection.
 * Keeps token count low while giving the model the pre-computed anchor.
 */
export function atsResultToPromptContext(r: ATSResult): string {
  return [
    `PRE-COMPUTED ATS ENGINE (deterministic — use as calibration anchor):`,
    `Score: ${r.score}/100`,
    `Breakdown: keyword=${r.breakdown.keywordMatch}/40 | skills=${r.breakdown.skillCoverage}/30 | semantic=${r.breakdown.semanticBoost}/20 | formatting=${r.breakdown.formatting}/10 | spam=${r.breakdown.spamPenalty}`,
    `Matched skills (${r.matchedSkills.length}): ${r.matchedSkills.join(", ") || "none"}`,
    `Missing skills (${r.missingSkills.length}): ${r.missingSkills.slice(0, 8).join(", ") || "none"}`,
    `Transferable: ${r.transferableSkills.join(", ") || "none"}`,
    r.spamDetected ? `⚠ SPAM: ${r.spamWarning}` : "",
    `Engine suggestions: ${r.suggestions.slice(0, 3).join(" | ")}`,
    `NOTE: Your final matchScore must reflect this anchor. Do NOT deviate by more than ±15 points without strong justification.`,
  ]
    .filter(Boolean)
    .join("\n");
}
