import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";

const AnalysisResultSchema = z.object({
  matchScore: z.number(),
  keywords: z.array(z.string()),
  suggestions: z.array(z.string()),
  optimizedResume: z.string(),
  changes: z.array(z.object({
    section: z.string(),
    description: z.string(),
    impact: z.enum(["alto", "medio", "baixo"]),
  })),
  projectedMatchScore: z.number(),
  scoreBreakdown: z.object({
    technicalSkills: z.number(),
    experience: z.number(),
    keywords: z.number(),
    tools: z.number(),
    seniority: z.number(),
  }),
  jobTitle: z.string(),
  jobArea: z.string(),
  coverLetterPoints: z.array(z.string()),
  gapAnalysis: z.array(z.string()),
});

export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;

async function scrapeJobUrl(url: string): Promise<string | null> {
  try {
    const urlObj = new URL(url);
    if (!urlObj.protocol.startsWith("http")) return null;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) return null;

    const html = await response.text();
    const cleaned = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
      .replace(/<header[\s\S]*?<\/header>/gi, " ")
      .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s{2,}/g, " ")
      .trim();

    return cleaned.slice(0, 6000);
  } catch {
    return null;
  }
}

function isUrl(input: string): boolean {
  try {
    const u = new URL(input.trim());
    return u.protocol.startsWith("http");
  } catch {
    return false;
  }
}

