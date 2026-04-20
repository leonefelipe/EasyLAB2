# EasyLAB2

**CRM + IA de análise de currículos e LinkedIn para consultoria de carreira.**

Desenvolvido por Felipe Leone como ferramenta interna para a "Leone Consultoria de Carreira".
O sistema atende clientes ex-RH (Robert Half) oferecendo serviços de otimização de CV, LinkedIn
e job matching via análise por IA.

---

## 🎯 O que o sistema faz

1. **CRM interno** — cadastro de clientes, projetos (CV Básico R$250 / CV+LinkedIn R$450 / Premium R$750),
   pipeline de status (aguardando → em análise → entregue → pago), histórico de análises.

2. **Análise de currículo por IA** — extrai experiências, calcula ATS Score (0-100), Match Score (0-100)
   contra uma vaga, classifica bullets em Achievement / Responsibility / Weak, sugere reescrita em STAR com
   verbos PT-BR.

3. **Otimização de LinkedIn** — gera headline (fórmula driverh), sobre (estrutura gancho/trajetória/conquistas/valor),
   skills estratégicas e dicas SSI.

4. **Engenharia salarial** — range CLT/PJ com multiplicadores regionais e prêmios de seniority (inglês,
   MBA FGV, multinacional, etc).

5. **Geração de PDF** do CV otimizado (ATS-friendly, sem watermark) e relatório profissional do cliente.

6. **Scraping de vagas** — LinkedIn, Gupy, Vagas.com.br via Puppeteer (extração resiliente com fallback).

---

## 🛠️ Stack

| Camada | Tech |
|---|---|
| Frontend | React 19 + TypeScript + Vite 7 + Tailwind CSS 4 + shadcn/ui + wouter |
| Backend | Node.js + Express + tRPC 11 |
| IA | OpenAI GPT-4o (via REST direto, não SDK) |
| DB | MySQL 2 via Drizzle ORM *(hoje: schema mínimo; clientes ainda em localStorage — ver Fase 1)* |
| PDF | jsPDF + html2canvas (client) + Puppeteer (server, para scraping e PDF server-side) |
| Testes | Vitest |

---

## 🚀 Setup local

```bash
# 1. Clonar
git clone https://github.com/leonefelipe/EasyLAB2.git
cd EasyLAB2

# 2. Instalar deps
pnpm install

# 3. Configurar variáveis de ambiente
cp .env.example .env
# Editar .env e preencher OPENAI_API_KEY

# 4. Rodar em dev
pnpm dev
# → http://localhost:3000

# 5. Build pra produção
pnpm build
pnpm start
```

---

## 📁 Estrutura

```
EasyLAB2/
├── client/
│   ├── src/
│   │   ├── App.tsx                # Roteador wouter
│   │   ├── main.tsx               # Entry point
│   │   ├── index.css              # Tema + Tailwind
│   │   ├── pages/
│   │   │   ├── ClientDashboard.tsx  # CRM (rota /)
│   │   │   ├── Home.tsx             # Análise direta (rota /analysis)
│   │   │   ├── LinkedInPage.tsx     # Análise LinkedIn (rota /linkedin)
│   │   │   └── NotFound.tsx
│   │   ├── components/
│   │   │   ├── AnalysisLayout.tsx   # UI de resultados de análise
│   │   │   ├── ErrorBoundary.tsx
│   │   │   └── ui/                  # shadcn/ui primitives
│   │   ├── lib/
│   │   │   ├── trpc.ts              # Cliente tRPC
│   │   │   ├── fileExtractor.ts     # PDF/DOCX/TXT → texto
│   │   │   ├── pdfGenerator.ts      # PDF do CV otimizado
│   │   │   └── clientReportGenerator.ts  # PDF relatório cliente
│   │   ├── contexts/
│   │   │   └── ThemeContext.tsx
│   │   └── hooks/
│   └── public/
├── server/
│   ├── _core/
│   │   ├── index.ts               # Entry point Express
│   │   ├── trpc.ts                # Setup tRPC
│   │   ├── context.ts             # tRPC context
│   │   ├── cookies.ts
│   │   ├── env.ts                 # ENV config
│   │   ├── llm.ts                 # Cliente OpenAI
│   │   ├── systemRouter.ts        # Health check
│   │   └── vite.ts                # Dev server integration
│   ├── resumeRouter.ts            # ⭐ Router principal de análise (1656 linhas)
│   ├── pdfRouter.ts               # PDF server-side (Puppeteer)
│   ├── jobsRouter.ts              # Busca de vagas
│   ├── jobExtractorRouter.ts      # Extração de vagas por URL
│   ├── linkedInRouter.ts
│   ├── linkedInExtractor.ts       # Scraping LinkedIn
│   ├── translateRouter.ts         # Tradução CV PT→EN
│   ├── salaryEngine.ts            # Cálculo salarial determinístico
│   ├── salaryData.ts              # Tabelas de salário BR
│   ├── db.ts                      # Drizzle connection
│   └── routers.ts                 # Root tRPC router
├── core/
│   └── atsEngine.ts               # ATS scoring determinístico (SKILL_ONTOLOGY)
├── shared/
│   ├── const.ts
│   ├── types.ts
│   └── _core/errors.ts
├── drizzle/
│   ├── schema.ts                  # Schema MySQL
│   ├── relations.ts
│   └── 0000_next_lightspeed.sql   # Migração inicial
└── (package.json, vite.config.ts, tsconfig.json, etc)
```

---

## 📋 Roadmap

- ✅ **Fase 0** — Desmanuse + limpeza (concluída em Abril/2026). Ver [FASE-0-CHANGELOG.md](./FASE-0-CHANGELOG.md).
- ⏳ **Fase 1** — Schema MySQL completo + migração CRM do localStorage. Ver [FASE-1-TODO.md](./FASE-1-TODO.md).
- ⏳ **Fase 2** — Aplicar melhorias do plano (SKILL_ONTOLOGY expandida, Layer 7 Narrativa, valueProposition, etc).
- ⏳ **Fase 3** — Migração Render → Vercel+Railway (quando tiver clientes pagos).

---

## 🔑 Variáveis de ambiente

Veja `.env.example`. A única obrigatória hoje é `OPENAI_API_KEY`.

---

## 📝 Licença

MIT.
