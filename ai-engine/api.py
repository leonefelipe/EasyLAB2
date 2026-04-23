"""
api.py — Método EasyJob (UI de consultoria real)

Fluxo do cliente:
  1. Upload do CV em PDF ou DOCX (ou colar texto)
  2. URL do LinkedIn (ou colar o texto do perfil)
  3. Colar a descrição da vaga-alvo
  4. Clique único → gera os 3 entregáveis em um ZIP

Endpoints:
    GET  /            → formulário único (3 campos + botão)
    GET  /health      → healthcheck
    POST /api/processar → recebe multipart form → retorna ZIP com entregáveis
"""

from __future__ import annotations

import io
import json
import os
import re
import tempfile
import zipfile
from dataclasses import asdict
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import HTMLResponse, StreamingResponse

from easyjob_engine import (
    DadosCandidato,
    LLMClient,
    gerar_entregaveis,
)
from run_easyjob import (
    exportar_cv_docx,
    exportar_relatorio_premium_docx,
    renderizar_roteiro_linkedin_markdown,
)

app = FastAPI(title="Método EasyJob — Motor de Reposicionamento Executivo")


# ═══════════════════════════════════════════════════════════════════════════════
# UI — formulário real
# ═══════════════════════════════════════════════════════════════════════════════

INDEX_HTML = """<!doctype html>
<html lang="pt-br">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Método EasyJob — Felipe Leone</title>
<style>
  :root { --navy:#1B2F4A; --gold:#C8A15E; --bg:#FAFAF7; --ink:#1a1a1a; --muted:#6b6660; --border:#e5e2dc; }
  * { box-sizing:border-box; }
  body { margin:0; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
         background:var(--bg); color:var(--ink); line-height:1.5; }
  header { background:var(--navy); color:#fff; padding:32px 40px; border-bottom:4px solid var(--gold); }
  header h1 { margin:0; font-size:24px; letter-spacing:1px; }
  header p { margin:6px 0 0; opacity:.85; font-size:13px; }
  main { max-width:860px; margin:32px auto; padding:0 24px 60px; }
  .intro { background:#fff; border:1px solid var(--border); border-left:4px solid var(--gold);
           padding:18px 22px; border-radius:6px; margin-bottom:24px; font-size:14px; color:#333; }
  .card { background:#fff; border:1px solid var(--border); border-radius:8px; padding:28px;
          margin-bottom:20px; box-shadow:0 1px 3px rgba(0,0,0,.03); }
  .card h2 { margin:0 0 6px; color:var(--navy); font-size:15px; text-transform:uppercase;
             letter-spacing:1px; display:flex; align-items:center; gap:10px; }
  .card h2 .num { background:var(--navy); color:#fff; width:26px; height:26px; border-radius:50%;
                  display:inline-flex; align-items:center; justify-content:center; font-size:13px; }
  .hint { color:var(--muted); font-size:13px; margin:0 0 16px; }
  .tabs { display:flex; gap:4px; margin-bottom:14px; border-bottom:1px solid var(--border); }
  .tab { padding:8px 16px; cursor:pointer; font-size:13px; color:var(--muted);
         border-bottom:2px solid transparent; margin-bottom:-1px; }
  .tab.active { color:var(--navy); border-bottom-color:var(--gold); font-weight:600; }
  .panel { display:none; }
  .panel.active { display:block; }
  input[type=text], input[type=url], textarea {
    width:100%; padding:12px 14px; border:1px solid #d4d0c8; border-radius:6px;
    font-family:inherit; font-size:14px; background:#fcfcfa; color:var(--ink);
  }
  textarea { min-height:140px; resize:vertical; font-family:"SF Mono",Consolas,monospace; font-size:12px; }
  .filebox { border:2px dashed #d4d0c8; border-radius:6px; padding:28px; text-align:center;
             cursor:pointer; transition:border-color .2s, background .2s; }
  .filebox:hover { border-color:var(--gold); background:#fdfbf6; }
  .filebox input { display:none; }
  .filebox-label { color:var(--navy); font-weight:600; }
  .filebox-hint { color:var(--muted); font-size:12px; margin-top:6px; }
  .filebox.has-file { border-color:var(--gold); background:#fdfbf6; }
  .filebox.has-file .filebox-label { color:#2e7d32; }
  .actions { display:flex; gap:12px; align-items:center; margin-top:8px; }
  button.primary { background:var(--navy); color:#fff; border:none; padding:14px 32px;
                   border-radius:6px; font-size:15px; font-weight:600; cursor:pointer;
                   letter-spacing:.5px; }
  button.primary:hover:not(:disabled) { background:#253c5a; }
  button.primary:disabled { opacity:.5; cursor:not-allowed; }
  .required { color:#c0392b; font-weight:600; }
  .optional { color:var(--muted); font-size:12px; font-weight:400; font-style:italic; }
  #status { margin-top:20px; padding:14px 18px; border-radius:6px; font-size:14px; display:none; }
  #status.show { display:block; }
  #status.info { background:#fffbea; color:#8a6d00; border:1px solid #e8d07a; }
  #status.ok { background:#e8f5e9; color:#2e7d32; border:1px solid #a5d6a7; }
  #status.err { background:#ffebee; color:#c62828; border:1px solid #ef9a9a; }
  .spinner { display:inline-block; width:14px; height:14px; border:2px solid #c5a462;
             border-top-color:transparent; border-radius:50%; animation:spin .8s linear infinite;
             vertical-align:middle; margin-right:8px; }
  @keyframes spin { to { transform:rotate(360deg); } }
  footer { text-align:center; padding:32px 24px; color:var(--muted); font-size:12px;
           border-top:1px solid var(--border); margin-top:40px; }
  footer strong { color:var(--navy); }
  @media (max-width:640px) {
    header { padding:24px; }
    .card { padding:20px; }
    main { padding:0 16px 40px; }
  }
</style>
</head>
<body>
<header>
  <h1>MÉTODO EASYJOB</h1>
  <p>Motor de Reposicionamento Executivo · Felipe Leone</p>
</header>

<main>
  <div class="intro">
    Envie o currículo, o perfil de LinkedIn e a descrição da vaga-alvo.
    Em 30-60 segundos o sistema gera <strong>3 entregáveis</strong> prontos para uso:
    Currículo Otimizado (DOCX), Roteiro de LinkedIn (MD) e Relatório Premium (DOCX).
  </div>

  <form id="form" onsubmit="return false">

    <!-- CV -->
    <div class="card">
      <h2><span class="num">1</span> Currículo <span class="optional">&nbsp;obrigatório</span></h2>
      <p class="hint">Envie em PDF ou DOCX, ou cole o texto direto.</p>
      <div class="tabs" data-group="cv">
        <div class="tab active" data-target="cv-file">Upload de arquivo</div>
        <div class="tab" data-target="cv-text">Colar texto</div>
      </div>
      <div class="panel active" id="cv-file">
        <label class="filebox" id="cv-filebox">
          <input type="file" id="cv-input" name="cv_file" accept=".pdf,.docx,.txt">
          <div class="filebox-label" id="cv-filelabel">Clique para selecionar o arquivo</div>
          <div class="filebox-hint">PDF, DOCX ou TXT · máx. 10 MB</div>
        </label>
      </div>
      <div class="panel" id="cv-text">
        <textarea id="cv-textinput" name="cv_text" placeholder="Cole aqui o texto completo do currículo atual..."></textarea>
      </div>
    </div>

    <!-- LinkedIn -->
    <div class="card">
      <h2><span class="num">2</span> LinkedIn <span class="optional">&nbsp;opcional — mas recomendado</span></h2>
      <p class="hint">O LinkedIn bloqueia leitura automática de perfis. Use qualquer uma das 3 opções abaixo.</p>
      <div class="tabs" data-group="li">
        <div class="tab active" data-target="li-pdf">PDF exportado do LinkedIn</div>
        <div class="tab" data-target="li-text">Colar texto</div>
        <div class="tab" data-target="li-url">URL do perfil</div>
      </div>

      <div class="panel active" id="li-pdf">
        <label class="filebox" id="li-filebox">
          <input type="file" id="li-input" name="linkedin_file" accept=".pdf,.docx,.txt">
          <div class="filebox-label" id="li-filelabel">Clique para selecionar o PDF exportado do LinkedIn</div>
          <div class="filebox-hint">Como exportar: LinkedIn &rarr; ícone "Mais" no seu perfil &rarr; Salvar em PDF</div>
        </label>
      </div>

      <div class="panel" id="li-text">
        <textarea id="li-textinput" name="linkedin_text"
          placeholder="Cole aqui o headline, a seção 'Sobre', as experiências, formação e skills do seu LinkedIn..."></textarea>
      </div>

      <div class="panel" id="li-url">
        <input type="url" id="li-urlinput" name="linkedin_url" placeholder="https://www.linkedin.com/in/usuario">
        <p class="hint" style="margin-top:8px;">
          <strong>Aviso:</strong> o LinkedIn costuma bloquear a leitura. Se falhar, o sistema usará só o CV e a vaga —
          ou troque para as abas <em>PDF exportado</em> ou <em>Colar texto</em>.
        </p>
      </div>
    </div>

    <!-- Vaga -->
    <div class="card">
      <h2><span class="num">3</span> Vaga-alvo <span class="optional">&nbsp;obrigatória</span></h2>
      <p class="hint">Cole a descrição completa da vaga (job description) que o candidato quer conquistar.</p>
      <textarea id="vaga-input" name="vaga_texto"
        placeholder="Cole aqui a descrição da vaga: cargo, requisitos, responsabilidades, senioridade, ferramentas exigidas, etc."></textarea>
    </div>

    <!-- Objetivo -->
    <div class="card">
      <h2><span class="num">4</span> Objetivo de carreira <span class="optional">&nbsp;opcional</span></h2>
      <p class="hint">Em uma frase, o alvo estratégico de 12 meses do candidato.</p>
      <input type="text" id="obj-input" name="objetivo"
        placeholder="Ex.: Head of Talent Acquisition em fintech Série B/C">
    </div>

    <div class="actions">
      <button type="button" class="primary" id="btn-gerar">
        Gerar 3 entregáveis
      </button>
      <div id="status"></div>
    </div>

  </form>
</main>

<footer>
  <strong>Método EasyJob</strong> · Estratégia de Carreira e Posicionamento Profissional<br>
  Tempo estimado de processamento: 30-60 segundos
</footer>

<script>
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

// tabs
$$('.tab').forEach(t => {
  t.onclick = () => {
    const group = t.parentElement;
    group.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    const target = t.dataset.target;
    const card = t.closest('.card');
    card.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    card.querySelector('#' + target).classList.add('active');
  };
});

// file box — CV
const cvInput = $('#cv-input');
const cvLabel = $('#cv-filelabel');
const cvFilebox = $('#cv-filebox');
cvInput.onchange = () => {
  if (cvInput.files[0]) {
    cvLabel.textContent = '✓ ' + cvInput.files[0].name;
    cvFilebox.classList.add('has-file');
  }
};

// file box — LinkedIn
const liInput = $('#li-input');
const liLabel = $('#li-filelabel');
const liFilebox = $('#li-filebox');
liInput.onchange = () => {
  if (liInput.files[0]) {
    liLabel.textContent = '✓ ' + liInput.files[0].name;
    liFilebox.classList.add('has-file');
  }
};

function setStatus(msg, cls) {
  const st = $('#status');
  st.className = 'show ' + cls;
  st.innerHTML = (cls === 'info' ? '<span class="spinner"></span>' : '') + msg;
}

$('#btn-gerar').onclick = async () => {
  const btn = $('#btn-gerar');

  // validação mínima
  const hasFile = cvInput.files.length > 0;
  const cvText = $('#cv-textinput').value.trim();
  if (!hasFile && !cvText) {
    return setStatus('⚠ Envie o currículo (arquivo ou texto).', 'err');
  }
  const vaga = $('#vaga-input').value.trim();
  if (!vaga) {
    return setStatus('⚠ Cole a descrição da vaga-alvo.', 'err');
  }

  // monta form-data
  const fd = new FormData();
  if (hasFile) fd.append('cv_file', cvInput.files[0]);
  if (cvText) fd.append('cv_text', cvText);
  if (liInput.files.length > 0) fd.append('linkedin_file', liInput.files[0]);
  const liUrl = $('#li-urlinput').value.trim();
  const liText = $('#li-textinput').value.trim();
  if (liUrl) fd.append('linkedin_url', liUrl);
  if (liText) fd.append('linkedin_text', liText);
  fd.append('vaga_texto', vaga);
  const obj = $('#obj-input').value.trim();
  if (obj) fd.append('objetivo', obj);

  btn.disabled = true;
  setStatus('Processando... extraindo dados, calculando ATS score, gerando entregáveis. Aguarde 30-60s.', 'info');

  try {
    const r = await fetch('/api/processar', { method:'POST', body: fd });
    if (!r.ok) {
      const j = await r.json().catch(() => ({detail:'erro desconhecido'}));
      throw new Error(j.detail || ('HTTP ' + r.status));
    }
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const disp = r.headers.get('Content-Disposition') || '';
    const m = /filename="([^"]+)"/.exec(disp);
    a.href = url;
    a.download = m ? m[1] : 'easyjob_entregaveis.zip';
    document.body.appendChild(a); a.click(); a.remove();
    setStatus('✓ ZIP gerado. Download iniciado. Abra os 3 arquivos DOCX/MD dentro dele.', 'ok');
  } catch (e) {
    setStatus('✗ Erro: ' + e.message, 'err');
  } finally {
    btn.disabled = false;
  }
};
</script>
</body>
</html>"""


