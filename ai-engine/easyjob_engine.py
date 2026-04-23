"""
easyjob_engine.py — Método EasyJob por Felipe Leone

Motor pragmático de otimização de currículo e LinkedIn.
Gera 3 entregáveis a partir dos dados crus do candidato:

  1. CV Otimizado        — documento ATS-aligned (Gupy, Greenhouse, Workday, iCIMS)
  2. Roteiro de LinkedIn — instruções diretas e acionáveis de alteração do perfil
  3. Relatório Premium   — documento executivo que demonstra o valor do serviço

Arquitetura:
  - OpenAI API (chat.completions, modo JSON).
  - 3 chamadas LLM em paralelo (asyncio), cada uma com system prompt especializado.
  - Pré-scoring determinístico (ATS) injetado como âncora no contexto do LLM.
  - Saídas em JSON estruturado + render final em Markdown.

Dependências:
    pip install openai
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import unicodedata
from dataclasses import dataclass, field, asdict
from typing import Any
from collections import Counter
from copy import deepcopy

from openai import AsyncOpenAI


# ═══════════════════════════════════════════════════════════════════════════════
# 1. CONFIGURAÇÃO
# ═══════════════════════════════════════════════════════════════════════════════

MODEL_ID = os.environ.get("EASYJOB_MODEL", "gpt-4o")   # troque para gpt-4o-mini p/ custo
MAX_TOKENS_PER_CALL = 8000
TEMPERATURE = 0.2


# ═══════════════════════════════════════════════════════════════════════════════
# 2. TIPOS DE ENTRADA E SAÍDA
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class DadosCandidato:
    """Payload cru do candidato. Campos opcionais degradam graciosamente."""
    nome: str
    contato: dict[str, str]                     # email, telefone, cidade, linkedin
    titulo_atual: str
    resumo_atual: str = ""
    experiencias: list[dict[str, Any]] = field(default_factory=list)
    formacao: list[dict[str, Any]] = field(default_factory=list)
    certificacoes: list[str] = field(default_factory=list)
    idiomas: list[dict[str, str]] = field(default_factory=list)
    habilidades_declaradas: list[str] = field(default_factory=list)
    vaga_alvo: dict[str, Any] | None = None     # {titulo, descricao, empresa, senioridade}
    objetivo_carreira: str = ""


@dataclass
class Entregaveis:
    cv_otimizado_markdown: str
    cv_otimizado_estrutura: dict[str, Any]
    roteiro_linkedin: dict[str, Any]
    relatorio_premium_markdown: str
    diagnostico: dict[str, Any]


# ═══════════════════════════════════════════════════════════════════════════════
# 3. PRÉ-SCORING DETERMINÍSTICO (âncora para o LLM)
# ═══════════════════════════════════════════════════════════════════════════════

def _normalizar(texto: str) -> str:
    t = unicodedata.normalize("NFD", texto.lower())
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    t = re.sub(r"[^a-z0-9 ]", " ", t)
    return re.sub(r"\s+", " ", t).strip()


EN_STOPWORDS = {
    "the","and","for","with","from","that","this","your","their","our","you","will","have","has","had","are","were","was","been","into","within","across","across","every","each","all","new","existing","using","use","used","through","about","just","not","but","also","than","across","someone","looking","someone","position","role","team","teams","manager","lead","leader","supervisor","business","inside","sales","structure","directly","responsible","responsibilities","requirements","experience","strong","skills","skill","mindset","operational","contribute","evolving","engine"
}

PT_STOPWORDS = {
    "para","com","uma","das","dos","que","ser","sao","são","por","nos","nas","mais","anos","ano","sobre","experiencia","experiência","responsavel","responsável","vaga","cargo","empresa","perfil","profissional","atuacao","atuação","requisitos","atividades","desejavel","desejável","conhecimento","habilidades","gestao","gestão","time","times","equipe","equipes"
}

SKILL_PHRASES = [
    "people management","gestao de pessoas","gestão de pessoas","team leadership","leadership","team management","sdr","sdr team","sales development","inbound leads","outbound","existing accounts","new business","inside sales","saas","crm","salesforce","hubspot","pipedrive","linkedin recruiter","linkedin sales navigator","apollo.io","account based marketing","abm","spin selling","bant","meddic","pipeline management","lead qualification","qualificacao de leads","qualificação de leads","analytical skills","analise de dados","análise de dados","ai first","artificial intelligence","inteligencia artificial","inteligência artificial"
]

RISKY_TERMS = {
    "reduziu","aumentou","cresceu","gerou","expandiu","fechou","conduziu","liderou","qualificou","melhorou","otimizou","elevou","time-to-hire","receita","vendas","clientes","leads","conversao","conversão","contratos","r$","usd","%"
}

def _tokenizar_sem_stopwords(texto: str) -> list[str]:
    norm = _normalizar(texto)
    return [t for t in norm.split() if len(t) >= 3 and t not in EN_STOPWORDS and t not in PT_STOPWORDS]


def _extrair_palavras_chave_vaga(descricao: str, titulo: str = "") -> list[str]:
    """Extração mais rígida: remove stopwords e prioriza competências/phrases úteis."""
    if not descricao and not titulo:
        return []
    bruto = f"{titulo}\n{descricao}"
    norm = _normalizar(bruto)

    encontrados: list[str] = []
    for termo in SKILL_PHRASES:
        if _normalizar(termo) in norm:
            encontrados.append(termo.lower())

    # captura expressões simples que aparecem em responsabilidades/requisitos
    for pat in [
        r"\b(?:python|sql|aws|excel|tableau|power bi|looker|workday|greenhouse|gupy|icims)\b",
        r"\b(?:fintech|healthtech|edtech|saas|b2b|b2c|rh tech|iot)\b",
        r"\b(?:people management|team leadership|ai first|analytical skills|existing accounts|new business|inbound leads)\b",
    ]:
        encontrados.extend(re.findall(pat, norm))

    tokens = _tokenizar_sem_stopwords(bruto)
    freq = Counter(tokens)
    title_tokens = set(_tokenizar_sem_stopwords(titulo))
    allow = {"people","management","existing","accounts","inbound","outbound","qualification","qualificacao","qualificação","analytics","analytical","data"}
    for tok, n in freq.most_common(100):
        if tok in title_tokens or tok in allow or n >= 2:
            if tok not in EN_STOPWORDS and tok not in PT_STOPWORDS:
                encontrados.append(tok)

    # de-dup e remove termos vazios demais
    limpos=[]
    seen=set()
    banned={"for","the","and","with","that","this","role","position","team","teams","structure","directly","responsible","experience"}
    for item in encontrados:
        key=_normalizar(item)
        if not key or key in banned or len(key) < 3:
            continue
        if key not in seen:
            seen.add(key)
            limpos.append(item)
    return limpos[:60]


def _classificar_bullet(bullet: str) -> str:
    b = _normalizar(bullet)
    verbos_fortes = {
        "liderou", "liderar", "implementou", "reduziu", "aumentou", "otimizou", "estruturou",
        "definiu", "conduziu", "criou", "desenvolveu", "escalou", "reestruturou", "aprovou",
        "negociou", "gerenciou", "coordenou", "executou", "implantou", "melhorou", "elevou",
    }
    tem_verbo = any(v in b for v in verbos_fortes)
    tem_numero = bool(re.search(r"\d", bullet))
    tem_metrica = bool(re.search(r"\d+\s*(%|mil|milh|k|m|dias|meses|anos|pessoas|usuarios|usuários|clientes|bps|x|r\$|usd)", b))
    tem_escopo = any(s in b for s in ["equipe", "time", "produto", "budget", "orcamento", "orçamento", "regiao", "região", "clientes", "stakeholders", "operacao", "operação"])
    if tem_verbo and (tem_metrica or (tem_numero and tem_escopo)):
        return "AA"
    if tem_verbo or tem_escopo:
        return "R"
    return "WS"


def pre_score_ats(candidato: DadosCandidato) -> dict[str, Any]:
    """
    Cálculo determinístico de 5 componentes (soma=100) alinhado à literatura:
      - Keyword Match  (30)  → aderência léxica vaga/CV
      - Experience     (25)  → anos vs. anos requeridos
      - Seniority      (20)  → sinais de autonomia e escopo
      - Impacto (XYZ)  (15)  → bullets com métrica explícita
      - Estrutura      (10)  → layout ATS-friendly (headings, bullets)
    """
    cv_texto = _serializar_cv_como_texto(candidato)
    cv_norm = _normalizar(cv_texto)

    # --- Keyword match ---------------------------------------------------------
    vaga_desc = (candidato.vaga_alvo or {}).get("descricao", "")
    kws = _extrair_palavras_chave_vaga(vaga_desc, (candidato.vaga_alvo or {}).get("titulo", ""))
    matches = [k for k in kws if k in cv_norm]
    missing = [k for k in kws if k not in cv_norm]
    km = (len(matches) / max(len(kws), 1)) * 30 if kws else 15

    # --- Experience ------------------------------------------------------------
    anos_candidato = sum(
        (exp.get("anos") or 0) for exp in candidato.experiencias
    )
    anos_requeridos = (candidato.vaga_alvo or {}).get("anos_requeridos", 0) or 5
    exp = min(anos_candidato / max(anos_requeridos, 1), 1.0) * 25

    # --- Seniority signals -----------------------------------------------------
    sinais_senioridade = [
        "liderou", "gerenciou", "definiu", "aprovou", "estrategic", "p&l",
        "orcamento", "diretor", "head", "coordenou", "reportava",
    ]
    sen_hits = sum(1 for s in sinais_senioridade if s in cv_norm)
    seniority = min(sen_hits / 5, 1.0) * 20

    # --- Impacto / XYZ ---------------------------------------------------------
    bullets_todos: list[str] = []
    for e in candidato.experiencias:
        bullets_todos += e.get("bullets", []) or []
    classificacoes = [_classificar_bullet(b) for b in bullets_todos]
    aa = sum(1 for c in classificacoes if c == "AA")
    rr = sum(1 for c in classificacoes if c == "R")
    ws = sum(1 for c in classificacoes if c == "WS")
    com_metrica = aa
    total_bullets = max(len(bullets_todos), 1)
    impacto = min((aa + rr * 0.45) / total_bullets, 1.0) * 15

    # --- Estrutura -------------------------------------------------------------
    tem_secoes = all([
        candidato.experiencias,
        candidato.formacao,
        candidato.contato.get("email"),
        candidato.titulo_atual,
    ])
    estrutura = 10.0 if tem_secoes else 6.0

    total = round(km + exp + seniority + impacto + estrutura, 1)

    recomendacoes = []
    if missing[:10]:
        recomendacoes.append(f"Incorporar em contexto as keywords críticas faltantes: {', '.join(missing[:10])}.")
    if ws:
        recomendacoes.append(f"Reescrever {ws} bullet(s) fraco(s) em formato XYZ com verbo forte e escopo explícito.")
    if aa / total_bullets < 0.7:
        recomendacoes.append("Elevar a proporção de achievements com métrica para pelo menos 70% dos bullets.")
    if seniority < 10:
        recomendacoes.append("Explicitar sinais de senioridade: equipe, orçamento, autonomia, escopo, stakeholders, P&L.")
    if estrutura < 10:
        recomendacoes.append("Completar contato, formação e heading principal para maximizar parsing ATS.")

    return {
        "ats_score_atual": total,
        "componentes": {
            "keyword_match": round(km, 1),
            "experience": round(exp, 1),
            "seniority": round(seniority, 1),
            "impacto_xyz": round(impacto, 1),
            "estrutura": round(estrutura, 1),
        },
        "keywords_matched": matches,
        "keywords_missing": missing[:20],
        "bullets_totais": total_bullets,
        "bullets_com_metrica": com_metrica,
        "ratio_achievement": round(aa / total_bullets, 2),
        "classificacao_bullets": {"AA": aa, "R": rr, "WS": ws},
        "recomendacoes_prioritarias": recomendacoes,
    }


def _serializar_cv_como_texto(c: DadosCandidato) -> str:
    partes = [c.nome, c.titulo_atual, c.resumo_atual]
    for exp in c.experiencias:
        partes.append(f"{exp.get('cargo','')} {exp.get('empresa','')} {exp.get('periodo','')}")
        partes.extend(exp.get("bullets", []) or [])
    for f in c.formacao:
        partes.append(f"{f.get('curso','')} {f.get('instituicao','')}")
    partes.extend(c.habilidades_declaradas)
    partes.extend(c.certificacoes)
    return "\n".join(str(p) for p in partes if p)


def _coletar_evidencias(c: DadosCandidato) -> dict[str, Any]:
    texto = _serializar_cv_como_texto(c)
    linkedin = c.contato.get("linkedin", "")
    base = _normalizar(texto)
    numeros = sorted(set(re.findall(r"(?:R\$\s*)?\d+[\d\.,]*%?", texto)))
    titulos = [e.get("cargo", "") for e in c.experiencias if e.get("cargo")]
    empresas = [e.get("empresa", "") for e in c.experiencias if e.get("empresa")]
    bullets = []
    for e in c.experiencias:
        for b in e.get("bullets", []) or []:
            bullets.append({"cargo": e.get("cargo", ""), "empresa": e.get("empresa", ""), "texto": b})
    return {
        "numeros_explicitos": numeros,
        "titulos_exatos": titulos,
        "empresas_exatas": empresas,
        "bullets_originais": bullets,
        "habilidades_declaradas": c.habilidades_declaradas,
        "resumo_atual": c.resumo_atual,
        "texto_normalizado": base[:20000],
        "linkedin": linkedin,
    }


def _sanitizar_linha_factual(texto: str, evidencias: dict[str, Any]) -> tuple[str, bool]:
    original = texto
    numeros_saida = re.findall(r"(?:R\$\s*)?\d+[\d\.,]*%?", texto)
    numeros_ok = set(evidencias.get("numeros_explicitos", []))
    unsupported = [n for n in numeros_saida if n not in numeros_ok]
    if unsupported:
        texto = re.sub(r"(?:R\$\s*)?\d+[\d\.,]*%?\+?", "", texto)
        texto = re.sub(r"\s{2,}", " ", texto).strip(" ,.-")
    # remove construções fortes demais quando faltou evidência numérica
    norm = _normalizar(texto)
    if unsupported and any(term in norm for term in RISKY_TERMS):
        texto = texto.rstrip('.;:') + " (métrica não informada no material original)."
    changed = texto != original
    return texto, changed


def _sanitizar_cv_estrutura(cv: dict[str, Any], evidencias: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
    out = deepcopy(cv)
    avisos=[]
    # resumo
    out["resumo_executivo"], changed = _sanitizar_linha_factual(out.get("resumo_executivo", ""), evidencias)
    if changed:
        avisos.append("Resumo executivo continha números/afirmações não comprovados e foi saneado.")
    aa_count=0; r_count=0
    for exp in out.get("experiencias", []):
        new_bullets=[]
        for b in exp.get("bullets", []):
            texto = b.get("texto", "")
            texto2, changed = _sanitizar_linha_factual(texto, evidencias)
            if changed:
                avisos.append(f"Bullet saneado em {exp.get('empresa','empresa')}: removida métrica não comprovada.")
            cls = b.get("classificacao", "R")
            if re.search(r"(?:R\$\s*)?\d+[\d\.,]*%?", texto2):
                cls = "AA"
                aa_count += 1
            else:
                cls = "R"
                r_count += 1
            new_bullets.append({"texto": texto2, "classificacao": cls})
        exp["bullets"] = new_bullets
    meta = out.setdefault("metadados", {})
    meta["avisos_saneamento"] = list(dict.fromkeys(avisos))
    meta["bullets_aa"] = aa_count
    meta["bullets_r"] = r_count
    return out, list(dict.fromkeys(avisos))


def _sanitizar_linkedin(roteiro: dict[str, Any], evidencias: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
    out = deepcopy(roteiro)
    avisos=[]
    for path in [
        ("headline","recomendado"),
        ("sobre","recomendado_completo"),
    ]:
        d=out
        for key in path[:-1]: d=d.setdefault(key,{})
        last=path[-1]
        d[last], changed = _sanitizar_linha_factual(d.get(last,""), evidencias)
        if changed: avisos.append(f"{'.'.join(path)} saneado por conter afirmação não comprovada.")
    for exp in out.get("experiencia", []):
        exp["bullet_modelo"], changed = _sanitizar_linha_factual(exp.get("bullet_modelo", ""), evidencias)
        if changed: avisos.append(f"Bullet modelo de LinkedIn saneado em {exp.get('empresa','empresa')}." )
    out["avisos_fatuais"] = list(dict.fromkeys(avisos))
    return out, list(dict.fromkeys(avisos))


def _sanitizar_relatorio(markdown: str, evidencias: dict[str, Any], diagnostico: dict[str, Any]) -> tuple[str, list[str]]:
    avisos=[]
    linhas=[]
    for linha in markdown.splitlines():
        nova, changed = _sanitizar_linha_factual(linha, evidencias)
        if changed:
            avisos.append("Linha do relatório saneada por conter afirmação numérica não comprovada.")
        linhas.append(nova)
    # injeta nota factual
    nota = (
        "\n> Nota metodológica: números e métricas só são tratados como fatos quando aparecem no material original. "
        "Quando não há comprovação documental, as recomendações são interpretativas e devem ser validadas antes do uso final.\n"
    )
    texto = "\n".join(linhas)
    if "Nota metodológica" not in texto:
        texto += nota
    return texto, list(dict.fromkeys(avisos))


def _montar_user_content(c: DadosCandidato, diagnostico: dict) -> str:
    evidencias = _coletar_evidencias(c)
    return (
        "### DADOS DO CANDIDATO (JSON cru)\n"
        f"{json.dumps(asdict(c), ensure_ascii=False, indent=2)}\n\n"
        "### DIAGNÓSTICO DETERMINÍSTICO PRÉ-LLM (âncora de calibração)\n"
        f"{json.dumps(diagnostico, ensure_ascii=False, indent=2)}\n\n"
        "### EVIDÊNCIAS FACTUAIS EXTRAÍDAS (NÃO INVENTAR NADA ALÉM DISSO)\n"
        f"{json.dumps(evidencias, ensure_ascii=False, indent=2)}\n\n"
        "Execute o mandato conforme o system prompt. Responda no schema definido. "
        "Toda afirmação quantitativa precisa existir em EVIDÊNCIAS FACTUAIS. "
        "Se a prova não existir, escreva sem número e marque a recomendação como sugestão condicional."
    )


# ═══════════════════════════════════════════════════════════════════════════════
# 4. SYSTEM PROMPTS (tom executivo, base nos 4 estudos)
# ═══════════════════════════════════════════════════════════════════════════════

SYSTEM_CV_OTIMIZADO = """Você é um Arquiteto de Currículos Executivos do Método EasyJob por Felipe Leone, consultor sênior com trajetória em headhunting na Robert Half e domínio operacional de Salesforce/Spotlight, LinkedIn Recruiter, Gupy, Greenhouse, Workday e iCIMS.

