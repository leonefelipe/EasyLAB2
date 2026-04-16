import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface JobListing {
  title: string;
  company: string;
  location: string;
  url: string;
  source: string;
  description: string;
  matchReason: string;
  applicantCount?: number;
  numVacancies?: number;
  publishedAt?: string;
  expiresAt?: string;
  workType?: string;
  isReal: boolean;
}

// ─── LinkedIn URL builder (ported from linkedin-mcp-server search_jobs.py) ───

const LI_EXPERIENCE_MAP: Record<string, string> = {
  júnior: "2", junior: "2", estágio: "1", estagio: "1",
  pleno: "3", associate: "3",
  sênior: "4", senior: "4", mid_senior: "4",
  gerente: "5", manager: "5",
  diretor: "6", director: "6", "c-level": "6",
};

const LI_WORK_TYPE_MAP: Record<string, string> = {
  presencial: "1", "on_site": "1", "on-site": "1",
  remoto: "2", remote: "2",
  híbrido: "3", hibrido: "3", hybrid: "3",
};

function buildLinkedInSearchUrl(params: {
  keywords: string;
  location?: string;
  seniorityLevel?: string;
  workType?: string;
  easyApply?: boolean;
}): string {
  const parts: string[] = [`keywords=${encodeURIComponent(params.keywords)}`];
  if (params.location) parts.push(`location=${encodeURIComponent(params.location)}`);
  // Past week — good freshness without being too restrictive
  parts.push("f_TPR=r604800");
  // Sort by date for freshness
  parts.push("sortBy=DD");

  if (params.seniorityLevel) {
    const lvl = params.seniorityLevel.toLowerCase();
    for (const [key, code] of Object.entries(LI_EXPERIENCE_MAP)) {
      if (lvl.includes(key)) { parts.push(`f_E=${code}`); break; }
    }
  }
  if (params.workType) {
    const code = LI_WORK_TYPE_MAP[params.workType.toLowerCase()];
    if (code) parts.push(`f_WT=${code}`);
  }
  if (params.easyApply) parts.push("f_AL=true");

  return `https://www.linkedin.com/jobs/search/?${parts.join("&")}`;
}

// ─── Gupy Public REST API ─────────────────────────────────────────────────────

interface GupyApiJob {
  id: number;
  name: string;
  publishedAt: string;
  expiresAt: string;
  numVacancies: number;
  applicantCount: number;
  isConfidential: boolean;
  jobUrl?: string;
  workplaceType?: string;
  city?: string;
  state?: string;
  companyName?: string;
  careerPageName?: string;
  careerPageUrl?: string;
}

async function fetchGupyJobs(query: string, limit = 6): Promise<JobListing[]> {
  const url = `https://portal.gupy.io/api/job-search/v1/jobs?jobName=${encodeURIComponent(query)}&limit=${limit}&offset=0`;

  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "Accept-Language": "pt-BR,pt;q=0.9",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(9000),
    });

    if (!res.ok) return [];
    const json = await res.json() as { data?: GupyApiJob[] };
    if (!json.data || !Array.isArray(json.data) || json.data.length === 0) return [];

    const workTypeMap: Record<string, string> = {
      remote: "Remoto", hybrid: "Híbrido", "on-site": "Presencial",
    };

    return json.data.map((job): JobListing => {
      const company = job.isConfidential ? "Empresa confidencial"
        : job.companyName || job.careerPageName || "Empresa não informada";
      const locationParts = [job.city, job.state].filter(Boolean);
      const baseLocation = locationParts.length > 0 ? locationParts.join(", ") : "Brasil";
      const workType = job.workplaceType ? workTypeMap[job.workplaceType] : undefined;

      const jobUrl = job.jobUrl ?? (job.careerPageUrl
        ? `${job.careerPageUrl.replace(/\/$/, "")}/jobs/${job.id}`
        : `https://portal.gupy.io/job-search/term=${encodeURIComponent(query)}`);

      const publishedAt = job.publishedAt
        ? new Date(job.publishedAt).toLocaleDateString("pt-BR") : undefined;
      const expiresAt = job.expiresAt
        ? new Date(job.expiresAt).toLocaleDateString("pt-BR") : undefined;

      return {
        title: job.name,
        company,
        location: workType ? `${baseLocation} · ${workType}` : baseLocation,
        url: jobUrl,
        source: "Gupy",
        description: [
          job.applicantCount ? `${job.applicantCount} candidatos` : null,
          job.numVacancies > 1 ? `${job.numVacancies} vagas` : null,
          publishedAt ? `Publicada ${publishedAt}` : null,
        ].filter(Boolean).join(" · ") || `Vaga de ${job.name}`,
        matchReason: "",
        applicantCount: job.applicantCount,
        numVacancies: job.numVacancies,
        publishedAt,
        expiresAt,
        workType,
        isReal: true,
      };
    });
  } catch {
    return [];
  }
}

// ─── Vagas.com.br HTML scrape ─────────────────────────────────────────────────