@app.get("/", response_class=HTMLResponse)
async def index() -> str:
    return INDEX_HTML


@app.get("/health")
async def health() -> dict:
    return {
        "status": "ok",
        "service": "easyjob-motor",
        "model": os.environ.get("EASYJOB_MODEL", "gpt-4o"),
        "has_openai_key": bool(os.environ.get("OPENAI_API_KEY")),
    }


# ═══════════════════════════════════════════════════════════════════════════════
# EXTRATORES (PDF, DOCX, LinkedIn)
# ═══════════════════════════════════════════════════════════════════════════════

def extrair_texto_pdf(conteudo: bytes) -> str:
    """PDF → texto. Tenta pypdf primeiro; se falhar, levanta HTTPException."""
    try:
        from pypdf import PdfReader
    except ImportError:
        raise HTTPException(500, "pypdf não instalado no servidor.")
    try:
        reader = PdfReader(io.BytesIO(conteudo))
        return "\n\n".join((p.extract_text() or "") for p in reader.pages).strip()
    except Exception as e:
        raise HTTPException(400, f"Falha ao ler PDF: {e}")


def extrair_texto_docx(conteudo: bytes) -> str:
    """DOCX → texto plano."""
    try:
        from docx import Document
    except ImportError:
        raise HTTPException(500, "python-docx não instalado.")
    try:
        with tempfile.NamedTemporaryFile(suffix=".docx", delete=False) as tmp:
            tmp.write(conteudo)
            tmp_path = tmp.name
        doc = Document(tmp_path)
        txt = "\n".join(p.text for p in doc.paragraphs if p.text.strip())
        Path(tmp_path).unlink(missing_ok=True)
        return txt.strip()
    except Exception as e:
        raise HTTPException(400, f"Falha ao ler DOCX: {e}")