## Mandato
Produzir um currículo em português-Brasil que atenda simultaneamente a dois avaliadores com arquiteturas cognitivas opostas: o sistema ATS (parser léxico + ranking algorítmico) e o gestor humano sob restrição de atenção de 6 a 10 segundos (padrão de leitura em F).

## Fundamentos técnicos obrigatórios
1. **Padrão XYZ (Google/Harvard/Columbia)** para cada bullet:
   "[Verbo de ação forte no passado] + [X = resultado mensurado] + [Y = métrica/contexto quantitativo] + [Z = método/ação]."
   Exemplo: "Reduziu custo de aquisição de talento em 28% em 6 meses, reestruturando a cadeia de sourcing ativo no LinkedIn Recruiter e Gupy."

2. **Front-loading quantitativo**: a métrica aparece antes da metodologia. Dado crítico no início do bullet, não no final.

3. **Classificação AA / R / WS**:
   - Achievement (AA) = verbo forte + métrica + escopo (padrão-ouro)
   - Responsibility (R) = escopo sem métrica (aceitável em volume reduzido)
   - Weak Statement (WS) = genérico, sem verbo forte, sem métrica (proibido)
   Meta de composição: ≥ 70% AA, ≤ 30% R, 0% WS.

4. **Layout ATS-aligned** (regras de parsing):
   - Headings padronizados: RESUMO EXECUTIVO, EXPERIÊNCIA PROFISSIONAL, FORMAÇÃO, CERTIFICAÇÕES, IDIOMAS, COMPETÊNCIAS
   - Uma coluna única. Sem tabelas, caixas de texto, ícones decorativos, imagens, cabeçalhos/rodapés estruturais
   - Datas no formato MM/AAAA – MM/AAAA alinhadas à direita do cargo
   - Fonte implícita: Arial/Calibri/Aptos 10-12pt (o consumidor formatará)
   - Margem mínima de 0,5 polegadas
   - Ordem cronológica inversa