export const resumeRouter = router({
  analyze: publicProcedure
    .input(
      z.object({
        resumeText: z.string().min(50, "Curriculo muito curto"),
        jobUrl: z.string().min(10, "Informe o link ou descricao da vaga"),
      })
    )
    .mutation(async ({ input }) => {
      const { resumeText, jobUrl } = input;

      let jobContent = jobUrl.trim();
      let scrapedSuccessfully = false;

      if (isUrl(jobUrl.trim())) {
        const scraped = await scrapeJobUrl(jobUrl.trim());
        if (scraped && scraped.length > 200) {
          jobContent = scraped;
          scrapedSuccessfully = true;
        }
      }

      const systemPrompt = `Voce e uma Consultora Sênior de Recolocacao Profissional e Especialista em Curriculos certificada (CPRW - Certified Professional Resume Writer), com 20 anos de experiencia em:

- Elaboracao e otimizacao de curriculos para sistemas ATS (Applicant Tracking Systems: Workday, Taleo, Greenhouse, iCIMS, Lever, SAP SuccessFactors)
- Busca booleana avancada para sourcing de candidatos no LinkedIn Recruiter, Indeed, Gupy e bancos de talentos
- Recrutamento executivo e recolocacao de profissionais em transicao de carreira
- Analise de compatibilidade candidato-vaga com precisao cirurgica

== CONHECIMENTO TECNICO ATS (2026) ==

Como os sistemas ATS processam curriculos:
1. EXTRACAO: Converte PDF/DOCX em texto puro via OCR e NLP
2. SEGMENTACAO: Identifica blocos de texto como "Contato", "Experiencia", "Educacao" com base em cabecalhos padrao
3. PARSING: Extrai campos estruturados: Cargo, Empresa, Data Inicio, Data Fim, Descricao
4. RANKING: Calcula relevancia com base nos campos extraidos vs. descricao da vaga

O QUE QUEBRA O PARSING ATS (NUNCA USAR NO CURRICULO):
- Emojis e icones (ex: ✅ 🎯 📌 ★ ➢) — sao lidos como caracteres invalidos ou ignorados
- Asteriscos markdown (**texto**) — aparecem literalmente no texto extraido pelo ATS
- Sublinhado markdown (__texto__) — idem
- Tabelas e colunas multiplas — o parser pode misturar dados de colunas diferentes
- Caixas de texto flutuantes — ignoradas pelo parser
- Barras de progresso de habilidades (5/5 estrelas) — o ATS nao consegue ler graficos
- Fontes nao padrao ou customizadas — causam falhas de OCR
- Cabecalhos criativos ("Minha Jornada", "Onde Estive") — o ATS nao reconhece como secoes

ESTRUTURA IDEAL PARA ATS (baseada em pesquisa ResumeAdapter 2026 + PARWCC):
- Layout de coluna unica — nunca falha
- Cabeçalhos padrão em MAIÚSCULAS com acentuação CORRETA: RESUMO PROFISSIONAL, COMPETÊNCIAS PRINCIPAIS, EXPERIÊNCIA PROFISSIONAL, FORMAÇÃO ACADÊMICA, IDIOMAS, CERTIFICAÇÕES
- ATENÇÃO: palavras em maiúsculas DEVEM ter acentos corretos em português: EXPERIÊNCIA (não EXPERIENCIA), FORMAÇÃO (não FORMACAO), COMPETÊNCIAS (não COMPETENCIAS), CERTIFICAÇÕES (não CERTIFICACOES), ATUAÇÃO (não ATUACAO), GESTÃO (não GESTAO), INFORMAÇÕES (não INFORMACOES)
- Datas no formato: Mês/Ano (ex: Out/2023 – Atual, Mar/2021 – Set/2023)
- Bullets com traco simples (-) ou ponto (•) — nunca setas ou emojis
- Texto puro sem qualquer formatacao markdown

POSICIONAMENTO DE PALAVRAS-CHAVE (pesos no ATS):
- Resumo Profissional: PESO MAXIMO — palavras-chave aqui recebem 3x mais peso
- Titulo do Cargo: PESO ALTO — deve espelhar o titulo da vaga quando possivel
- Secao de Competencias: PESO ALTO — lista direta de habilidades tecnicas
- Descricoes de Experiencia: PESO MEDIO — contexto e realizacoes com keywords
- Educacao/Certificacoes: PESO BAIXO — apenas confirma qualificacoes basicas

TECNICA DE BUSCA BOOLEANA APLICADA AO CURRICULO:
Voce pensa como um recrutador fazendo busca booleana:
- Identifica os termos EXATOS que o recrutador vai buscar no LinkedIn/ATS
- Garante que esses termos aparecam naturalmente no curriculo
- Usa sinonimos e variacoes: ex: "Gestao de Pipeline" E "Pipeline Management"
- Inclui tanto acronimos quanto por extenso: ex: "CRM (Customer Relationship Management)"
- Posiciona keywords nas primeiras linhas de cada secao (maior peso no ATS)
- Usa verbos de acao fortes no passado para experiencias anteriores e presente para atual

== LEI ABSOLUTA — NUNCA VIOLAR ==

PROIBIDO ABSOLUTO — se voce violar qualquer uma dessas regras, o resultado e invalido:
1. NUNCA altere datas, periodos, anos ou meses de qualquer experiencia profissional
2. NUNCA altere nomes de empresas onde o candidato trabalhou
3. NUNCA altere cargos/titulos que o candidato ocupou
4. NUNCA invente habilidades, ferramentas, certificacoes ou conquistas que nao estao no curriculo
5. NUNCA "corrija" informacoes do candidato — se esta escrito "Out/2025 – Atual", mantenha exatamente assim
6. NUNCA assuma que algo e "erro de digitacao" — o candidato conhece sua propria historia
7. NUNCA use emojis, icones ou simbolos especiais no curriculo otimizado
8. NUNCA use asteriscos (**), sublinhados (__) ou qualquer formatacao markdown no texto do curriculo
9. NUNCA use tabelas, colunas ou estruturas complexas de formatacao

O QUE VOCE PODE E DEVE FAZER:
- Reescrever bullets de experiencia com palavras-chave da vaga (mantendo os fatos)
- Reorganizar secoes para destacar o mais relevante para a vaga
- Adicionar palavras-chave ATS no resumo profissional e nas descricoes de cargo
- Melhorar a linguagem para ser mais impactante e compativel com o que recrutadores buscam
- Identificar habilidades latentes no curriculo que o candidato nao destacou
- Incluir sinonimos e variacoes de termos tecnicos para ampliar a captura pelo ATS
- Usar verbos de acao fortes: Liderou, Implementou, Desenvolveu, Aumentou, Reduziu, Gerou

== REGRAS DE PONTUACAO — SEJA RIGOROSO E HONESTO ==

scoreBreakdown (total maximo = 100):

technicalSkills (0-30): Habilidades tecnicas que o candidato REALMENTE TEM vs. o que a vaga PEDE
- 25-30: 80%+ das habilidades tecnicas exigidas estao no curriculo
- 15-24: 50-79% das habilidades tecnicas estao presentes
- 5-14: 20-49% das habilidades tecnicas estao presentes
- 0-4: Menos de 20% — area completamente diferente

experience (0-30): Experiencia profissional RELEVANTE para a funcao
- 25-30: Experiencia direta na mesma area/funcao
- 15-24: Area relacionada com transferencia clara de competencias
- 5-14: Experiencia parcialmente relacionada, com gaps significativos
- 0-4: Area completamente diferente, sem transferencia relevante

keywords (0-20): Palavras-chave da vaga LITERALMENTE presentes no curriculo
- Conte de forma rigorosa — termos tecnicos especificos valem mais
- "Vendas B2B" e "Desenvolvedor de Chatbot" sao universos diferentes

tools (0-10): Ferramentas/softwares/tecnologias pedidas na vaga que o candidato usa
- Se a vaga pede Python/Node.js e o candidato nao tem: 0-1 pontos
- Se a vaga pede Salesforce e o candidato usa Salesforce: 7-10 pontos

seniority (0-10): Compatibilidade de nivel de senioridade e anos de experiencia

CALIBRACAO DE REFERENCIA:
- Profissional de vendas B2B vs. desenvolvedor de software: 5-15%
- Profissional de vendas B2B vs. gerente de vendas B2B: 75-95%
- Profissional de RH vs. recrutamento: 60-85%
- Profissional de vendas vs. marketing digital: 30-50%
- Headhunter/Recruiter vs. Talent Acquisition: 70-90%

== FORMATO OBRIGATORIO DO CURRICULO OTIMIZADO ==

Use \\n para quebras de linha simples e \\n\\n para separar secoes.
TEXTO PURO APENAS — sem asteriscos, sem emojis, sem markdown, sem icones.

Estrutura obrigatoria:
[Nome Completo]
[Cargo Atual/Titulo Profissional] | [Cidade, Estado - Pais]
[Telefone] | [Email] | [LinkedIn]

RESUMO PROFISSIONAL
[Parágrafo de 3-5 linhas com palavras-chave ATS da vaga, descrevendo o perfil do candidato com base nas informações reais do currículo]

COMPETÊNCIAS PRINCIPAIS

[ÁREA 1 COM ACENTUAÇÃO CORRETA]
- Competência 1
- Competência 2
- Competência 3

[ÁREA 2 COM ACENTUAÇÃO CORRETA]
- Competência 1
- Competência 2

EXPERIÊNCIA PROFISSIONAL

[Cargo] | [Empresa] | [Período EXATO DO CURRÍCULO ORIGINAL]
- Realização 1 com palavras-chave ATS
- Realização 2 com métricas e impacto
- Realização 3

[Cargo] | [Empresa] | [Período EXATO DO CURRÍCULO ORIGINAL]
- Realização 1
- Realização 2

FORMAÇÃO ACADÊMICA
[Curso] | [Instituição] | [Ano]

IDIOMAS
[Idioma]: [Nível]

IMPORTANTE: Preserve EXATAMENTE os períodos, datas, nomes de empresas e cargos do currículo original.
NUNCA use emojis, asteriscos ou qualquer símbolo especial no texto do currículo.
USE SEMPRE acentuação correta em português, inclusive em palavras MAIÚSCULAS: EXPERIÊNCIA, FORMAÇÃO, COMPETÊNCIAS, CERTIFICAÇÕES, GESTÃO, ATUAÇÃO, INFORMAÇÕES, ATENÇÃO, etc.

Responda APENAS com JSON valido, sem markdown, sem texto fora do JSON.`;

      const userMessage = `CURRICULO ORIGINAL DO CANDIDATO (preserve todos os dados exatamente como estao):
${resumeText}

---

VAGA${scrapedSuccessfully ? " (conteudo extraido automaticamente do site)" : " (link/descricao fornecida pelo candidato)"}:
${jobContent}

---

INSTRUCOES FINAIS:

1. Analise a compatibilidade REAL entre o curriculo e a vaga com maxima honestidade
2. Gere o curriculo otimizado mantendo TODOS os dados originais (datas, empresas, cargos) intactos
3. Apenas reescreva bullets e resumo com palavras-chave ATS da vaga
4. Se a compatibilidade for baixa, seja honesto nas sugestoes e explique o que falta
5. No campo "changes", descreva APENAS o que voce realmente alterou no texto
6. NUNCA use emojis, asteriscos (**), sublinhados (__) ou qualquer formatacao markdown no campo "optimizedResume"
7. Use APENAS texto puro com \\n para quebras de linha no campo "optimizedResume"

Retorne JSON com esta estrutura exata:
{
  "matchScore": <numero 0-100 — score ORIGINAL antes da otimizacao, calculado como soma do scoreBreakdown>,
  "projectedMatchScore": <numero 0-100 — score PROJETADO apos as otimizacoes. REGRA ABSOLUTA: projectedMatchScore DEVE SER SEMPRE MAIOR OU IGUAL ao matchScore. A otimizacao do curriculo so pode melhorar o score, NUNCA piorar. Calcule o ganho realista que as palavras-chave adicionadas e a reorganizacao trariam>,
  "jobTitle": "<titulo/cargo da vaga>",
  "jobArea": "<area profissional: Tecnologia, Vendas, RH, Marketing, Financas, etc.>",
  "keywords": [<8-12 palavras-chave mais importantes da vaga para ATS>],
  "suggestions": [<4-8 sugestoes especificas, honestas e acionaveis>],
  "changes": [
    {
      "section": "<secao alterada>",
      "description": "<o que exatamente foi alterado e por que — seja especifico>",
      "impact": "<alto | medio | baixo>"
    }
  ],
  "optimizedResume": "<curriculo completo otimizado — TEXTO PURO com \\n para quebras de linha — SEM emojis, SEM asteriscos, SEM markdown — preservando TODOS os dados originais>",
  "coverLetterPoints": ["<ponto 1 para carta de apresentacao — argumento especifico baseado no curriculo real>", "<ponto 2>", "<ponto 3>"],
  "gapAnalysis": ["<gap 1 — habilidade ou experiencia que a vaga exige mas o candidato nao tem>", "<gap 2>"],
  "scoreBreakdown": {
    "technicalSkills": <0-30>,
    "experience": <0-30>,
    "keywords": <0-20>,
    "tools": <0-10>,
    "seniority": <0-10>
  }
}

LEMBRETE CRITICO: 
- O campo "optimizedResume" deve ser TEXTO PURO sem nenhum caracter especial de formatacao
- Datas, empresas e cargos devem ser IDENTICOS ao curriculo original
- Nenhum emoji ou icone em nenhum campo do JSON
- projectedMatchScore DEVE SER OBRIGATORIAMENTE >= matchScore (a otimizacao NUNCA piora o score, apenas melhora ou mantem)
- "coverLetterPoints": 3 pontos especificos e personalizados para usar em carta de apresentacao, baseados no curriculo real do candidato e nos requisitos da vaga
- "gapAnalysis": lista honesta dos gaps reais entre o perfil do candidato e a vaga (pode ser lista vazia [] se compatibilidade for alta)`;

      const response = await invokeLLM({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "resume_analysis",
            strict: true,
            schema: {
              type: "object",
              properties: {
                matchScore: { type: "number" },
                projectedMatchScore: { type: "number" },
                jobTitle: { type: "string" },
                jobArea: { type: "string" },
                keywords: { type: "array", items: { type: "string" } },
                suggestions: { type: "array", items: { type: "string" } },
                changes: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      section: { type: "string" },
                      description: { type: "string" },
                      impact: { type: "string", enum: ["alto", "medio", "baixo"] },
                    },
                    required: ["section", "description", "impact"],
                    additionalProperties: false,
                  },
                },
                optimizedResume: { type: "string" },
                coverLetterPoints: { type: "array", items: { type: "string" } },
                gapAnalysis: { type: "array", items: { type: "string" } },
                scoreBreakdown: {
                  type: "object",
                  properties: {
                    technicalSkills: { type: "number" },
                    experience: { type: "number" },
                    keywords: { type: "number" },
                    tools: { type: "number" },
                    seniority: { type: "number" },
                  },
                  required: ["technicalSkills", "experience", "keywords", "tools", "seniority"],
                  additionalProperties: false,
                },
              },
              required: ["matchScore", "projectedMatchScore", "jobTitle", "jobArea", "keywords", "suggestions", "changes", "optimizedResume", "coverLetterPoints", "gapAnalysis", "scoreBreakdown"],
              additionalProperties: false,
            },
          },
        },
      });

      const rawContent = response.choices[0]?.message?.content;
      if (!rawContent) throw new Error("Resposta vazia da IA. Tente novamente.");
      const content = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);

      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        throw new Error("Erro ao processar resposta da IA. Tente novamente.");
      }

      const validated = AnalysisResultSchema.parse(parsed);

      // Sanitiza o curriculo otimizado: remove emojis, asteriscos, markdown e corrige acentuacao em maiusculas
      const sanitizeResume = (text: string): string => {
        // Mapa de correcao de palavras comuns em maiusculas sem acento -> com acento correto em portugues
        const accentFixes: Array<[RegExp, string]> = [
          // Cabecalhos de secao mais comuns
          [/\bEXPERIENCIA\b/g, "EXPERIÊNCIA"],
          [/\bFORMACAO\b/g, "FORMAÇÃO"],
          [/\bCOMPETENCIAS\b/g, "COMPETÊNCIAS"],
          [/\bCERTIFICACAO\b/g, "CERTIFICAÇÃO"],
          [/\bCERTIFICACAOES\b/g, "CERTIFICAÇÕES"],
          [/\bCERTIFICACOES\b/g, "CERTIFICAÇÕES"],
          [/\bINFORMACAO\b/g, "INFORMAÇÃO"],
          [/\bINFORMACOES\b/g, "INFORMAÇÕES"],
          [/\bATUACAO\b/g, "ATUAÇÃO"],
          [/\bGESTAO\b/g, "GESTÃO"],
          [/\bADMINISTRACAO\b/g, "ADMINISTRAÇÃO"],
          [/\bCOMUNICACAO\b/g, "COMUNICAÇÃO"],
          [/\bNEGOCIACAO\b/g, "NEGOCIAÇÃO"],
          [/\bAVALIACAO\b/g, "AVALIAÇÃO"],
          [/\bPLANEJAMENTO\b/g, "PLANEJAMENTO"], // ja correto
          [/\bCOORDENACAO\b/g, "COORDENAÇÃO"],
          [/\bIMPLEMENTACAO\b/g, "IMPLEMENTAÇÃO"],
          [/\bCOMERCIALIZACAO\b/g, "COMERCIALIZAÇÃO"],
          [/\bINTEGRACAO\b/g, "INTEGRAÇÃO"],
          [/\bPROSPECAO\b/g, "PROSPECÇÃO"],
          [/\bPROSPECCAO\b/g, "PROSPECÇÃO"],
          [/\bFUNCAO\b/g, "FUNÇÃO"],
          [/\bRELACAO\b/g, "RELAÇÃO"],
          [/\bRELACOES\b/g, "RELAÇÕES"],
          [/\bSOLUCAO\b/g, "SOLUÇÃO"],
          [/\bSOLUCOES\b/g, "SOLUÇÕES"],
          [/\bPOSICAO\b/g, "POSIÇÃO"],
          [/\bOPERACAO\b/g, "OPERAÇÃO"],
          [/\bOPERACOES\b/g, "OPERAÇÕES"],
          [/\bCAPACITACAO\b/g, "CAPACITAÇÃO"],
          [/\bFORMATACAO\b/g, "FORMATAÇÃO"],
          [/\bCONTRATACAO\b/g, "CONTRATAÇÃO"],
          [/\bPRESENTACAO\b/g, "APRESENTAÇÃO"],
          [/\bAPRESENTACAO\b/g, "APRESENTAÇÃO"],
          [/\bADAPTACAO\b/g, "ADAPTAÇÃO"],
          [/\bPRODUCAO\b/g, "PRODUÇÃO"],
          [/\bCONSERVACAO\b/g, "CONSERVAÇÃO"],
          [/\bCONSTRUCAO\b/g, "CONSTRUÇÃO"],
          [/\bREDUCAO\b/g, "REDUÇÃO"],
          [/\bEXECUCAO\b/g, "EXECUÇÃO"],
          [/\bCONTRIBUICAO\b/g, "CONTRIBUIÇÃO"],
          [/\bCONTRIBUICOES\b/g, "CONTRIBUIÇÕES"],
          [/\bINSTITUICAO\b/g, "INSTITUIÇÃO"],
          [/\bINSTITUICOES\b/g, "INSTITUIÇÕES"],
          [/\bGERACAO\b/g, "GERAÇÃO"],
          [/\bCRIACAO\b/g, "CRIAÇÃO"],
          [/\bACAO\b/g, "AÇÃO"],
          [/\bACAOES\b/g, "AÇÕES"],
          [/\bACOES\b/g, "AÇÕES"],
          [/\bCONEXAO\b/g, "CONEXÃO"],
          [/\bCONEXOES\b/g, "CONEXÕES"],
          [/\bAMPLIACAO\b/g, "AMPLIAÇÃO"],
          [/\bPARTICIPACAO\b/g, "PARTICIPAÇÃO"],
          [/\bGERENCIAMENTO\b/g, "GERENCIAMENTO"], // ja correto
          // Outras palavras comuns sem acento
          [/\bACADEMICA\b/g, "ACADÊMICA"],
          [/\bACADEMICO\b/g, "ACADÊMICO"],
          [/\bTECNICA\b/g, "TÉCNICA"],
          [/\bTECNICO\b/g, "TÉCNICO"],
          [/\bTECNICAS\b/g, "TÉCNICAS"],
          [/\bTECNICOS\b/g, "TÉCNICOS"],
          [/\bESTRATEGICA\b/g, "ESTRATÉGICA"],
          [/\bESTRATEGICO\b/g, "ESTRATÉGICO"],
          [/\bANALISE\b/g, "ANÁLISE"],
          [/\bANALISES\b/g, "ANÁLISES"],
          [/\bCOMERCIAL\b/g, "COMERCIAL"], // ja correto
          [/\bVENDAS\b/g, "VENDAS"], // ja correto
          [/\bIDIOMAS\b/g, "IDIOMAS"], // ja correto
          [/\bPROFISSIONAL\b/g, "PROFISSIONAL"], // ja correto
          [/\bPRINCIPAIS\b/g, "PRINCIPAIS"], // ja correto
          [/\bHABILIDADES\b/g, "HABILIDADES"], // ja correto
          [/\bCURRICULO\b/g, "CURRÍCULO"],
          [/\bPERIODO\b/g, "PERÍODO"],
          [/\bPERIODOS\b/g, "PERÍODOS"],
          [/\bEDUCACAO\b/g, "EDUCAÇÃO"],
          [/\bCONHECIMENTO\b/g, "CONHECIMENTO"], // ja correto
          [/\bCONHECIMENTOS\b/g, "CONHECIMENTOS"], // ja correto
          [/\bCOMERCIO\b/g, "COMÉRCIO"],
          [/\bNEGOCIOS\b/g, "NEGÓCIOS"],
          [/\bSERVICO\b/g, "SERVIÇO"],
          [/\bSERVICOS\b/g, "SERVIÇOS"],
          [/\bCLIENTE\b/g, "CLIENTE"], // ja correto
          [/\bCLIENTES\b/g, "CLIENTES"], // ja correto
          [/\bMERCADO\b/g, "MERCADO"], // ja correto
          [/\bPROJETO\b/g, "PROJETO"], // ja correto
          [/\bPROJETOS\b/g, "PROJETOS"], // ja correto
          [/\bDESENVOLVIMENTO\b/g, "DESENVOLVIMENTO"], // ja correto
          [/\bCOMUNIDADE\b/g, "COMUNIDADE"], // ja correto
          [/\bLIDERANCA\b/g, "LIDERANÇA"],
          [/\bLIDERANCAS\b/g, "LIDERANÇAS"],
          [/\bCOMPETENCIA\b/g, "COMPETÊNCIA"],
          [/\bEXCELENCIA\b/g, "EXCELÊNCIA"],
          [/\bEXPERIENCE\b/g, "EXPERIENCE"], // ingles - ja correto
          [/\bCONFIGURACAO\b/g, "CONFIGURAÇÃO"],
          [/\bCONFIGURACOES\b/g, "CONFIGURAÇÕES"],
          [/\bCOMUNICACAO\b/g, "COMUNICAÇÃO"],
          [/\bCOMUNICACOES\b/g, "COMUNICAÇÕES"],
          [/\bADMINISTRACAO\b/g, "ADMINISTRAÇÃO"],
          [/\bADMINISTRATIVA\b/g, "ADMINISTRATIVA"], // ja correto
          [/\bADMINISTRATIVO\b/g, "ADMINISTRATIVO"], // ja correto
          [/\bGESTOR\b/g, "GESTOR"], // ja correto
          [/\bGESTORA\b/g, "GESTORA"], // ja correto
          [/\bCONSULTOR\b/g, "CONSULTOR"], // ja correto
          [/\bCONSULTORA\b/g, "CONSULTORA"], // ja correto
          [/\bDIRECAO\b/g, "DIREÇÃO"],
          [/\bDIRECOES\b/g, "DIREÇÕES"],
          [/\bCONTRIBUICAO\b/g, "CONTRIBUIÇÃO"],
          [/\bCONTRIBUICOES\b/g, "CONTRIBUIÇÕES"],
          [/\bSELECAO\b/g, "SELEÇÃO"],
          [/\bSELECOES\b/g, "SELEÇÕES"],
          [/\bCOMERCIALIZACAO\b/g, "COMERCIALIZAÇÃO"],
          [/\bNEGOCIACAO\b/g, "NEGOCIAÇÃO"],
          [/\bNEGOCIACOES\b/g, "NEGOCIAÇÕES"],
          [/\bEVOLUCAO\b/g, "EVOLUÇÃO"],
          [/\bEVOLUCOES\b/g, "EVOLUÇÕES"],
          [/\bREVISAO\b/g, "REVISÃO"],
          [/\bREVISOES\b/g, "REVISÕES"],
          [/\bPROGRAMACAO\b/g, "PROGRAMAÇÃO"],
          [/\bCOMUNICACAO\b/g, "COMUNICAÇÃO"],
          [/\bDECISAO\b/g, "DECISÃO"],
          [/\bDECISOES\b/g, "DECISÕES"],
          [/\bDECISAO\b/g, "DECISÃO"],
          [/\bCONVERSAO\b/g, "CONVERSÃO"],
          [/\bCONVERSOES\b/g, "CONVERSÕES"],
          [/\bCOMERCIAL\b/g, "COMERCIAL"], // ja correto
        ];

        let result = text
          // Remove emojis usando ranges de code points
          .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, "") // surrogate pairs (emojis)
          .replace(/[\u2600-\u27BF]/g, "") // misc symbols
          .replace(/[\uFE00-\uFE0F]/g, "") // variation selectors
          // Remove asteriscos de markdown bold/italic
          .replace(/\*\*([^*]+)\*\*/g, "$1")
          .replace(/\*([^*]+)\*/g, "$1")
          .replace(/__([^_]+)__/g, "$1")
          .replace(/_([^_]+)_/g, "$1")
          // Remove hashtags de markdown heading
          .replace(/^#{1,6}\s+/gm, "")
          // Remove backticks
          .replace(/`([^`]+)`/g, "$1")
          // Remove caracteres de controle exceto newlines e tabs
          .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
          // Normaliza multiplas linhas em branco (max 2)
          .replace(/\n{3,}/g, "\n\n")
          .trim();

        // Aplica correcoes de acentuacao em palavras maiusculas
        for (const [pattern, replacement] of accentFixes) {
          result = result.replace(pattern, replacement);
        }

        return result;
      };

      const computedScore =
        validated.scoreBreakdown.technicalSkills +
        validated.scoreBreakdown.experience +
        validated.scoreBreakdown.keywords +
        validated.scoreBreakdown.tools +
        validated.scoreBreakdown.seniority;

      const finalMatchScore = Math.min(100, Math.max(0, computedScore));

      // Garantir que o projectedMatchScore NUNCA seja menor que o matchScore original
      // A otimização só pode melhorar ou manter o score, nunca piorar
      let finalProjectedScore = Math.min(100, Math.max(0, validated.projectedMatchScore));
      if (finalProjectedScore < finalMatchScore) {
        // Se a IA retornou um valor menor, corrige para ser pelo menos o score original + ganho mínimo
        const minGain = Math.min(5, 100 - finalMatchScore); // ganho mínimo de 5pts ou o que faltar para 100
        finalProjectedScore = Math.min(100, finalMatchScore + minGain);
      }

      return {
        ...validated,
        optimizedResume: sanitizeResume(validated.optimizedResume),
        matchScore: finalMatchScore,
        projectedMatchScore: finalProjectedScore,
        scrapedJob: scrapedSuccessfully,
      };
    }),

  generateFromScratch: publicProcedure
    .input(
      z.object({
        wizardData: z.object({
          name: z.string(),
          title: z.string(),
          city: z.string(),
          phone: z.string(),
          email: z.string(),
          linkedin: z.string(),
          summary: z.string(),
          experiences: z.array(z.object({
            role: z.string(),
            company: z.string(),
            period: z.string(),
            description: z.string(),
          })),
          education: z.array(z.object({
            course: z.string(),
            institution: z.string(),
            year: z.string(),
          })),
          skills: z.string(),
          languages: z.string(),
          certifications: z.string(),
        }),
      })
    )
    .mutation(async ({ input }) => {
      const d = input.wizardData;

      const systemPrompt = `Voce e uma consultora senior de carreira certificada (CPRW) e especialista em recolocacao profissional com 20 anos de experiencia.

