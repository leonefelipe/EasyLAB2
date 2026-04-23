# EasyLAB2 — Método EasyJob por Felipe Leone

Motor pragmático de otimização de currículo, LinkedIn e relatório premium, com
deploy automatizado no **Render** a partir do **GitHub**.

## Arquitetura

Este repositório contém duas camadas, mas **apenas a camada Python (`ai-engine/`)
é usada no deploy de produção atual**:

```
EasyLAB2/
├── ai-engine/           ← PRODUÇÃO — motor Python + FastAPI (deployado no Render)
│   ├── easyjob_engine.py      motor: 3 system prompts + pré-score ATS + OpenAI async
│   ├── api.py                 FastAPI + UI mínima
│   ├── run_easyjob.py         CLI local
│   ├── requirements.txt
│   ├── runtime.txt            Python 3.11.9
│   ├── Procfile
│   ├── exemplo_candidato.json
│   ├── .env.example
│   └── README.md
│
├── client/              ← LEGADO — front React/TS (mantido para referência)
├── server/              ← LEGADO — backend Node/tRPC (mantido para referência)
├── core/                ← LEGADO — atsEngine.ts
├── shared/              ← LEGADO
├── drizzle/             ← LEGADO
│
├── render.yaml          ← Blueprint do Render (aponta para ai-engine/)
├── .gitignore
└── README.md            (este arquivo)
```

O stack TypeScript/Node antigo continua versionado mas **não é buildado nem
executado pelo Render**. O `render.yaml` direciona o deploy exclusivamente
para `ai-engine/` via `rootDir: ai-engine`.

---

## Deploy no Render (passo a passo)

### 1. Push para o GitHub

```bash
# se ainda não é um repo git
git init
git branch -M main
git remote add origin https://github.com/leonefelipe/EasyLAB2.git

git add .
git commit -m "feat: motor Python + deploy Render"
git push -u origin main        # ou: git push -f origin main  (se precisar sobrescrever)
```

### 2. Criar o Web Service no Render

1. Acesse [render.com](https://render.com) e logue com sua conta GitHub.
2. **New +** → **Blueprint**.
3. Selecione o repositório `leonefelipe/EasyLAB2`.
4. O Render lê o `render.yaml`, detecta `rootDir: ai-engine` e propõe criar
   o serviço **easylab2-ai-engine**. Clique em **Apply**.

### 3. Configurar a variável secreta `OPENAI_API_KEY`

Na dashboard do serviço `easylab2-ai-engine`:

1. Aba **Environment** → **Add Environment Variable**:
   - Key: `OPENAI_API_KEY`
   - Value: `sk-...` (sua chave real da OpenAI)
2. **Save Changes** — o Render redeploya automaticamente.

### 4. Verificar

Em ~3 minutos, o serviço estará em
`https://easylab2-ai-engine.onrender.com` (ou similar).

```bash
curl https://easylab2-ai-engine.onrender.com/health
# {"status":"ok","service":"easyjob-motor","model":"gpt-4o","has_openai_key":true}
```

Abra a URL raiz no navegador — UI mínima com botão **Carregar exemplo** e
**Gerar ZIP com 3 entregáveis**.

### 5. Deploys subsequentes

Qualquer `git push` na branch `main` dispara novo deploy automático
(`autoDeploy: true` no `render.yaml`).

---

## Uso local (opcional, sem Render)

### API HTTP
```bash
cd ai-engine
pip install -r requirements.txt
export OPENAI_API_KEY="sk-..."
uvicorn api:app --reload --port 8000
```

### CLI
```bash
cd ai-engine
pip install -r requirements.txt
export OPENAI_API_KEY="sk-..."
python run_easyjob.py init cliente.json
# edite cliente.json
python run_easyjob.py run cliente.json
```

Saída em `ai-engine/saida/<slug>/`: 3 DOCX + 3 MD + 1 JSON de diagnóstico.

---

## Os 3 entregáveis

| # | Artefato | Formato | Finalidade |
|---|----------|---------|------------|
| 1 | **CV Otimizado** | DOCX + MD | ATS-aligned (Gupy, Greenhouse, Workday, iCIMS). Padrão XYZ, front-loading, classificação AA/R/WS. |
| 2 | **Roteiro de LinkedIn** | MD + JSON | Instruções campo a campo (headline, sobre, skills, featured, recomendações, plano de conteúdo de 8 semanas). |
| 3 | **Relatório Premium** | DOCX + MD | Documento executivo com capa navy+dourado, diagnóstico, intervenções, projeção de impacto e plano 90 dias. |

## Base metodológica dos prompts

Os 3 system prompts em `ai-engine/easyjob_engine.py` estão calibrados contra:

- **Padrão XYZ** (Google / Harvard / Columbia) para bullets
- Classificação **AA / R / WS**
- Pipeline ATS: **Scan → Parse → Match → Rank**
- Padrão de leitura em **F** (6-10 segundos)
- Densidade de keywords por comprimento de CV
- **SSI** e higiene algorítmica de LinkedIn (escola Moubar)
- Liderança de pensamento C-Level (escola Tawil)
- Linguística aplicada a B2B (escola Daniela Souza)
- Tom executivo do Brand Book **Leone Berto** (navy `#1B2F4A` + dourado `#C8A15E`)

**Vocabulário proibido** nos prompts: *hackear*, *burlar*, *driblar*, *enganar*.
**Vocabulário oficial**: *alinhar*, *otimizar*, *calibrar*, *adequar*, *posicionar*.

---

## Próximos deploys — troca de modelo / tuning

Na dashboard do Render, altere a env var `EASYJOB_MODEL`:

| Valor | Uso |
|-------|-----|
| `gpt-4o` | Padrão — qualidade máxima |
| `gpt-4o-mini` | Custo ~10x menor — boa para triagem de alto volume |

Para Azure OpenAI ou proxies compatíveis, adicione `OPENAI_BASE_URL=https://...`.

## Plano Render

- **Free**: dorme após 15 min de inatividade. Cold-start ~30s.
- **Starter** ($7/mês): sempre ativo. Troque `plan: free` → `plan: starter`
  em `render.yaml` e re-commite.