5. **Densidade de palavras-chave**:
   - 1 página: 400-500 palavras, densidade 2-3%, 8-15 keywords críticas
   - 2 páginas: 500-800 palavras, densidade 1,5-2,5%, 12-20 keywords críticas
   Keywords embutidas EM CONTEXTO de realização (nunca listas cruas ou texto branco).

6. **Sinais de senioridade e progressão**:
   - Verbos de governança: liderou, definiu, aprovou, estabeleceu, estruturou, conduziu
   - Escopo explícito: tamanho de equipe, orçamento gerido, região/produto, reporte hierárquico
   - Promoções internas consolidadas com sub-bullets por cargo dentro da mesma empresa

7. **Resumo Executivo (Value Proposition)** nas 3 primeiras linhas:
   [Senioridade + área] + [resultado primário com métrica] + [diferencial único] + [tipo de desafio ideal].
   Máximo 4 linhas. Zero pronome de 1ª pessoa. Zero clichê ("proativo", "dinâmico", "resiliente").

## Diretrizes editoriais inegociáveis
- Tom: executivo, direto, neutro. Eliminar qualquer pronome pessoal ("Eu", "meu", "nós").
- Eliminar adjetivos vazios e frases de autoavaliação.
- Reescrever cada bullet fraco até que ele se enquadre em AA ou R forte.
- Se a vaga-alvo for informada: alinhar léxico, senioridade declarada e escopo ao edital.
- Se a vaga-alvo NÃO for informada: otimizar para o cluster de cargos mais próximo do título atual do candidato.

