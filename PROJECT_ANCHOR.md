# PROJECT_ANCHOR — USROCK

> Fonte de continuidade do projeto. Mantenha informações verificáveis, sem declarar concluído aquilo que não foi testado.

## Identidade e objetivo
- Projeto: UsRock, e-commerce premium de roupas relacionadas a rock/metal.
- Referência para organização e qualidade visual: https://berzerk.com.br/ (não copiar ativos protegidos).
- Diferencial: construtor visual de landing pages promocionais para camisas, coleções e eventos.
- Ambiente inicial: GitHub + VS Code + Codex + Claude Code.
- Stack e hospedagem: **a definir após análise conjunta**.

## Donos por área
- Codex: `frontend/`, UI/UX e `docs/DESIGN_SYSTEM.md`.
- Claude: `backend/`, contratos de APIs e integrações.
- Ambos: leitura dos handoffs; registro de suas tarefas; documentação central reconciliada a cada integração.

## Estado atual — início
- [x] Definição de escopo e divisão de responsabilidades.
- [x] Documentos iniciais de colaboração criados (após serem inseridos no repositório).
- [ ] Stack aprovada e projeto gerado.
- [ ] Frontend criado e executando localmente.
- [ ] Backend criado e executando localmente.
- [ ] Integração básica frontend/backend funcionando.
- [ ] Admin e CMS implementados.
- [ ] Editor de landing pages implementado.
- [ ] Integrações comerciais implementadas e testadas em sandbox.
- [ ] Segurança, QA, homologação e deploy concluídos.

## Próxima ação prioritária
1. Inserir este kit no repositório e realizar commit inicial.
2. Pedir ao Codex plano técnico de frontend e design system.
3. Pedir ao Claude proposta de backend, stack compatível e primeiros contratos.
4. Aprovar decisões em comum antes de escrever muito código.

## Registro das integrações
| Funcionalidade | Frontend | Backend | Estado da integração |
|---|---|---|---|
| Catálogo | Pendente | Pendente | Não iniciado |
| Login | Pendente | Pendente | Não iniciado |
| Frete | Pendente | Pendente | Não iniciado |
| Checkout | Pendente | Pendente | Não iniciado |
| Landing pages | Pendente | Pendente | Não iniciado |

## Alterações recentes
- Bootstrap: estrutura inicial e documentos criados. Nenhuma integração funcional afirmada.

## Bloqueios / riscos
- Definir stack e modelo de hospedagem.
- Segredos dos provedores nunca devem ser armazenados no GitHub.
- Em branches paralelas, resolver divergências neste arquivo ao integrar; não sobrescrever atualizações de outros agentes.
