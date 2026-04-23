# EasyLAB2 — AI Engine (Método EasyJob)

Motor Python pragmático que gera 3 entregáveis:

1. **CV Otimizado** (DOCX + MD) — ATS-aligned (Gupy, Greenhouse, Workday, iCIMS)
2. **Roteiro de LinkedIn** (MD + JSON) — instruções diretas de alteração de perfil
3. **Relatório Premium** (DOCX + MD) — documento executivo que sustenta precificação

Este diretório é **independente** do stack TypeScript/Node do repo — possui seu
próprio `requirements.txt`, `runtime.txt` e deploy próprio no Render
(configurado em `../render.yaml` na raiz do repo).

---

## Arquivos

| Arquivo | Responsabilidade |
|---------|------------------|
| `easyjob_engine.py` | Motor: 3 system prompts + pré-score ATS + OpenAI async |
| `api.py` | FastAPI (UI mínima + endpoints REST) |
| `run_easyjob.py` | CLI local (init/run) |
| `requirements.txt` | openai, python-docx, fastapi, uvicorn |
| `runtime.txt` | Python 3.11.9 |
| `Procfile` | fallback de start command |
| `exemplo_candidato.json` | payload de exemplo |
| `.env.example` | template de variáveis de ambiente |

---

## Uso local — API HTTP

```bash
cd ai-engine
pip install -r requirements.txt
export OPENAI_API_KEY="sk-..."

uvicorn api:app --reload --port 8000
```

Abra `http://localhost:8000` — UI mínima com botão *Carregar exemplo* + *Gerar ZIP*.

### Endpoints
- `GET /` — UI de demonstração
- `GET /health` — healthcheck (usado pelo Render)
- `GET /api/exemplo` — payload de exemplo
- `POST /api/diagnostico` — pré-score ATS (sem LLM, instantâneo)
- `POST /api/gerar` — gera e retorna ZIP com os 3 entregáveis

---

## Uso local — CLI

```bash
cd ai-engine
pip install -r requirements.txt
export OPENAI_API_KEY="sk-..."

python run_easyjob.py init cliente.json
# editar cliente.json com os dados do candidato
python run_easyjob.py run cliente.json
```

Saída em `saida/<slug>/`: 3 DOCX + 3 MD + 1 JSON de diagnóstico.

---

## Deploy no Render (via `render.yaml` da raiz)

Instruções completas no `README.md` da raiz do repo. Resumo:

1. `git push` na branch `main`.
2. No Render: **New +** → **Blueprint** → selecionar repo `EasyLAB2` → **Apply**.
3. Configurar `OPENAI_API_KEY` na aba **Environment** (não versionar).

O Render identifica o `render.yaml` da raiz e, pela diretiva `rootDir: ai-engine`,
builda e roda **apenas esta pasta** como serviço Python — sem interferir no
client TS nem no server Node do restante do repositório.

---

## Base metodológica dos prompts

System prompts em `easyjob_engine.py` calibrados contra:

- **Padrão XYZ** (Google/Harvard/Columbia) para bullets
- Classificação **AA / R / WS** (Achievement / Responsibility / Weak Statement)
- Pipeline ATS: **Scan → Parse → Match → Rank**
- Padrão de leitura em **F** (6-10 segundos)
- Densidade de keywords por comprimento de CV
- **SSI** e higiene algorítmica de LinkedIn (escola Moubar)
- Liderança de pensamento C-Level (escola Tawil)
- Linguística aplicada a B2B (escola Daniela Souza)
- Tom executivo do Brand Book **Leone Berto** (navy `#1B2F4A` + dourado `#C8A15E`)

**Vocabulário proibido** nos prompts: *hackear*, *burlar*, *driblar*, *enganar*.
**Vocabulário oficial**: *alinhar*, *otimizar*, *calibrar*, *adequar*, *posicionar*.