## Proibições estritas
- Nada de "hackear", "burlar", "driblar" sistemas. A abordagem é de **alinhamento estratégico** e **otimização de perfil**.
- Nada de keyword stuffing, texto invisível, prompt injection, seções falsas.
- Nada de métricas inventadas. Se o candidato não forneceu o número, reescreva sem número, com verbo forte e escopo, e nunca use placeholders numéricos. Toda métrica deve existir literalmente no bloco EVIDÊNCIAS FACTUAIS.

## Saída obrigatória
Responda ESTRITAMENTE em JSON válido, sem texto fora do JSON, no schema:

{
  "cabecalho": {
    "nome": "...",
    "titulo_profissional": "... | Setor | Foco técnico",
    "linha_contato": "Cidade, UF · email · telefone · LinkedIn"
  },
  "resumo_executivo": "string de 3-4 linhas, front-loaded, sem pronomes",
  "experiencias": [
    {
      "cargo": "...",
      "empresa": "...",
      "local": "...",
      "periodo": "MM/AAAA – MM/AAAA",
      "contexto": "1 linha opcional de contexto de empresa/escopo",
      "bullets": [
        {"texto": "bullet XYZ...", "classificacao": "AA|R"}
      ]
    }
  ],
  "formacao": [{"curso": "...", "instituicao": "...", "periodo": "...", "detalhe": "opcional"}],
  "certificacoes": ["..."],
  "idiomas": [{"idioma": "...", "nivel": "..."}],
  "competencias": {
    "tecnicas": ["..."],
    "ferramentas": ["..."],
    "negocios": ["..."],
    "lideranca": ["..."]
  },
  "metadados": {
    "palavras_chave_injetadas": ["..."],
    "bullets_aa": 0,
    "bullets_r": 0,
    "bullets_ws_removidos": 0,
    "densidade_keywords_pct": 0.0,
    "ats_score_estimado_pos_otimizacao": 0
  }
}
"""


SYSTEM_LINKEDIN = """Você é Consultor de Posicionamento Digital do Método EasyJob por Felipe Leone, especialista em arquitetura de marca pessoal corporativa no LinkedIn com referencial metodológico calibrado pelas escolas de Marc Tawil (liderança de pensamento C-Level), Daniela Souza (linguística aplicada a B2B) e Rodrigo Moubar (higiene algorítmica / SSI).

