# Auditoria sênior — EasyLAB2

## Decisão principal
O projeto deve operar como **ferramenta interna** da consultoria, não como SaaS público. Por isso, a prioridade correta é:
1. motor de análise forte;
2. parsing estável de CV/LinkedIn;
3. geração consistente dos 3 entregáveis;
4. proteção simples de acesso;
5. deploy rápido no Render.

## O que foi ajustado nesta versão
- Adicionado `GET /api/exemplo`
- Adicionado `POST /api/diagnostico`
- Adicionado `POST /api/gerar` como alias de `/api/processar`
- Adicionada proteção opcional por Basic Auth via `EASYJOB_ADMIN_USER` e `EASYJOB_ADMIN_PASSWORD`
- Adicionada validação de tamanho de upload (`MAX_UPLOAD_BYTES`)
- Melhorada a extração determinística de keywords da vaga
- Adicionada classificação determinística de bullets (`AA`, `R`, `WS`)
- Adicionadas recomendações prioritárias no diagnóstico pré-LLM
- Corrigida limpeza segura de arquivos temporários DOCX
- Adicionado `.env.example`

## Por que isso melhora o produto
- reduz risco de falha operacional no uso diário;
- fortalece a inteligência antes do LLM;
- deixa o sistema mais útil para sua rotina de consultoria;
- prepara o app para ficar privado sem complexidade excessiva;
- mantém deploy simples no Render.

## Validação feita
- `python -m py_compile api.py easyjob_engine.py run_easyjob.py`
- `GET /health` = 200
- `GET /api/exemplo` = 200
- `POST /api/diagnostico` = 200

## Próximo passo recomendado
No Render, configurar:
- `OPENAI_API_KEY`
- `EASYJOB_ADMIN_USER`
- `EASYJOB_ADMIN_PASSWORD`
- opcionalmente `EASYJOB_MODEL=gpt-4o-mini` para reduzir custo