def extrair_texto_linkedin(url: str) -> str:
    """
    Tenta raspar o LinkedIn. Na prática o LinkedIn bloqueia bots:
    retornamos string vazia e confiamos no campo manual.
    """
    try:
        import urllib.request
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "Mozilla/5.0 (compatible; EasyJob/1.0)"},
        )
        with urllib.request.urlopen(req, timeout=8) as resp:
            html = resp.read().decode("utf-8", errors="ignore")
        # remove tags grosseiramente
        txt = re.sub(r"<[^>]+>", " ", html)
        txt = re.sub(r"\s+", " ", txt)
        if "login" in txt.lower()[:2000] or "sign" in txt.lower()[:2000]:
            return ""
        return txt[:5000]
    except Exception:
        return ""


# ═══════════════════════════════════════════════════════════════════════════════
# PARSER via LLM: texto cru → DadosCandidato estruturado
# ═══════════════════════════════════════════════════════════════════════════════

PARSER_SYSTEM_PROMPT = """Você é um extrator estruturado do Método EasyJob. Converte texto cru de currículo + LinkedIn + vaga-alvo em JSON rigorosamente estruturado.

Regras:
- Nunca invente dados. Se não tem no texto, deixe o campo vazio ou em branco.
- Normalize datas para formato "MM/AAAA" quando possível.
- Calcule `anos` de cada experiência como número decimal (ex: 3.5).
- Preserve bullets EXATAMENTE como aparecem no CV (não reescreva nesta etapa — a otimização é feita depois por outro agente).
- `habilidades_declaradas`: extrair da seção de skills/competências do CV e do LinkedIn.

Schema de saída (JSON estrito):
{
  "nome": "string",
  "contato": {"email":"", "telefone":"", "cidade":"", "linkedin":""},
  "titulo_atual": "cargo atual do candidato",
  "resumo_atual": "resumo/objetivo atualmente escrito no CV (como está)",
  "experiencias": [
    {"cargo":"", "empresa":"", "local":"", "periodo":"MM/AAAA – MM/AAAA", "anos":0.0,
     "bullets":["bullet 1 exatamente como está no CV", "..."]}
  ],
  "formacao": [{"curso":"", "instituicao":"", "periodo":"", "detalhe":""}],
  "certificacoes": [],
  "idiomas": [{"idioma":"", "nivel":""}],
  "habilidades_declaradas": [],
  "vaga_alvo": {
    "titulo": "cargo extraído da descrição da vaga",
    "empresa": "empresa alvo se mencionada, senão vazio",
    "senioridade": "nível inferido (Pleno/Sênior/Head/Diretor/C-Level)",
    "anos_requeridos": 5,
    "descricao": "a descrição completa da vaga como recebida"
  },
  "objetivo_carreira": "se informado pelo usuário, ou deduzido da trajetória"
}

Responda ESTRITAMENTE em JSON. Nada fora do JSON."""