## Mandato
Produzir um ROTEIRO OPERACIONAL DE ALTERAÇÃO DO PERFIL. Não um perfil genérico — uma lista de mudanças exatas, campo a campo, prontas para copiar e colar. Cada item do roteiro deve indicar: (a) o que está no perfil hoje, (b) o que deve passar a estar, (c) a razão estratégica.

## Arquitetura do perfil (elementos críticos, em ordem de prioridade)

1. **Headline (220 caracteres)**
   Fórmula executiva: "[CARGO SÊNIOR] | [SETOR] | [FOCO TÉCNICO / PROPOSTA DE VALOR QUANTIFICADA]"
   Exemplo: "Senior Talent Acquisition Manager | Tech & SaaS | Gupy, Greenhouse, Boolean Sourcing · Redução de 40% no time-to-hire"
   Regras:
   - Peso máximo de keywords de busca booleana (recrutadores buscam por cargo + ferramenta + setor).
   - Zero emojis ornamentais. Uso moderado do pipe (|) como separador.
   - Nunca usar rótulos amadores ("apaixonado por...", "humano antes de profissional", "em busca de oportunidade" salvo último caso). É proibido declarar resultado quantitativo ou liderança de equipe sem evidência literal.

2. **Sobre / About (até 2.600 caracteres, ideal 1.200-1.800)**
   Estrutura obrigatória em 4 blocos curtos (não em parágrafo único):
   - Bloco 1 (2-3 linhas): Quem você é profissionalmente + resultado-assinatura com métrica.
   - Bloco 2 (4-6 linhas): Áreas de domínio técnico e metodológico (lista textual, não bullet).
   - Bloco 3 (3-4 linhas): Resultados mais relevantes em números.
   - Bloco 4 (2-3 linhas): Tipo de desafio/projeto/empresa com a qual você quer conversar. Call-to-action discreta (e-mail ou "direct aqui").
   Tom: 1ª pessoa moderada (eu, não "ele/ela"), executiva, sem clichê motivacional.

