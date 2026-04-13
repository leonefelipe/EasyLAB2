import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";

export interface JobListing {
  title: string;
  company: string;
  location: string;
  url: string;
  source: string;
  description: string;
  matchReason: string;
}

/**
 * Busca vagas reais do Brasil em múltiplos sites de emprego.
 * Usa scraping das páginas de busca públicas e IA para filtrar relevância.
 */
async function fetchJobsFromSource(
  source: "gupy" | "vagas" | "linkedin" | "catho" | "infojobs",
  query: string,
  location: string = "Brasil"
): Promise<{ title: string; company: string; location: string; url: string; source: string; description: string }[]> {
  const encodedQuery = encodeURIComponent(query);
  const encodedLocation = encodeURIComponent(location);

  const urls: Record<string, string> = {
    gupy: `https://portal.gupy.io/job-search/term=${encodedQuery}`,
    vagas: `https://www.vagas.com.br/vagas-de-${encodedQuery.replace(/%20/g, "-")}`,
    linkedin: `https://www.linkedin.com/jobs/search/?keywords=${encodedQuery}&location=${encodedLocation}&f_TPR=r604800`,
    catho: `https://www.catho.com.br/vagas/${encodedQuery.replace(/%20/g, "-")}/`,
    infojobs: `https://www.infojobs.com.br/empregos.aspx?palabra=${encodedQuery}`,
  };

  const sourceNames: Record<string, string> = {
    gupy: "Gupy",
    vagas: "Vagas.com.br",
    linkedin: "LinkedIn",
    catho: "Catho",
    infojobs: "InfoJobs",
  };

  try {
    const response = await fetch(urls[source], {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        "Cache-Control": "no-cache",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) return [];

    const html = await response.text();

    // Extrai links e títulos de vagas do HTML usando regex simples
    const jobs: { title: string; company: string; location: string; url: string; source: string; description: string }[] = [];

    // Padrões para diferentes sites
    const execAll = (regex: RegExp, text: string, limit: number, cb: (m: RegExpExecArray) => void) => {
      let m: RegExpExecArray | null;
      let count = 0;
      while ((m = regex.exec(text)) !== null && count < limit) {
        cb(m);
        count++;
      }
    };

    if (source === "gupy") {
      execAll(/"jobName":"([^"]+)","companyName":"([^"]+)"/g, html, 5, (match) => {
        jobs.push({
          title: match[1],
          company: match[2],
          location: "Brasil",
          url: `https://portal.gupy.io/job-search/term=${encodedQuery}`,
          source: sourceNames[source],
          description: `Vaga de ${match[1]} na empresa ${match[2]}`,
        });
      });
    } else if (source === "vagas") {
      execAll(/<h2[^>]*class="[^"]*job-shortlist__title[^"]*"[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/gi, html, 5, (match) => {
        const companyMatch = html.match(/<span[^>]*class="[^"]*job-shortlist__company[^"]*"[^>]*>([^<]+)<\/span>/i);
        jobs.push({
          title: match[2].trim(),
          company: companyMatch ? companyMatch[1].trim() : "Empresa confidencial",
          location: "Brasil",
          url: match[1].startsWith("http") ? match[1] : `https://www.vagas.com.br${match[1]}`,
          source: sourceNames[source],
          description: `Vaga de ${match[2].trim()}`,
        });
      });
    } else if (source === "linkedin") {
      execAll(/<a[^>]*class="[^"]*base-card__full-link[^"]*"[^>]*href="([^"]+)"[^>]*>\s*<span[^>]*>([^<]+)<\/span>/gi, html, 5, (match) => {
        jobs.push({
          title: match[2].trim(),
          company: "Ver no LinkedIn",
          location: location,
          url: match[1].split("?")[0],
          source: sourceNames[source],
          description: `Vaga de ${match[2].trim()} no LinkedIn`,
        });
      });
    } else if (source === "catho") {
      execAll(/<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/gi, html, 5, (match) => {
        const title = match[2].trim();
        if (title.length > 5 && title.length < 100) {
          jobs.push({
            title,
            company: "Ver na Catho",
            location: "Brasil",
            url: match[1].startsWith("http") ? match[1] : `https://www.catho.com.br${match[1]}`,
            source: sourceNames[source],
            description: `Vaga de ${title} na Catho`,
          });
        }
      });
    } else if (source === "infojobs") {
      execAll(/<a[^>]*class="[^"]*js_o[^"]*"[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/gi, html, 5, (match) => {
        const title = match[2].trim();
        if (title.length > 5 && title.length < 100) {
          jobs.push({
            title,
            company: "Ver no InfoJobs",
            location: "Brasil",
            url: match[1].startsWith("http") ? match[1] : `https://www.infojobs.com.br${match[1]}`,
            source: sourceNames[source],
            description: `Vaga de ${title} no InfoJobs`,
          });
        }
      });
    }

    return jobs;
  } catch {
    return [];
  }
}

