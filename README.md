# Easy Job AI

Uma ferramenta web moderna para otimizar automaticamente seu currículo para vagas específicas, aumentando a compatibilidade com sistemas de triagem automatizada de currículos (ATS).

## 🎯 Objetivo

Easy Job AI ajuda candidatos a emprego a:

- Fazer upload de seu currículo (PDF, DOCX ou TXT)
- Analisar a compatibilidade com vagas específicas
- Receber sugestões de melhoria baseadas em análise de IA
- Gerar uma versão otimizada do currículo com palavras-chave relevantes

## 🚀 Características

### Upload de Currículo
- Suporte para múltiplos formatos: PDF, DOCX, TXT
- Extração automática de texto
- Processamento seguro no navegador

### Análise de Compatibilidade
- Match Score de 0-100% baseado em critérios ATS
- Identificação de palavras-chave da vaga
- Análise de habilidades técnicas e experiência profissional

### Sugestões de Melhoria
- Recomendações específicas para aumentar compatibilidade
- Foco em palavras-chave e ferramentas relevantes
- Dicas para destacar resultados mensuráveis

### Currículo Otimizado
- Geração automática de versão melhorada
- Incorporação de palavras-chave da vaga
- Opções para copiar ou baixar em TXT

## 🛠️ Tecnologia

- **Frontend:** React 19 + TypeScript + Tailwind CSS 4
- **Extração de Arquivos:** PDF.js, JSZip
- **UI Components:** shadcn/ui
- **Animações:** Framer Motion, Tailwind Animate
- **Notificações:** Sonner

## 📋 Critérios de Avaliação ATS

O Match Score é calculado com base em:

| Critério | Peso |
|----------|------|
| Habilidades técnicas | 30% |
| Experiência profissional | 30% |
| Palavras-chave | 20% |
| Ferramentas citadas | 10% |
| Senioridade | 10% |

## 🔧 Desenvolvimento

### Instalação

```bash
cd easy-job-ai
pnpm install
```

### Executar em Desenvolvimento

```bash
pnpm dev
```

O servidor iniciará em `http://localhost:3000`

### Build para Produção

```bash
pnpm build
pnpm start
```

## 📁 Estrutura do Projeto

```
easy-job-ai/
├── client/
│   ├── src/
│   │   ├── pages/
│   │   │   └── Home.tsx          # Página principal
│   │   ├── lib/
│   │   │   └── fileExtractor.ts  # Extração de texto de arquivos
│   │   ├── components/
│   │   │   └── ui/               # Componentes shadcn/ui
│   │   ├── App.tsx               # Roteador principal
│   │   ├── index.css             # Estilos globais e tema
│   │   └── main.tsx              # Entry point
│   ├── index.html
│   └── public/
├── server/
│   └── index.ts                  # Servidor Express
├── package.json
└── README.md
```

## 🎨 Design

A aplicação segue uma filosofia de **Minimalismo Profissional com Tipografia Contrastante**:

- **Tipografia:** Geist Bold para títulos, Inter Regular para corpo
- **Paleta de Cores:** Azul escuro profundo (#1e3a8a) com acentos em verde menta (#10b981)
- **Layout:** Centralizado com espaço em branco generoso
- **Animações:** Transições suaves e feedback visual claro

## 🚀 Próximos Passos

### Integração com IA Real
Atualmente, a aplicação usa dados mock. Para integração com IA real:

1. **Criar Backend com Endpoints:**
   - `POST /api/analyze` - Análise de currículo vs vaga
   - `POST /api/extract-job` - Extração de conteúdo de URL da vaga
   - `POST /api/optimize-resume` - Geração de currículo otimizado

2. **Integrar com IA do Manus:**
   - Usar a IA nativa do Manus para análise inteligente
   - Implementar prompt de especialista em recrutamento
   - Calcular Match Score baseado em critérios ATS

3. **Extração de Conteúdo de Vagas:**
   - Implementar scraping seguro de URLs de vagas
   - Remover HTML e extrair apenas texto relevante
   - Tratar diferentes formatos de sites de recrutamento

### Melhorias Futuras
- [ ] Histórico de análises (requer banco de dados)
- [ ] Exportação em PDF com formatação profissional
- [ ] Comparação lado a lado de currículo original vs otimizado
- [ ] Suporte para múltiplos idiomas
- [ ] Análise em tempo real enquanto digita
- [ ] Integração com LinkedIn para extração automática

## 📝 Uso

1. **Faça upload do seu currículo** em PDF, DOCX ou TXT
2. **Cole o link da vaga** de um site de recrutamento
3. **Clique em "Analisar Vaga"** para processar
4. **Revise os resultados:**
   - Match Score indica compatibilidade
   - Palavras-chave mostram termos importantes
   - Sugestões indicam melhorias específicas
5. **Baixe o currículo otimizado** ou copie o texto

## ⚠️ Limitações Atuais

- Dados de análise são simulados (mock data)
- Não extrai conteúdo real de URLs de vagas
- Sem persistência de dados entre sessões
- Sem integração com IA real

## 📄 Licença

MIT

## 🤝 Contribuições

Este é um MVP para uso pessoal. Sinta-se livre para estender e customizar conforme necessário.

---

**Desenvolvido com ❤️ usando Manus**