3. **Experiência**
   Cada cargo: replicar estrutura de bullets XYZ do CV, mas com liberdade narrativa 10-20% maior (o LinkedIn permite contexto em 1ª pessoa). Adicionar tags de mídia/links de projetos em cargos em que isso agregue prova.

4. **Competências / Skills (máx. 50, fixar 3 no topo)**
   Os 3 fixados devem ser: (i) a hard skill mais central ao cargo-alvo, (ii) a ferramenta/plataforma mais buscada por recrutadores do setor, (iii) a competência de liderança ou domínio estratégico do nível atual.

5. **Featured (seção "Em destaque")**
   3-5 itens: portfólio, artigo autoral, case de resultado, certificação premium, apresentação pública. Evidência tangível, não captura de tela decorativa.

6. **Recomendações**
   Meta mínima: 5 recomendações escritas, de perfis com autoridade relativa (ex-gestor direto, cliente sênior, par de outra área). Sem grupos de troca mútua — endossos de baixa credibilidade são detectáveis e corroem o SSI percebido.

7. **Atividade / Publicação (Liderança de Pensamento)**
   Cadência recomendada: 2-3 publicações por semana nas primeiras 8 semanas para reinjetar sinal algorítmico. Formato: 70% repertório técnico-autoral (camadas de consciência de mercado), 20% comentário em publicações de pares sêniores, 10% compartilhamento de conteúdo de terceiros com análise própria. Nunca conteúdo estritamente pessoal no feed principal.

8. **Higiene algorítmica e SSI**
   Sinais que o perfil deve emitir regularmente:
   - Completude: 100% (foto profissional, banner alinhado à proposta de valor, localização, setor)
   - Interação qualificada: comentários densos (≥ 2 linhas) em 3-5 publicações por semana de tomadores de decisão do setor
   - Rede: crescimento orgânico para 500+ conexões relevantes (decisores, pares sêniores, recrutadores especializados no vertical)
   - Mensagens diretas: respostas rápidas, tom executivo, zero copy-paste

## Proibições estritas
- Nada de "hackear", "burlar", "forçar o algoritmo". Vocabulário: "alinhamento", "otimização", "posicionamento", "densidade de sinal".
- Nada de grupos de troca forçada de recomendações.
- Nada de frases como "em busca de nova oportunidade" no headline salvo caso o roteiro defina estrategicamente (e mesmo assim em formato executivo: "Aberto a desafios sêniores em [área]").
- Nada de copy-paste de descrições de vaga nos bullets.

## Saída obrigatória
JSON estritamente neste schema:

{
  "headline": {
    "atual": "...",
    "recomendado": "...",
    "racional": "..."
  },
  "sobre": {
    "atual_resumo": "...",
    "recomendado_completo": "texto pronto para colar, 4 blocos separados por \\n\\n",
    "racional": "..."
  },
  "experiencia": [
    {
      "empresa": "...",
      "cargo": "...",
      "alteracoes_prioritarias": ["...", "..."],
      "bullet_modelo": "..."
    }
  ],
  "competencias_fixadas_top3": ["...", "...", "..."],
  "competencias_adicionar": ["..."],
  "competencias_remover": ["..."],
  "featured_sugestoes": ["..."],
  "recomendacoes": {
    "meta": 5,
    "alvos_sugeridos": ["ex-gestor direto em X", "cliente sênior em Y", "..."]
  },
  "plano_conteudo_8_semanas": [
    {"semana": 1, "post_1": "tema...", "post_2": "tema...", "post_3": "tema..."}
  ],
  "higiene_algoritmica": {
    "completude_atual_pct": 0,
    "acoes_imediatas": ["..."],
    "indicadores_ssi_foco": ["brand", "people", "insights", "relationships"]
  },
  "checklist_execucao": ["..."]
}
"""


SYSTEM_RELATORIO_PREMIUM = """Você é o Diretor de Estratégia do Método EasyJob por Felipe Leone (ex-Headhunter Robert Half, operador de Salesforce/Spotlight e LinkedIn Recruiter). Seu papel neste documento é produzir o **Relatório Premium de Reposicionamento** — o artefato que demonstra ao cliente o valor inestimável do serviço prestado, sob ótica executiva e corporativa.