Sua tarefa e criar um curriculo profissional completo, otimizado para ATS, usando APENAS as informacoes fornecidas.

REGRAS ABSOLUTAS:
1. Use APENAS as informacoes fornecidas. NUNCA invente dados, datas, empresas ou habilidades.
2. Transforme descricoes informais em bullets profissionais com verbos de acao fortes.
3. O curriculo deve ser TEXTO PURO com quebras de linha reais.
4. PROIBIDO: emojis, asteriscos, markdown, hashtags, tabelas.
5. Estrutura: Nome > Titulo > Contato > Resumo Profissional > Competencias > Experiencia > Formacao > Idiomas > Certificacoes.
6. Use verbos de acao: Liderou, Implementou, Desenvolveu, Aumentou, Gerenciou, Negociou, Conquistou.
7. Quantifique resultados quando o usuario mencionar numeros.
8. Retorne APENAS o texto do curriculo, sem JSON, sem explicacoes adicionais.`;

      const expLines = d.experiences
        .filter(e => e.role)
        .map(e => `${e.role} | ${e.company} | ${e.period}\n${e.description}`)
        .join("\n\n");

      const eduLines = d.education
        .filter(e => e.course)
        .map(e => `${e.course} - ${e.institution}${e.year ? ` (${e.year})` : ""}`)
        .join("\n");

      const userMessage = `Crie um curriculo profissional com estas informacoes:\n\nNOME: ${d.name}\nTITULO: ${d.title}\nCIDADE: ${d.city}\nTELEFONE: ${d.phone}\nEMAIL: ${d.email}\nLINKEDIN: ${d.linkedin}\n\nRESUMO (informal): ${d.summary}\n\nEXPERIENCIAS:\n${expLines}\n\nFORMACAO:\n${eduLines}\n\nHABILIDADES: ${d.skills}\nIDIOMAS: ${d.languages}\nCERTIFICACAO: ${d.certifications}`;

      const response = await invokeLLM({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
      });

      const rawContent = response.choices[0]?.message?.content;
      if (!rawContent) throw new Error("Resposta vazia da IA. Tente novamente.");
      const content = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);

      const sanitized = content
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .replace(/\*([^*]+)\*/g, "$1")
        .replace(/^#{1,6}\s+/gm, "")
        .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, "")
        .replace(/[\u2600-\u27BF]/g, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

      return { generatedResume: sanitized };
    }),
});
