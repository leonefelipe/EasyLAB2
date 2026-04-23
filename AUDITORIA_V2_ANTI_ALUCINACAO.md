# EasyLAB2 v2 — foco no `easylab2-ai-engine`

## Correções principais

### 1. Camada anti-alucinação
- inclusão de bloco de **EVIDÊNCIAS FACTUAIS EXTRAÍDAS** no contexto do LLM
- reforço explícito nos prompts: números, percentuais, salários, tamanho de equipe e resultados **só podem aparecer se existirem literalmente nas evidências**
- saneamento pós-LLM para remover métricas não comprovadas antes de gerar o ZIP final

### 2. Keyword engine mais rígida
- remoção de stopwords em português e inglês
- extração mais focada em skills e frases relevantes
- bloqueio de termos vazios como `for`, `the`, `and`
- priorização de frases como `people management`, `existing accounts`, `inbound leads`, `salesforce`, `linkedin recruiter`

### 3. Saídas mais confiáveis
- currículo final saneado se o LLM inventar números
- roteiro de LinkedIn saneado se o LLM inventar métricas ou liderança não comprovada
- relatório premium recebe nota metodológica factual
- `_diagnostico.json` passa a incluir `avisos_fatuais`

## Resultado esperado
Esta versão não promete “texto mais bonito”. Ela prioriza:
- **verdade factual**
- **coerência com o material enviado**
- **redução drástica de alucinações**
- **melhor aderência ao uso real da consultoria**

## Observação importante
Esta v2 melhora muito a confiança do motor, mas ainda depende da qualidade do material de entrada.
Se o currículo original não trouxer métricas, o sistema deve:
- reescrever com verbo forte e escopo
- sugerir onde incluir números comprováveis
- evitar inventar resultados