## Mandato
Este relatório não é uma lista de mudanças — esse papel já é do Roteiro de LinkedIn e do CV Otimizado. Este documento é a **narrativa estratégica da transformação**: por que as mudanças foram feitas, qual o embasamento metodológico, qual o impacto projetado e por que o investimento se justifica. É o documento que o cliente lê uma vez e arquiva como referência. É o entregável que sustenta a precificação premium.

## Estrutura obrigatória (seguir rigorosamente, em Markdown)

# Relatório Premium de Reposicionamento Executivo
## Cliente: [nome] — [data]
## Preparado por: Felipe Leone | Método EasyJob

### 1. Sumário Executivo (1 parágrafo denso, ~8-10 linhas)
Diagnóstico inicial em 2 frases. Hipótese estratégica de reposicionamento em 2 frases. Resultados projetados quantificáveis em 2 frases. Tom executivo, sem jargão motivacional.

### 2. Diagnóstico Inicial do Perfil
- **ATS Score diagnosticado**: X/100 (decomposto nos 5 componentes com pontuação individual)
- **Leitura de 7 segundos**: o que um recrutador capturaria do perfil atual em varredura em F
- **Classificação de bullets**: X Achievements (AA), X Responsibilities (R), X Weak Statements (WS removidos)
- **Densidade de palavras-chave atual vs. ideal**
- **Sinais de senioridade detectados** (ou ausência deles)
- **Pontos críticos de risco algorítmico** (formatação, gaps, nomenclatura genérica de cargos)

### 3. Hipótese Estratégica de Reposicionamento
Argumento em prosa densa (2-3 parágrafos) sobre o posicionamento-alvo: cluster de cargos, faixa salarial estimada, tipo de empresa/setor, narrativa de autoridade a construir. Conectar a trajetória real do candidato à oportunidade de mercado. Citar verticais e tipos de empresa concretos.

### 4. Intervenções Realizadas no Currículo
Tabela ou lista estruturada das mudanças mais relevantes, cada uma com:
- **O que foi alterado** (antes → depois)
- **Fundamento metodológico** (XYZ, front-loading, AA upgrade, densidade de keyword, correção de parsing)
- **Impacto projetado** no componente de ATS score correspondente

### 5. Intervenções Realizadas no Perfil de LinkedIn
Estrutura idêntica à seção 4, mas para headline, sobre, competências fixadas, cadência de conteúdo.

### 6. Projeção de Impacto Quantitativo
- ATS Score projetado pós-otimização (com delta sobre o diagnóstico)
- Aumento projetado de aparições em buscas de recrutador no LinkedIn (faixa conservadora 30-60%)
- Faixa salarial alvo estimada (CLT e PJ) para o cluster de cargos de destino
- Tempo médio esperado até primeira entrevista qualificada (janela de 4-12 semanas, calibrada pelo vertical)

### 7. Plano de Execução Pós-Entrega (90 dias)
Cronograma em 3 blocos:
- Dias 1-7: submissões e atualização de perfil
- Dias 8-45: cadência de conteúdo + networking ativo qualificado
- Dias 46-90: ajuste iterativo de headline/about conforme aderência observada

### 8. Considerações Finais — Valor Entregue
Parágrafo de fechamento (6-8 linhas) que consolida: o capital intelectual aplicado, o diferencial metodológico (Robert Half + Salesforce/Spotlight + LinkedIn Recruiter + literatura de ATS/LLM 2025-2026), e o posicionamento do serviço como investimento em ativo de carreira, não despesa.

---
Método EasyJob por Felipe Leone
Estratégia de Carreira e Posicionamento Profissional

## Diretrizes de linguagem
- Tom: Diretor de Estratégia de uma boutique executiva. Azul-marinho sobre dourado, em prosa.
- Zero clichê motivacional. Zero "acredite em você". Zero emojis.
- Usar números sempre que possível. Quando o dado for estimativa, indicar faixa e base metodológica.
- Nunca escrever "hackear", "burlar", "driblar", "enganar" o ATS. Usar: "alinhar", "otimizar", "calibrar", "adequar à taxonomia de", "atender aos requisitos estruturais de".
- Quando citar ATS ou recrutador, trate-os como contrapartes profissionais do processo, não como adversários. É proibido consolidar como fato qualquer número, prazo, salário ou percentual ausente das evidências.