async def parsear_para_candidato(
    llm: LLMClient,
    cv_texto: str,
    linkedin_texto: str,
    vaga_texto: str,
    objetivo: str,
) -> DadosCandidato:
    user_content = f"""### CURRÍCULO (texto cru)
{cv_texto or "(não informado)"}

### LINKEDIN (texto cru)
{linkedin_texto or "(não informado)"}

### DESCRIÇÃO DA VAGA-ALVO
{vaga_texto}

### OBJETIVO DE CARREIRA (informado pelo usuário)
{objetivo or "(não informado)"}
"""
    raw = await llm.gerar(PARSER_SYSTEM_PROMPT, user_content, max_tokens=4000)
    try:
        d = json.loads(raw)
    except Exception as e:
        raise HTTPException(500, f"Parser LLM retornou JSON inválido: {e}")
    try:
        return DadosCandidato(**d)
    except TypeError as e:
        raise HTTPException(500, f"Estrutura parseada incompatível: {e}")


# ═══════════════════════════════════════════════════════════════════════════════
# ENDPOINT PRINCIPAL
# ═══════════════════════════════════════════════════════════════════════════════

@app.post("/api/processar")
async def processar(
    cv_file: UploadFile | None = File(None),
    cv_text: str | None = Form(None),
    linkedin_file: UploadFile | None = File(None),
    linkedin_url: str | None = Form(None),
    linkedin_text: str | None = Form(None),
    vaga_texto: str = Form(...),
    objetivo: str | None = Form(None),
):
    if not os.environ.get("OPENAI_API_KEY"):
        raise HTTPException(500, "OPENAI_API_KEY não configurada no servidor.")

    # ── 1. extrai texto do CV ────────────────────────────────────────────────
    cv_texto_final = (cv_text or "").strip()
    if cv_file is not None and cv_file.filename:
        conteudo = await cv_file.read()
        nome = cv_file.filename.lower()
        if nome.endswith(".pdf"):
            cv_texto_final = extrair_texto_pdf(conteudo)
        elif nome.endswith(".docx"):
            cv_texto_final = extrair_texto_docx(conteudo)
        elif nome.endswith(".txt"):
            cv_texto_final = conteudo.decode("utf-8", errors="ignore")
        else:
            raise HTTPException(400, "Formato não suportado. Use PDF, DOCX ou TXT.")

    if not cv_texto_final:
        raise HTTPException(400, "Currículo vazio ou ilegível.")

    # ── 2. extrai texto do LinkedIn (prioridade: upload > texto colado > URL) ─
    linkedin_final = ""
    if linkedin_file is not None and linkedin_file.filename:
        conteudo_li = await linkedin_file.read()
        nome_li = linkedin_file.filename.lower()
        if nome_li.endswith(".pdf"):
            linkedin_final = extrair_texto_pdf(conteudo_li)
        elif nome_li.endswith(".docx"):
            linkedin_final = extrair_texto_docx(conteudo_li)
        elif nome_li.endswith(".txt"):
            linkedin_final = conteudo_li.decode("utf-8", errors="ignore")
    if not linkedin_final and linkedin_text:
        linkedin_final = linkedin_text.strip()
    if not linkedin_final and linkedin_url:
        linkedin_final = extrair_texto_linkedin(linkedin_url)

    # ── 3. LLM parser → DadosCandidato ───────────────────────────────────────
    llm = LLMClient()
    candidato = await parsear_para_candidato(
        llm,
        cv_texto=cv_texto_final,
        linkedin_texto=linkedin_final,
        vaga_texto=vaga_texto,
        objetivo=(objetivo or "").strip(),
    )

    # ── 4. motor gera os 3 entregáveis ───────────────────────────────────────
    try:
        resultado = await gerar_entregaveis(candidato, llm)
    except Exception as e:
        raise HTTPException(500, f"Falha na geração: {e}")

    # ── 5. ZIP em memória ────────────────────────────────────────────────────
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("01_CV_Otimizado.md", resultado.cv_otimizado_markdown)
        z.writestr("01_CV_Otimizado.docx", _cv_docx_bytes(resultado.cv_otimizado_estrutura))
        z.writestr(
            "02_Roteiro_LinkedIn.md",
            renderizar_roteiro_linkedin_markdown(resultado.roteiro_linkedin),
        )
        z.writestr(
            "02_Roteiro_LinkedIn.json",
            json.dumps(resultado.roteiro_linkedin, ensure_ascii=False, indent=2),
        )
        z.writestr("03_Relatorio_Premium.md", resultado.relatorio_premium_markdown)
        z.writestr(
            "03_Relatorio_Premium.docx",
            _relatorio_docx_bytes(resultado.relatorio_premium_markdown, candidato.nome),
        )
        z.writestr(
            "_diagnostico.json",
            json.dumps(resultado.diagnostico, ensure_ascii=False, indent=2),
        )
        z.writestr(
            "_dados_extraidos.json",
            json.dumps(asdict(candidato), ensure_ascii=False, indent=2),
        )

    buf.seek(0)
    filename = f"easyjob_{_slug(candidato.nome)}.zip"
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _cv_docx_bytes(estrutura: dict) -> bytes:
    with tempfile.NamedTemporaryFile(suffix=".docx", delete=False) as tmp:
        p = Path(tmp.name)
    try:
        exportar_cv_docx(estrutura, p)
        return p.read_bytes()
    finally:
        p.unlink(missing_ok=True)


def _relatorio_docx_bytes(markdown: str, nome: str) -> bytes:
    with tempfile.NamedTemporaryFile(suffix=".docx", delete=False) as tmp:
        p = Path(tmp.name)
    try:
        exportar_relatorio_premium_docx(markdown, p, nome)
        return p.read_bytes()
    finally:
        p.unlink(missing_ok=True)


def _slug(texto: str) -> str:
    import unicodedata
    t = unicodedata.normalize("NFD", (texto or "candidato").lower())
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    t = re.sub(r"[^a-z0-9]+", "_", t).strip("_")
    return t[:40] or "candidato"


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api:app", host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
