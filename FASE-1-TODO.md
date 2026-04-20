# Fase 1 — CRM real em MySQL

**Objetivo:** migrar o CRM (clientes, projetos, análises) do `localStorage` para o MySQL hospedado,
eliminando o risco de perder dados a cada troca de máquina/navegador ou deploy.

**Pré-requisito:** Fase 0 concluída ✅

---

## 🎯 Entregáveis

1. Schema MySQL completo no Drizzle
2. tRPC routers: `clients`, `projects`, `analyses`, `cvVersions`
3. `ClientDashboard.tsx` refatorado para usar tRPC em vez de localStorage
4. Setup Railway MySQL (free tier)
5. `DATABASE_URL` configurada no Render
6. Script opcional de import dos dados existentes no localStorage

---

## 📋 Checklist passo a passo

### Setup do banco
- [ ] Criar conta no Railway (https://railway.app) — GitHub login
- [ ] Criar projeto "easylab2-mysql"
- [ ] Adicionar MySQL service (Railway dá 5GB/500h grátis)
- [ ] Copiar `DATABASE_URL` (aba "Variables")
- [ ] Adicionar `DATABASE_URL` no Render (Environment)
- [ ] Adicionar `DATABASE_URL` no `.env` local

### Schema Drizzle (`drizzle/schema.ts`)

Adicionar tabelas:

```typescript
// clients
export const clients = mysqlTable("clients", {
  id: varchar("id", { length: 21 }).primaryKey(), // nanoid
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }),
  whatsapp: varchar("whatsapp", { length: 32 }),
  linkedin: varchar("linkedin", { length: 500 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// projects
export const projects = mysqlTable("projects", {
  id: varchar("id", { length: 21 }).primaryKey(),
  clientId: varchar("clientId", { length: 21 }).notNull().references(() => clients.id, { onDelete: "cascade" }),
  pacote: mysqlEnum("pacote", ["cv_basico", "cv_linkedin", "premium"]).notNull(),
  status: mysqlEnum("status", ["aguardando_cv", "em_analise", "entregue", "pago", "cancelado"]).notNull().default("aguardando_cv"),
  valor: int("valor").notNull().default(0),
  jobTitle: varchar("jobTitle", { length: 255 }),
  jobLink: varchar("jobLink", { length: 1000 }),
  targetPositions: text("targetPositions"),
  atsScore: int("atsScore"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// cvVersions — histórico de versões do CV por projeto
export const cvVersions = mysqlTable("cvVersions", {
  id: varchar("id", { length: 21 }).primaryKey(),
  projectId: varchar("projectId", { length: 21 }).notNull().references(() => projects.id, { onDelete: "cascade" }),
  versionType: mysqlEnum("versionType", ["original", "optimized", "edited"]).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// analyses — cada rodada de análise da IA
export const analyses = mysqlTable("analyses", {
  id: varchar("id", { length: 21 }).primaryKey(),
  projectId: varchar("projectId", { length: 21 }).notNull().references(() => projects.id, { onDelete: "cascade" }),
  resultJson: text("resultJson").notNull(), // AnalysisResult serializado
  matchScore: int("matchScore"),
  atsScore: int("atsScore"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
```

### Migrations
- [ ] `pnpm db:generate` (gera SQL em `drizzle/`)
- [ ] `pnpm db:migrate` (aplica no Railway)
- [ ] Verificar no Railway Studio que as tabelas apareceram

### tRPC Routers

Criar arquivos:
- [ ] `server/clientsRouter.ts` — CRUD + listagem ordenada por updatedAt
- [ ] `server/projectsRouter.ts` — CRUD + filter por clientId + atualização de status
- [ ] `server/cvVersionsRouter.ts` — create/list por projectId
- [ ] `server/analysesRouter.ts` — create (grava resultJson) + list por projectId

Registrar em `server/routers.ts`:
```typescript
clients: clientsRouter,
projects: projectsRouter,
cvVersions: cvVersionsRouter,
analyses: analysesRouter,
```

### Frontend

- [ ] `ClientDashboard.tsx` — substituir `loadClients()` / `saveClients()` por `trpc.clients.list.useQuery()` + mutations
- [ ] Idem para projetos
- [ ] Loading states onde fazia sentido antes
- [ ] Toast em erro de rede (hoje localStorage nunca falha)

### Import dos dados existentes
- [ ] Botão "Importar do localStorage" no CRM (só aparece se `localStorage.easylab2_clients` existir)
- [ ] Ao clicar: envia todos os clientes/projetos pro MySQL via mutation batch
- [ ] Após sucesso: limpa localStorage

---

## 🧪 Testes
- [ ] Criar `server/clientsRouter.test.ts`
- [ ] Criar `server/projectsRouter.test.ts`
- [ ] Mock do DB ou usar SQLite in-memory

---

## ⚠️ Pontos de atenção

1. **Não quebrar produção.** Fazer feature-flag: `USE_MYSQL=true` no `.env` ativa o novo fluxo, `false` mantém localStorage. Remover flag depois de 1 semana funcionando.

2. **Backup antes de migrar.** Botão "Export JSON" no CRM que baixa `clients.json` + `projects.json`. Felipe roda antes de mexer.

3. **nanoid vs autoincrement.** Uso nanoid (21 chars) em vez de int autoincrement pra não vazar contagem de clientes e facilitar URLs futuras (`/clients/abc123def456`).

4. **Cascade delete.** Deletar cliente → deleta projetos → deleta análises + cv versions. Configurado nos `references({ onDelete: "cascade" })`.

---

## 📊 Estimativa

- Tempo: 3-4 dias part-time
- Complexidade: média
- Risco: baixo (feature-flag protege)

Após Fase 1 pronta: **Fase 2** aplica as 8 melhorias do `plano-melhorias-easyjob-ai.html`
(SKILL_ONTOLOGY expandida, Layer 7 Narrativa, valueProposition, protocolo salarial, etc).
