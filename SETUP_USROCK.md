# UsRock — Guia resumido de implantação da estrutura dos agentes

1. Instale VS Code, GitHub Desktop, Git para Windows e Node.js LTS.
2. No GitHub Desktop, faça Clone do repositório já existente e abra-o no VS Code.
3. Instale as extensões oficiais Codex (OpenAI) e Claude Code (Anthropic) e autentique cada uma.
4. Copie os arquivos deste kit para a RAIZ da pasta clonada `usrock/`, preservando a estrutura de `docs/`.
5. Caso o repositório já possua `.gitignore` ou arquivos equivalentes, JUNTE as regras manualmente; não sobrescreva dados existentes.
6. No GitHub Desktop, confira as mudanças, faça Commit to main (somente para configurar documentação inicial) e Push origin.
7. Crie uma branch `codex/frontend` baseada em `main` e uma branch `claude/backend` baseada em `main`.
8. No Codex, peça para ler `AGENTS.md` e todos os arquivos de contexto, propor arquitetura e iniciar somente frontend.
9. No Claude, peça para ler `CLAUDE.md` e arquivos de contexto, propor arquitetura backend e contratos. Nesta primeira fase, trabalhe com um agente por vez na mesma pasta.
10. Cada tarefa termina com atualização do arquivo âncora e do handoff próprio, execução de testes, commit e push da branch. Abra Pull Request da branch para `main`, revise e faça merge. Depois sincronize `main` antes do próximo trabalho.

## Atenção especial a paralelismo
Dois agentes NÃO devem escrever simultaneamente no mesmo diretório local. Quando quiser paralelismo, mantenha um clone distinto ou worktree por agente, em branches distintas. Mesclar alterações dos arquivos compartilhados pode exigir resolução manual.

## Primeiro prompt — Codex
Leia `AGENTS.md`, `PROJECT_ANCHOR.md` e toda a pasta `docs/`. Você é responsável exclusivamente por frontend e identidade visual da UsRock. Faça auditoria do repositório, proponha stack e design system alinhados à referência berzerk.com.br, sem copiar seus materiais. Mostre plano de implementação por etapas e comece com uma home responsiva de alto padrão na pasta frontend. Se faltarem APIs, use mocks sinalizados e registre dependências em `docs/HANDOFF_CODEX.md`. Atualize o PROJECT_ANCHOR com o progresso real. Não toque no backend nem faça merge em main.

## Primeiro prompt — Claude
Leia `CLAUDE.md`, `PROJECT_ANCHOR.md` e toda a pasta `docs/`. Você é responsável por backend, autenticação, banco, contratos de API e integrações da UsRock. Primeiro audite o projeto, escolha arquitetura compatível com o frontend e documente os contratos iniciais. Depois implemente a base do backend em `backend/` com testes. Não modifique o layout. Atualize `docs/API_CONTRACTS.md`, `docs/HANDOFF_CLAUDE.md` e PROJECT_ANCHOR com fatos verificados. Nunca coloque segredos no repositório; não faça merge em main.