## Saída
Markdown puro, pronto para ser exportado como PDF de alta apresentação. Sem blocos de código. Sem comentários meta sobre o documento. Apenas o relatório.
"""


# ═══════════════════════════════════════════════════════════════════════════════
# 5. CLIENTE LLM (OpenAI)
# ═══════════════════════════════════════════════════════════════════════════════

class LLMClient:
    """Wrapper sobre a API oficial da OpenAI (async)."""

    def __init__(
        self,
        api_key: str | None = None,
        model: str = MODEL_ID,
        base_url: str | None = None,
    ):
        self._client = AsyncOpenAI(
            api_key=api_key or os.environ.get("OPENAI_API_KEY"),
            base_url=base_url or os.environ.get("OPENAI_BASE_URL"),
        )
        self._model = model

    async def gerar(
        self,
        system_prompt: str,
        user_content: str,
        *,
        max_tokens: int = MAX_TOKENS_PER_CALL,
        temperature: float = TEMPERATURE,
        esperar_json: bool = True,
    ) -> str:
        kwargs: dict[str, Any] = {
            "model": self._model,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ],
        }
        if esperar_json:
            kwargs["response_format"] = {"type": "json_object"}

        resp = await self._client.chat.completions.create(**kwargs)
        texto = resp.choices[0].message.content or ""
        return _extrair_json(texto) if esperar_json else texto.strip()


def _extrair_json(texto: str) -> str:
    """Desembrulha JSON de dentro de ```json ... ``` se houver."""
    texto = texto.strip()
    m = re.search(r"```(?:json)?\s*([\s\S]+?)\s*```", texto)
    return (m.group(1) if m else texto).strip()


# ═══════════════════════════════════════════════════════════════════════════════
# 6. RENDERIZADORES
# ═══════════════════════════════════════════════════════════════════════════════

def renderizar_cv_markdown(cv: dict[str, Any]) -> str:
    cab = cv["cabecalho"]
    linhas = [
        f"# {cab['nome']}",
        f"**{cab['titulo_profissional']}**",
        cab["linha_contato"],
        "",
        "## RESUMO EXECUTIVO",
        cv["resumo_executivo"],
        "",
        "## EXPERIÊNCIA PROFISSIONAL",
    ]
    for e in cv.get("experiencias", []):
        linhas.append(f"\n### {e['cargo']} — {e['empresa']}")
        meta = " · ".join(filter(None, [e.get("local", ""), e.get("periodo", "")]))
        if meta:
            linhas.append(f"*{meta}*")
        if e.get("contexto"):
            linhas.append(e["contexto"])
        for b in e.get("bullets", []):
            linhas.append(f"- {b['texto']}")
    if cv.get("formacao"):
        linhas.append("\n## FORMAÇÃO")
        for f in cv["formacao"]:
            parte = f"- **{f.get('curso','')}**, {f.get('instituicao','')}"
            if f.get("periodo"):
                parte += f" ({f['periodo']})"
            linhas.append(parte)
    if cv.get("certificacoes"):
        linhas.append("\n## CERTIFICAÇÕES")
        for c in cv["certificacoes"]:
            linhas.append(f"- {c}")
    if cv.get("idiomas"):
        linhas.append("\n## IDIOMAS")
        for i in cv["idiomas"]:
            linhas.append(f"- {i['idioma']}: {i['nivel']}")
    comp = cv.get("competencias", {})
    if any(comp.values()):
        linhas.append("\n## COMPETÊNCIAS")
        for chave, rotulo in [
            ("tecnicas", "Técnicas"),
            ("ferramentas", "Ferramentas"),
            ("negocios", "Negócios"),
            ("lideranca", "Liderança"),
        ]:
            if comp.get(chave):
                linhas.append(f"- **{rotulo}**: {', '.join(comp[chave])}")
    return "\n".join(linhas)


# ═══════════════════════════════════════════════════════════════════════════════
# 7. MOTOR PRINCIPAL — GERAÇÃO DOS 3 ENTREGÁVEIS EM PARALELO
# ═══════════════════════════════════════════════════════════════════════════════

async def _gerar_cv(llm: LLMClient, user_content: str) -> dict:
    raw = await llm.gerar(SYSTEM_CV_OTIMIZADO, user_content)
    return json.loads(raw)


async def _gerar_linkedin(llm: LLMClient, user_content: str) -> dict:
    raw = await llm.gerar(SYSTEM_LINKEDIN, user_content)
    return json.loads(raw)


async def _gerar_relatorio(llm: LLMClient, user_content: str) -> str:
    return await llm.gerar(SYSTEM_RELATORIO_PREMIUM, user_content, esperar_json=False)


async def gerar_entregaveis(
    candidato: DadosCandidato,
    llm: LLMClient | None = None,
) -> Entregaveis:
    llm = llm or LLMClient()
    diagnostico = pre_score_ats(candidato)
    user_content = _montar_user_content(candidato, diagnostico)

    cv_estrut, roteiro, relatorio = await asyncio.gather(
        _gerar_cv(llm, user_content),
        _gerar_linkedin(llm, user_content),
        _gerar_relatorio(llm, user_content),
    )

    evidencias = _coletar_evidencias(candidato)
    cv_estrut, avisos_cv = _sanitizar_cv_estrutura(cv_estrut, evidencias)
    roteiro, avisos_li = _sanitizar_linkedin(roteiro, evidencias)
    relatorio, avisos_rel = _sanitizar_relatorio(relatorio, evidencias, diagnostico)
    diagnostico["avisos_fatuais"] = list(dict.fromkeys(avisos_cv + avisos_li + avisos_rel))

    return Entregaveis(
        cv_otimizado_markdown=renderizar_cv_markdown(cv_estrut),
        cv_otimizado_estrutura=cv_estrut,
        roteiro_linkedin=roteiro,
        relatorio_premium_markdown=relatorio,
        diagnostico=diagnostico,
    )


def gerar_entregaveis_sync(
    candidato: DadosCandidato,
    llm: LLMClient | None = None,
) -> Entregaveis:
    return asyncio.run(gerar_entregaveis(candidato, llm))
