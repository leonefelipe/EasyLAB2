# Fase 0 — Desmanuse + Limpeza

**Data:** Abril/2026
**Autor:** Felipe Leone + Claude (Anthropic)
**Motivação:** O projeto foi gerado originalmente dentro da plataforma Manus, herdando
dependências invisíveis (storage proxy, OAuth, SDK, plugins Vite) que:

1. Deixariam de funcionar quando a Manus mudar de API ou desligar o serviço.
2. Geravam código morto que confundia assistentes de IA em cada rodada de mudanças
   (causa raiz do "se perdia a cada modificação").

A Fase 0 elimina todo acoplamento Manus e deixa o projeto **auto-contido e estável**.

---

## Resumo numérico

| Métrica | Antes | Depois |
|---|---|---|
| Arquivos TS/TSX/JS | 108 | 79 |
| Dependências no package.json | 88 | 77 |
| Plugins Vite | 5 | 2 |
| Linhas em `vite.config.ts` | 187 | 32 |
| Dependências Manus | 8 pontos | 0 |
| Erros `tsc --noEmit` | 19 (ocultos) | **0** |

---

## Arquivos deletados (28 total)

### Raiz
- `resumeRouter.ts` — versão órfã de 1252 linhas (o vivo é `server/resumeRouter.ts`)
- `linkedinScraper.js` — script solto não chamado
- `user_cv_extracted.txt` — CV pessoal do Felipe **commitado por engano** (privacidade!)
- `routes/jobExtract.js` + pasta `routes/`
- `patches/wouter@3.7.1.patch` + pasta `patches/`
- `pnpm-lock.yaml` (será regerado a partir do package.json limpo)

### Server
- `server/index.ts` — boilerplate duplicado, o entry real é `_core/index.ts`
- `server/storage.ts` — wrapper do storage proxy da Manus
- `server/pdfRouter-ats-optimized.ts` — órfão (42 linhas)
- `server/jobDetectionUtils.ts` — órfão
- `server/salaryRouter.ts` — órfão (nem estava no routers.ts)
- `server/linkedinJobExtractor.ts` — duplicata de linkedInExtractor.ts
- `server/linkedinParser.ts` — órfão
- `server/auth.logout.test.ts` — teste do OAuth removido

### server/_core (peças Manus)
- `dataApi.ts`, `sdk.ts`, `map.ts`, `imageGeneration.ts`, `voiceTranscription.ts`, `notification.ts`, `oauth.ts`
- pasta `types/` (manusTypes.ts + cookie.d.ts)

### Client (componentes órfãos)
- `ManusDialog.tsx`, `DashboardLayout.tsx`, `DashboardLayoutSkeleton.tsx`
- `SalaryIntelligencePanel.tsx`, `JobLinkImporter.tsx`, `LinkedInJobImporter.tsx`
- `AIChatBox.tsx`, `Map.tsx`
- `pages/ComponentShowcase.tsx`
- pasta `_core/hooks/useAuth.ts` (dependia do OAuth Manus)
- pasta `client/public/__manus__/` (debug collector)

---

## Arquivos modificados

- `server/_core/index.ts` — removido `registerOAuthRoutes`
- `server/_core/env.ts` — removido fallback `BUILT_IN_FORGE_*`
- `server/_core/context.ts` — simplificado (sem SDK Manus)
- `server/_core/systemRouter.ts` — removido `notifyOwner` (push Manus)
- `server/_core/trpc.ts` — comentário explicativo sobre status de auth
- `server/routers.ts` — removido bloco `auth.me` / `auth.logout` (dependia de cookies Manus)
- `server/db.ts` — removido `ENV.ownerOpenId` (era do OAuth Manus)
- `vite.config.ts` — reescrito sem `vite-plugin-manus-runtime`, `jsxLocPlugin`, `debugCollector`
- `package.json` — removidas 11 deps órfãs: `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `docx-parser`, `framer-motion`, `streamdown`, `vite-plugin-manus-runtime`, `@builder.io/vite-plugin-jsx-loc`, `@types/google.maps`, `add`, `pnpm` como devDep
- `tsconfig.json` — `target: ES2020`, `downlevelIteration: true`, incluído `core/**/*`

---

## Bugs pré-existentes corrigidos

Enquanto limpei, rodei `tsc --noEmit` pela primeira vez de verdade e apareceram bugs que
estavam ocultos porque o Manus não rodava typecheck estrito:

1. `core/atsEngine.ts` — chaves duplicadas `"cpa 20"` e `"cpa 10"` (linhas 91-92 removidas, mantidas as de 157-158 que eram mais completas).
2. `client/src/pages/ClientDashboard.tsx` — 6 casos de `results.xxx?.length > 0` com `strict: true`. Corrigido para `(results.xxx?.length ?? 0) > 0`.
3. `server/linkedInExtractor.ts` — API Puppeteer desatualizada: `addInitScript` → `evaluateOnNewDocument`, `waitForTimeout(n)` → `new Promise(r => setTimeout(r, n))`.
4. `client/src/components/AnalysisLayout.tsx:414` — faltava campo `jobArea` na chamada `searchJobsMutation.mutate`.
5. `client/src/components/AnalysisLayout.tsx:852` — argumento errado passado para `generateResumePDF` (passava `clientName` onde era esperado `"pt" | "en"`).

---

## Arquivos novos

- `.env.example` — template claro das 2 obrigatórias + opcionais
- `.gitignore` — cobrindo `.env`, `.manus-logs`, `node_modules`, caches, OS
- `FASE-0-CHANGELOG.md` (este arquivo)
- `FASE-1-TODO.md` — roadmap próximo marco

---

## Validação

```bash
pnpm install          # 528 pacotes resolvem sem conflito ✅
pnpm check            # tsc --noEmit → 0 erros ✅
```

Próximo: **Fase 1 — Migração CRM pra MySQL**. Ver `FASE-1-TODO.md`.
