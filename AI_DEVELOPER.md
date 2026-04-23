# AI_DEVELOPER.md

## Propósito

Guia para qualquer assistente de IA (Claude, Copilot, Cursor, etc.) que for mexer no EasyLAB2.

**Leitura obrigatória antes de editar:** este arquivo + `PROJECT_MAP.md`.

---

## Visão geral do produto

EasyLAB2 é um **sistema interno de consultoria de carreira**, não um SaaS público.

O usuário (Felipe Leone) atende clientes pagantes oferecendo:
- Análise e reescrita de currículos (R$250-R$750)
- Otimização de perfil LinkedIn
- Estratégia de jobhunting

O sistema é acessado **apenas pelo Felipe** (sem autenticação hoje). Os clientes **não logam**:
recebem os resultados por e-mail (PDF + .docx).

---

## Regras duras de edição

### 🚫 NUNCA
1. Reescrever arquivos inteiros sem motivo específico.
2. Reintroduzir código Manus (vite-plugin-manus-runtime, storage proxy, OAuth Manus, `BUILT_IN_FORGE_*`, SDK Manus).
3. Adicionar dependências "só pra facilitar" sem checar se a solução cabe nas deps existentes.
4. Mudar o stack (trocar tRPC por REST, Drizzle por Prisma, Vite por Next, etc.) sem pedido explícito.
5. Remover testes existentes.
6. Tocar em `core/atsEngine.ts` e `server/salaryEngine.ts` sem entender que são **determinísticos** e essenciais.

### ✅ SEMPRE
1. Rodar `pnpm check` (= `tsc --noEmit`) depois de editar — zero erros é regra.
2. Rodar `pnpm test` se existirem testes da área mexida.
3. Validar saídas de IA com Zod (ver `AnalysisResultSchema`).
4. PT-BR em todo texto que vai pro CV do cliente (verbos em 3ª pessoa passado).
5. Sanitizar output de IA antes de salvar (remover markdown/emoji, manter acentos em maiúsculas).

---

## Integração com IA

**Modelo:** OpenAI GPT-4o (default). Configurável via `OPENAI_MODEL`.
**Cliente:** `server/_core/llm.ts` → função `invokeLLM(params)` — wrapper sobre fetch REST, não SDK.

**Retry:** 3 tentativas com backoff exponencial em 429 e 5xx.

**Structured outputs:** `response_format: { type: "json_schema", ... }` em gpt-4o/o1/o3.
Em outros modelos cai pra `json_object`.

**Temperatura padrão:** 0.1 (determinístico, menos variação).

Exemplo de chamada:
```typescript
const result = await invokeLLM({
  messages: [
    { role: "system", content: ELITE_ATS_SYSTEM_PROMPT },
    { role: "user", content: `CV:\n${cvText}\n\nVaga:\n${jobText}` }
  ],
  response_format: { type: "json_object" },
  temperature: 0.1,
  maxTokens: 4096
});
const parsed = AnalysisResultSchema.parse(JSON.parse(result.choices[0].message.content));
```

---

## Motor ATS (core/atsEngine.ts)

**100% determinístico** — zero LLM calls. Calcula:
- Skill match por ontologia (SKILL_ONTOLOGY: ~500 linhas de mapeamento)
- Keyword match
- Seniority alignment
- Experience duration match

É o **anchor** do prompt: o resultado determinístico é injetado no prompt do LLM para reduzir alucinação.

**Se o usuário está em área fora do SKILL_ONTOLOGY** (ex: farmácia, engenharia civil),
o ATS retorna score zero e o LLM recebe sinal falso. Ver `plano-melhorias-easyjob-ai.html` —
a Fase 2 expande a ontologia pra saúde/logística/jurídico/etc.

---

## Motor salarial (server/salaryEngine.ts)

**100% determinístico.** Usa tabelas em `server/salaryData.ts`:
- Base por cargo × senioridade
- Multiplicadores geográficos (SP=100%, RJ=95%, POA=85%, outros)
- Prêmios (inglês fluente +12%, MBA FGV +8%, multinacional +15%, C-Level +20%)
- PJ = CLT × 1.45 (regra fixa)

Retorna: `{ cltMin, cltMax, pjMin, pjMax, confidence, rationale, multiplierBreakdown }`.

**Não permitir que a IA sobrescreva esses valores.** O LLM recebe o range calculado
e só escreve o rationale em PT-BR.

---

## Schema de saída (AnalysisResult)

Definido em `server/resumeRouter.ts` como Zod. Campos principais:

- `atsScore` (0-100) + `atsScoreBreakdown`
- `matchScore` (0-100) + `projectedMatchScore` (após otimização)
- `jobTitle`, `jobArea`, `seniorityLevel`
- `missingKeywords`, `keywords`
- `strengths[]`, `weaknesses[]`, `formattingIssues[]`
- `optimizedResume` (CV otimizado, texto completo)
- `improvedBullets` ({ original, improved, reason }[])
- `changes` ({ section, description, impact }[])
- `coverLetterPoints`
- `linkedinOptimization` ({ headline, about, featuredSection, skillsToAdd, profileTips })
- `salaryRange` ({ cltMin, cltMax, pjMin, pjMax, confidence, rationale })
- `careerTrajectory`, `recruiterProfile`, `valueProposition`
- `jobhunterStrategy`, `negotiationTips`, `recruiterInsights`
- `competitiveEdges`, `competitiveRisks`, `uniqueDifferentiators`, `percentileEstimate`

Ao adicionar campo novo: atualizar schema Zod, prompt do LLM, e UI em `AnalysisLayout.tsx`.

---

## Segurança / privacidade

- CVs contêm dados pessoais (nome, e-mail, telefone, endereço). Não logar em produção.
- **Nunca** commitar CVs de clientes no repo. O arquivo `user_cv_extracted.txt` foi deletado na Fase 0.
- `.env` no `.gitignore` — nunca commitar chaves.

---

## Testes

`pnpm test` roda vitest. Testes críticos:
- `server/resumeRouter.test.ts` — regressões no output do motor.

Ao modificar prompt ou schema: rodar testes e atualizar snapshots se necessário.

---

## LinkedIn scraping (linkedInExtractor.ts)

LinkedIn bloqueia scraping agressivo. Estratégia:
1. Metadata extraction (og:tags)
2. Puppeteer headless com user-agent real + webdriver hide
3. Fallback para input manual do usuário

**Puppeteer v24 API:** usar `evaluateOnNewDocument` (não `addInitScript`), `new Promise(setTimeout)` (não `waitForTimeout`).

**Rodando em Render/Vercel:** Puppeteer não funciona em serverless. Em Render roda (Web Service clássico).
Na migração futura pra Vercel, esse módulo precisa ir pra Railway/Fly.io separado.

---

## Long-term

Ver `FASE-1-TODO.md` para o próximo marco (MySQL + CRM real).
Ver `plano-melhorias-easyjob-ai.html` para backlog de melhorias de produto.