/**
 * Usa IA para gerar vagas simuladas realistas quando o scraping não retorna resultados.
 * Baseado no perfil do candidato e área de atuação.
 */
async function generateRealisticJobSuggestions(
  jobTitle: string,
  jobArea: string,
  keywords: string[]
): Promise<JobListing[]> {
  const prompt = `Você é um especialista em recrutamento brasileiro. Com base no perfil abaixo, gere 6 sugestões de vagas REAIS e REALISTAS que existem no mercado brasileiro, com links de busca reais nos principais sites de emprego.

Perfil do candidato:
- Cargo buscado: ${jobTitle}
- Área: ${jobArea}
- Palavras-chave do perfil: ${keywords.slice(0, 8).join(", ")}

Gere vagas com links de busca reais nos seguintes sites:
- Gupy: https://portal.gupy.io/job-search/term=TERMO
- LinkedIn: https://www.linkedin.com/jobs/search/?keywords=TERMO&location=Brasil
- Vagas.com.br: https://www.vagas.com.br/vagas-de-TERMO
- Catho: https://www.catho.com.br/vagas/TERMO/
- InfoJobs: https://www.infojobs.com.br/empregos.aspx?palabra=TERMO
- Pandapé: https://pandape.com.br/vagas?q=TERMO

Substitua TERMO pelo cargo/função relevante. Use variações do cargo para diversificar.

Retorne JSON:
{
  "jobs": [
    {
      "title": "título exato da vaga",
      "company": "nome da empresa ou 'Diversas empresas'",
      "location": "cidade ou 'Remoto' ou 'Híbrido - São Paulo'",
      "url": "link de busca real no site",
      "source": "nome do site (Gupy, LinkedIn, etc.)",
      "description": "breve descrição do que a vaga busca (1-2 frases)",
      "matchReason": "por que essa vaga é compatível com o perfil do candidato (1 frase)"
    }
  ]
}`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: "Você é um especialista em recrutamento brasileiro. Gere sugestões de vagas reais e relevantes." },
        { role: "user", content: prompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "job_suggestions",
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

    const rawContent = response.choices[0]?.message?.content;
    if (!rawContent) return [];
    const parsed = JSON.parse(typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent));
    return parsed.jobs || [];
  } catch {
    return [];
  }
}

export const jobsRouter = router({
  search: publicProcedure
    .input(z.object({
      jobTitle: z.string().min(2),
      jobArea: z.string().min(2),
      keywords: z.array(z.string()).max(15),
      location: z.string().default("Brasil"),
    }))
    .mutation(async ({ input }) => {
      const { jobTitle, jobArea, keywords, location } = input;

      // Monta query de busca baseada no título e palavras-chave
      const searchQuery = jobTitle.length > 3 ? jobTitle : keywords.slice(0, 3).join(" ");

      // Tenta scraping em paralelo de múltiplos sites
      const [gupyJobs, vagasJobs, linkedinJobs] = await Promise.allSettled([
        fetchJobsFromSource("gupy", searchQuery, location),
        fetchJobsFromSource("vagas", searchQuery, location),
        fetchJobsFromSource("linkedin", searchQuery, location),
      ]);

      const scrapedJobs: JobListing[] = [
        ...(gupyJobs.status === "fulfilled" ? gupyJobs.value : []),
        ...(vagasJobs.status === "fulfilled" ? vagasJobs.value : []),
        ...(linkedinJobs.status === "fulfilled" ? linkedinJobs.value : []),
      ].map(j => ({ ...j, matchReason: `Compatível com seu perfil em ${jobArea}` }));

      // Sempre usa IA para gerar sugestões de qualidade com links reais
      const aiJobs = await generateRealisticJobSuggestions(jobTitle, jobArea, keywords);

      // Combina: prioriza scraped (se houver), complementa com IA
      const allJobs = [...scrapedJobs, ...aiJobs];

      // Remove duplicatas por URL e limita a 8 vagas
      const seen = new Set<string>();
      const uniqueJobs = allJobs.filter(j => {
        const key = j.url.split("?")[0];
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).slice(0, 8);

      return {
        jobs: uniqueJobs,
        searchQuery,
        totalFound: uniqueJobs.length,
      };
    }),
});