async function fetchVagasJobs(query: string, limit = 4): Promise<JobListing[]> {
  try {
    const slug = query.toLowerCase().replace(/\s+/g, "-").replace(/[^\w-]/g, "");
    const res = await fetch(`https://www.vagas.com.br/vagas-de-${slug}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html",
        "Accept-Language": "pt-BR,pt;q=0.9",
      },
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return [];
    const html = await res.text();

    const jobs: JobListing[] = [];
    const pattern = /<h2[^>]*class="[^"]*job-shortlist__title[^"]*"[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
    let m: RegExpExecArray | null;

    while ((m = pattern.exec(html)) !== null && jobs.length < limit) {
      const title = m[2].trim();
      const href = m[1].startsWith("http") ? m[1] : `https://www.vagas.com.br${m[1]}`;
      const snippet = html.slice(Math.max(0, m.index - 100), m.index + 800);
      const compMatch = snippet.match(/<span[^>]*class="[^"]*job-shortlist__company[^"]*"[^>]*>([^<]+)<\/span>/i);
      const locMatch = snippet.match(/<span[^>]*class="[^"]*job-shortlist__location[^"]*"[^>]*>([^<]+)<\/span>/i);

      jobs.push({
        title,
        company: compMatch ? compMatch[1].trim() : "Empresa confidencial",
        location: locMatch ? locMatch[1].trim() : "Brasil",
        url: href,
        source: "Vagas.com.br",
        description: `Vaga de ${title}`,
        matchReason: "",
        isReal: true,
      });
    }
    return jobs;
  } catch {
    return [];
  }
}

// ─── AI fallback — smart search links (not fake listings) ────────────────────

async function generateSmartSearchLinks(
  jobTitle: string,
  jobArea: string,
  keywords: string[],
  seniorityLevel: string,
): Promise<JobListing[]> {
  const prompt = `Especialista em recrutamento no Brasil. Gere 4 links de BUSCA reais para este perfil:

Cargo: ${jobTitle}
Área: ${jobArea}
Senioridade: ${seniorityLevel}
Keywords: ${keywords.slice(0, 5).join(", ")}

Use APENAS estes formatos de URL (substitua TERMO pelo cargo relevante):
- Gupy: https://portal.gupy.io/job-search/term=TERMO
- Vagas.com.br: https://www.vagas.com.br/vagas-de-TERMO-TERMO2
- Catho: https://www.catho.com.br/vagas/TERMO/
- InfoJobs: https://www.infojobs.com.br/empregos.aspx?palabra=TERMO

Use variações diferentes do cargo para diversificar resultados.

JSON:
{
  "jobs": [
    {
      "title": "SDR em Tecnologia — Gupy",
      "company": "Diversas empresas",
      "location": "Brasil",
      "url": "URL real",
      "source": "Gupy",
      "description": "O que essa busca encontra",
      "matchReason": "Compatibilidade com perfil"
    }
  ]
}`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: "Especialista em recrutamento. Responda APENAS JSON válido, sem texto fora do JSON." },
        { role: "user", content: prompt },
      ],
      maxTokens: 800,
      temperature: 0.1,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "search_links",
          strict: true,
          schema: {
            type: "object",
            properties: {
              jobs: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    company: { type: "string" },
                    location: { type: "string" },
                    url: { type: "string" },
                    source: { type: "string" },
                    description: { type: "string" },
                    matchReason: { type: "string" },
                  },
                  required: ["title", "company", "location", "url", "source", "description", "matchReason"],
                  additionalProperties: false,
                },
              },
            },
            required: ["jobs"],
            additionalProperties: false,
          },
        },
      },
    });

    const raw = response.choices[0]?.message?.content;
    if (!raw) return [];
    const parsed = JSON.parse(typeof raw === "string" ? raw : JSON.stringify(raw));
    return (parsed.jobs || []).map((j: JobListing) => ({ ...j, isReal: false }));
  } catch {
    return [];
  }
}

// ─── Match reason builder ─────────────────────────────────────────────────────

