# PROJECT_MAP.md

Mapa de arquitetura do EasyLAB2 — leitura obrigatória antes de qualquer edição por IA.

---

## Propósito do produto

EasyLAB2 é o sistema interno da **Leone Consultoria de Carreira** (Felipe Leone, ex-Headhunter Robert Half).
É ao mesmo tempo:

1. **CRM** — gerencia clientes, projetos e pipeline de atendimento.
2. **Motor de IA** — analisa e otimiza CVs e perfis LinkedIn para clientes pagantes.

Público-alvo: profissionais brasileiros que o Felipe prospecta via LinkedIn e que pagam entre
R$250 e R$750 pelos serviços de consultoria.

---

## Stack

- **Frontend:** React 19 + Vite 7 + TypeScript + Tailwind 4 + shadcn/ui + wouter
- **Backend:** Node.js 20+ + Express + tRPC 11
- **IA:** OpenAI GPT-4o (via REST direto, não SDK — ver `server/_core/llm.ts`)
- **DB:** MySQL via Drizzle ORM (schema mínimo hoje, expansão em Fase 1)
- **Scraping:** Puppeteer (LinkedIn, Gupy)
- **PDF:** jsPDF + html2canvas (client); Puppeteer (server)
- **Testes:** Vitest

---

## Arquivos na raiz

| Arquivo | Papel |
|---|---|
| `package.json` | Deps e scripts (dev/build/start/test/db:*). |
| `vite.config.ts` | Build frontend. Alias `@` → `client/src`, `@shared` → `shared`. |
| `vitest.config.ts` | Testes. |
| `drizzle.config.ts` | Config Drizzle (migrations). |
| `tsconfig.json` | Target ES2020, strict, downlevelIteration. |
| `components.json` | shadcn/ui config. |
| `.env.example` | Template de variáveis. |

---

## Entry points

- **Frontend:** `client/src/main.tsx` → `App.tsx` → `wouter` Router.
- **Backend:** `server/_core/index.ts` → Express + tRPC.

Em dev: `tsx watch server/_core/index.ts` (porta 3000, Vite via middleware).
Em prod: `vite build` gera `dist/public/` + `esbuild` gera `dist/index.js`, servidor Express serve tudo.

---

## Rotas (frontend — wouter)

- `/` → `ClientDashboard` (CRM)
- `/clients` → `ClientDashboard` (mesmo)
- `/analysis` → `Home` (análise direta de CV)
- `/linkedin` → `LinkedInPage` (análise de perfil LinkedIn)
- `*` → `NotFound`

---

## Routers tRPC (backend)

Registrados em `server/routers.ts`:

| Router | Arquivo | Responsabilidade |
|---|---|---|
| `system` | `server/_core/systemRouter.ts` | Health check. |
| `resume` | `server/resumeRouter.ts` | **Análise principal de CV (1656 linhas).** Orquestra prompt de elite, ATS scoring, sanitização. |
| `pdf` | `server/pdfRouter.ts` | Gera PDF do CV via Puppeteer. |
| `translate` | `server/translateRouter.ts` | Traduz CV PT→EN. |
| `jobs` | `server/jobsRouter.ts` | Busca vagas compatíveis (Gupy, LinkedIn, Vagas.com.br). |
| `linkedin` | `server/linkedInRouter.ts` | Extrai e analisa perfil LinkedIn. |
| `jobExtractor` | `server/jobExtractorRouter.ts` | Extrai conteúdo de URL de vaga. |

Todos os procedures são `publicProcedure` (sem auth) hoje. `protectedProcedure` e `adminProcedure` existem mas
não são usados até Fase 1.

---

## Fluxo de análise

```
User upload CV (PDF/DOCX/TXT)
  ↓
client/src/lib/fileExtractor.ts → texto bruto
  ↓
tRPC call: resume.analyze({ resumeText, jobText? })
  ↓
server/resumeRouter.ts
  ├─→ pré-processamento + ATS scoring determinístico (core/atsEngine.ts)
  ├─→ prompt de elite (~600 linhas no resumeRouter.ts)
  ├─→ invokeLLM (server/_core/llm.ts → OpenAI GPT-4o)
  ├─→ sanitização (remove markdown/emoji que quebram ATS)
  └─→ validação Zod
  ↓
AnalysisResult (estrutura rica com scores, bullets, LinkedIn, salário, etc)
  ↓
client/src/components/AnalysisLayout.tsx → renderização
  ↓
Opcional: generateResumePDF() + generateClientReport() → PDFs
```

---

## CRM (ClientDashboard)

Arquivo: `client/src/pages/ClientDashboard.tsx` (1315 linhas).

**Storage hoje:** `localStorage` (chaves `easylab2_clients` e `easylab2_projects`).

**Migração:** Fase 1 substitui por tRPC → MySQL. Ver `FASE-1-TODO.md`.

**Modelo de dados (localStorage):**
- `Client`: id, name, email, whatsapp, linkedin, notes, createdAt, updatedAt
- `Project`: id, clientId, pacote (cv_basico/cv_linkedin/premium), status (aguardando_cv → em_analise → entregue → pago → cancelado), valor, jobTitle, jobLink, targetPositions, atsScore, cvOriginal, cvOptimized, lastAnalysis, createdAt, updatedAt

---

## Regras de edição para IA

1. **Nunca reescrever o projeto inteiro.** Editar apenas o que for necessário.
2. **Preservar arquitetura** (tRPC + Drizzle + wouter + shadcn).
3. **Não adicionar dependências novas** sem avaliar as existentes primeiro.
4. **Nada de Manus:** o projeto saiu da plataforma Manus na Fase 0. Não reintroduzir `vite-plugin-manus-runtime`, `BUILT_IN_FORGE_*`, storage proxy, OAuth Manus, etc.
5. **LLM = OpenAI direto.** Usar `invokeLLM` de `server/_core/llm.ts`. Não trocar por SDK sem pedir.
6. **Saída JSON estruturada.** Toda resposta de IA deve ser parseada com Zod. Ver `AnalysisResultSchema` em `resumeRouter.ts`.
7. **Tudo em pt-BR.** Verbos em PT-BR nos bullets (Liderou, Estruturou, etc).
8. **ATS-friendly:** nada de markdown, emoji, tabelas, colunas, ícones nos CVs gerados.
