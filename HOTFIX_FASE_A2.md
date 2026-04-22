# HOTFIX FASE A.2 — 22/abr/2026

Projeto EasyLAB2 com os seguintes **bugs corrigidos** e **branding oficial** aplicado.

---

## ✅ Bugs corrigidos

| # | Bug | Causa | Arquivo corrigido |
|---|---|---|---|
| 1 | **PDF: "Setting up fake worker failed"** | `pdfjs 5.x` usa `.mjs`, não `.js` no cdnjs | `client/src/lib/fileExtractor.ts` |
| 2 | **DOCX abrindo câmera no Android** | `accept` sem MIME types completos | `client/src/pages/ClientDashboard.tsx` + `client/src/components/AnalysisLayout.tsx` |
| 3 | **Inhire retornando 403** | headers simples de bot + API pública desconhecida | `server/resumeRouter.ts` |

---

## 🎨 Branding oficial aplicado

**Cores (Brand Book v2):**
- Azul Marinho Profundo: `#1B2F4A`
- Dourado Elegante: `#C8A15E`
- Branco Puro: `#FFFFFF`

**Fontes:**
- Serif (títulos): **Cinzel** / Cormorant Garamond (equivalente web ao Trajan Pro)
- Sans-serif (corpo): **Open Sans** / Lato

**Arquivos aplicados:**
- `client/src/index.css` — tema completo navy + dourado
- `client/public/leone_berto_logo.svg` — logo vetorial
- `client/src/components/BrandHeader.tsx` — componente de header
- `server/reportBrandHeader.ts` — helpers para PDF do relatório

---

## 🚀 Deploy

```bash
# 1. Substitui a pasta EasyLAB2 inteira pelo conteúdo deste ZIP
# 2. Garante dependências instaladas
pnpm install

# 3. Testa local primeiro
pnpm dev
# → http://localhost:3000

# 4. Se tudo OK, commita e push
git add .
git commit -m "fix: PDF worker + DOCX MIME + Inhire scraping + branding oficial"
git push
```

Render faz auto-deploy em ~3 min após o push.

---

## 🧪 Smoke test (5 min) — rodar antes de cada deploy

1. [ ] Upload PDF → extrai texto sem erro de "fake worker"
2. [ ] Upload DOCX → extrai texto (testar no desktop + mobile)
3. [ ] Vaga Inhire (colar URL) → scraping funciona
4. [ ] Vaga em branco → "Analisar CV (geral)" funciona
5. [ ] Branding: cores navy + dourado visíveis no header/cards
6. [ ] Mobile: abrir `http://<seu-ip-local>:3000` no celular na mesma wifi

---

## 📦 Como usar o branding

**Logo na UI:**
```tsx
<img src="/leone_berto_logo.svg" alt="Leone Berto Consultoria" />
```

**Header completo:**
```tsx
import BrandHeader from "@/components/BrandHeader";

<BrandHeader variant="dark" />
```

**PDF do relatório** (em `client/src/lib/clientReportGenerator.ts`):
```ts
import { drawReportHeader, drawReportFooter, drawSectionTitle, drawScoreBadge } from "@/server/reportBrandHeader";

drawReportHeader(doc, 210, "Maria Silva", "22/04/2026");
drawSectionTitle(doc, "Análise ATS", 40, 210);
drawScoreBadge(doc, 78, 105, 80, "ATS Score");
```

**Classes utilitárias CSS:**
- `.lb-card` — card com borda dourada lateral
- `.lb-header` — header navy com linha dourada
- `.lb-score-badge` — badge circular de score
- `.lb-gold-divider` — divisor com linhas douradas
- `.lb-btn-primary` / `.lb-btn-gold` — botões da marca
- `bg-brand-navy` / `text-brand-gold` / `border-brand-gold` — utilities Tailwind