function buildMatchReason(job: JobListing, jobArea: string): string {
  const parts: string[] = [];

  if (job.applicantCount !== undefined) {
    if (job.applicantCount < 50)
      parts.push(`🟢 Baixa concorrência — ${job.applicantCount} candidatos`);
    else if (job.applicantCount < 150)
      parts.push(`🟡 ${job.applicantCount} candidatos`);
    else
      parts.push(`🔴 Alta disputa — ${job.applicantCount} candidatos`);
  }

  if (job.numVacancies && job.numVacancies > 1)
    parts.push(`${job.numVacancies} vagas abertas`);

  if (job.expiresAt) {
    try {
      const [d, mo, y] = job.expiresAt.split("/").map(Number);
      const expires = new Date(y, mo - 1, d);
      const daysLeft = Math.ceil((expires.getTime() - Date.now()) / 86400000);
      if (daysLeft >= 0 && daysLeft <= 5)
        parts.push(`⚠ Encerra em ${daysLeft}d`);
    } catch { /* ignore */ }
  }

  if (parts.length === 0) parts.push(`Compatível com perfil em ${jobArea}`);
  return parts.join(" · ");
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const jobsRouter = router({
  search: publicProcedure
    .input(z.object({
      jobTitle: z.string().min(2),
      jobArea: z.string().min(2),
      keywords: z.array(z.string()).max(15),
      location: z.string().default("Brasil"),
      seniorityLevel: z.string().default("Pleno"),
      workType: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { jobTitle, jobArea, keywords, location, seniorityLevel, workType } = input;

      // Location scoping:
      // - Remote jobs: search across all Brazil
      // - Presencial/Hybrid: use candidate city (passed as location from frontend)
      // - No preference: use candidate city with Brazil as fallback
      const isRemote = workType === "remoto";
      const searchLocation = isRemote ? "Brasil" : location;

      // ── 1. Real APIs in parallel ───────────────────────────────────────────
      const [gupyResult, vagasResult] = await Promise.allSettled([
        fetchGupyJobs(jobTitle, 6),
        fetchVagasJobs(jobTitle, 4),
      ]);

      const rawRealJobs: JobListing[] = [
        ...(gupyResult.status === "fulfilled" ? gupyResult.value : []),
        ...(vagasResult.status === "fulfilled" ? vagasResult.value : []),
      ];

      // Apply workType and location filtering on real jobs
      const realJobs = rawRealJobs
        .filter(job => {
          // If user selected a specific workType, filter Gupy jobs by workplaceType
          if (workType && workType !== "sem_preferencia" && job.isReal && job.workType) {
            const wt = job.workType.toLowerCase();
            if (workType === "remoto" && !wt.includes("remoto")) return false;
            if (workType === "hibrido" && !wt.includes("híbrido") && !wt.includes("hibrido")) return false;
            if (workType === "presencial" && !wt.includes("presencial") && !wt.includes("on-site")) return false;
          }
          // For presencial/hybrid: filter by city proximity (city name match as proxy for 40km)
          if ((workType === "presencial" || workType === "hibrido") && !isRemote) {
            if (job.isReal && searchLocation !== "Brasil" && job.location) {
              const city = searchLocation.split(",")[0].trim().toLowerCase();
              const jobCity = job.location.toLowerCase();
              // Allow if city name appears in job location, or if state matches (within region)
              const stateMatch = searchLocation.includes(",") &&
                jobCity.includes(searchLocation.split(",")[1]?.trim().toLowerCase() ?? "");
              if (!jobCity.includes(city) && !stateMatch) return false;
            }
          }
          return true;
        })
        .map(job => ({ ...job, matchReason: buildMatchReason(job, jobArea) }));

      // ── 2. LinkedIn parametrized URL (no scraping) ─────────────────────────
      const linkedInUrl = buildLinkedInSearchUrl({
        keywords: jobTitle,
        location: isRemote ? "Brazil" : (searchLocation !== "Brasil" ? searchLocation : "Brazil"),
        seniorityLevel,
        workType,
      });

      const linkedInEntry: JobListing = {
        title: `${jobTitle} — Busca LinkedIn`,
        company: "Múltiplas empresas",
        location: isRemote ? "Remoto · Brasil" : (searchLocation !== "Brasil" ? searchLocation : "Brasil"),
        url: linkedInUrl,
        source: "LinkedIn",
        description: isRemote
          ? "Link de busca LinkedIn com filtro remoto — vagas de todo o Brasil."
          : `Link de busca LinkedIn com filtros de cargo, localização (${searchLocation}) e senioridade.`,
        matchReason: `Filtros: última semana · ordenado por data${workType ? ` · ${workType}` : ""}`,
        isReal: false,
      };

      // ── 3. AI fallback for extra links if real results are sparse ──────────
      const aiLinks = realJobs.length < 3
        ? await generateSmartSearchLinks(jobTitle, jobArea, keywords, seniorityLevel)
        : await generateSmartSearchLinks(jobTitle, jobArea, keywords, seniorityLevel).then(r => r.slice(0, 2));

      // ── 4. Assemble + deduplicate + sort ───────────────────────────────────
      const all: JobListing[] = [
        ...realJobs,
        linkedInEntry,
        ...aiLinks,
      ];

      const seen = new Set<string>();
      const unique = all.filter(j => {
        const key = j.url.split("?")[0];
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      // Real jobs first, then LinkedIn, then AI links
      unique.sort((a, b) => {
        if (a.isReal && !b.isReal) return -1;
        if (!a.isReal && b.isReal) return 1;
        if (a.source === "LinkedIn") return -1;
        if (b.source === "LinkedIn") return 1;
        // Among real Gupy jobs, sort by fewer applicants (better odds)
        if (a.isReal && b.isReal && a.applicantCount !== undefined && b.applicantCount !== undefined)
          return a.applicantCount - b.applicantCount;
        return 0;
      });

      return {
        jobs: unique.slice(0, 10),
        searchQuery: jobTitle,
        totalFound: unique.length,
        realJobsFound: realJobs.length,
        linkedInUrl,
      };
    }),
});
