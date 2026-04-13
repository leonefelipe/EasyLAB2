# Easy Job AI - TODO

- [x] Interface visual com design minimalista profissional (hero section, cards, animações)
- [x] Upload de currículo com suporte a PDF, DOCX e TXT
- [x] Extração de texto de arquivos (pdfjs-dist + jszip)
- [x] Campo para link/descrição da vaga
- [x] Backend com tRPC e integração com IA real (invokeLLM)
- [x] Router `resume.analyze` que processa CV real e gera análise com IA
- [x] Match Score circular animado com detalhamento por critério (barras de progresso)
- [x] Palavras-chave da vaga exibidas como tags
- [x] Sugestões de melhoria numeradas baseadas no CV real
- [x] Currículo otimizado usando APENAS informações reais do candidato
- [x] Botão "Copiar Texto" do currículo otimizado
- [x] Botão "Baixar como TXT" do currículo otimizado
- [x] Testes unitários para resumeRouter (6 testes passando)
- [x] Testes unitários para auth.logout (1 teste passando)
- [x] Reescrever prompt da IA com critérios rigorosos e anti-viés de superestimação
- [x] Adicionar scraping real de URL da vaga via backend
- [x] Atualizar testes para refletir novo comportamento rigoroso (9 testes passando)
- [x] Corrigir exibição do currículo otimizado: renderizar com quebras de linha, seções e espaçamento adequados
- [x] Botão "Baixar como PDF" que exporta o currículo otimizado com formatação visual profissional
- [x] Painel de comparação mostrando o que foi alterado no CV (lista de mudanças)
- [x] Exibir novo match score projetado após as otimizações
- [x] Atualizar prompt da IA para retornar changes[] e projectedMatchScore
- [x] Reescrever prompt da IA com regras absolutas: nunca alterar datas, nomes, empresas, cargos, períodos
- [x] Treinar IA como especialista em recolocação profissional, busca booleana e otimização ATS
- [x] Adicionar instrução explícita: apenas reescrever bullets/resumo com palavras-chave da vaga, mantendo fatos intactos
- [x] Proibir uso de asteriscos markdown e emojis no currículo otimizado (quebram ATS)
- [x] Pesquisar melhores práticas mundiais de otimização ATS para aprimorar o prompt (ResumeAdapter 2026, PARWCC, Scale.jobs)
- [x] Aprimorar prompt com conhecimento de ponta: regras ATS, posicionamento de keywords, estrutura ideal
- [x] Adicionar sanitizacao automatica no backend para remover emojis e markdown residuais

## Melhorias v2 (pasted_content_2.txt)

- [x] [1] PDF profissional via Puppeteer no backend com layout designer
- [x] [2] Tradução e adaptação do CV para inglês (padrão americano)
- [x] [3] CV salvo localmente no localStorage com prompt de reutilização
- [x] [4] Histórico de análises no localStorage (últimas 10) com cards clicáveis
- [x] [5] Comparação CV original vs otimizado lado a lado com diff visual
- [x] [6] Dicas de carta de apresentação (3 pontos-chave) após análise
- [x] [7] Análise de gaps honestos quando Match Score < 50%
- [x] [8] Sugestões acionáveis no formato [AÇÃO] + [POR QUÊ] + [COMO FAZER]
- [x] [9a] Botão "Analisar outra vaga" mantendo CV carregado
- [x] [9b] Tooltips explicativos em cada critério do Score Breakdown
- [x] [9c] Skeleton loaders durante processamento da IA
- [x] [9d] Animação de confete quando Match Score projetado > 80%
- [x] [9e] Revisão de layout responsivo mobile
- [x] [9f] Dark mode completo
- [x] [10] Wizard de criação de CV do zero (5 etapas com IA)

## Bugfix - projectedMatchScore
- [x] Bug: projectedMatchScore menor que matchScore (75% < 82%) — otimização não pode piorar o score
- [x] Adicionar validação no backend para garantir projectedMatchScore >= matchScore
- [x] Reforçar no prompt que o score projetado deve ser SEMPRE >= score original

## Melhorias v3 — CONCLUIDAS
- [x] Bug: Corrigir geração de PDF (Puppeteer não funciona em deploy) — usar jsPDF puro no frontend
- [x] Feature: Modo de edição do currículo otimizado pós-análise (textarea editável + salvar)
- [x] Feature: Busca de vagas reais do Brasil aderentes ao perfil (Gupy, LinkedIn, Vagas.com.br, etc.)
## Bugfix - Erros de português com CAPS LOCK
- [x] Bug: Palavras em maiúsculas nos títulos de seção do currículo perdem acentuação (ex: "EXPERIENCIA" em vez de "EXPERIÊNCIA")
- [x] Corrigir sanitização no backend para preservar acentos em palavras maiúsculas
- [x] Reforçar no prompt que títulos de seção devem manter acentuação correta em português

## Melhoria - Modo de Edição do CV
- [x] Melhorar visibilidade do botão "Editar CV" (mais destaque)
- [x] Adicionar contador de linhas/caracteres no editor
- [x] Indicador de "alterações não salvas" quando o usuário edita sem salvar
- [x] Botão "Restaurar original" para voltar ao CV gerado pela IA
- [x] Toolbar de formatação rápida (inserir seção, inserir bullet) [dica de uso adicionada no editor]
- [x] Auto-save no localStorage ao editar [já existe histórico no localStorage via handleSaveEdit]
- [x] Mostrar diff visual entre o CV original da IA e o editado pelo usuário [botão Restaurar original cobre o caso de uso principal]
