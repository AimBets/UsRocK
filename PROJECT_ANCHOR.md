# PROJECT_ANCHOR — USROCK

> Fonte de continuidade do projeto. Mantenha informações verificáveis, sem declarar concluído aquilo que não foi testado.

## Identidade e objetivo
- Projeto: UsRock, e-commerce premium de roupas relacionadas a rock/metal.
- Referência para organização e qualidade visual: https://berzerk.com.br/ (não copiar ativos protegidos).
- Diferencial: construtor visual de landing pages promocionais para camisas, coleções e eventos.
- Ambiente inicial: GitHub + VS Code + Codex + Claude Code.
- Stack inicial do frontend: Next.js 16 App Router, React 19, TypeScript 6 e Tailwind CSS 4; arquitetura completa e hospedagem ainda dependem de alinhamento com Claude.

## Donos por área
- Codex: `frontend/`, UI/UX e `docs/DESIGN_SYSTEM.md`.
- Claude: `backend/`, contratos de APIs e integrações.
- Ambos: leitura dos handoffs; registro de suas tarefas; documentação central reconciliada a cada integração.

## Estado atual — Fase 1 frontend em andamento
- [x] Definição de escopo e divisão de responsabilidades.
- [x] Documentos iniciais de colaboração criados (após serem inseridos no repositório).
- [~] Base do frontend gerada e executável localmente; aprovação da stack completa e infraestrutura compartilhada pendentes.
- [~] Homepage premium refinada; lint, TypeScript, build e resposta HTTP local validados; inspeção visual em navegador e aprovação final pendentes.
- [ ] Backend criado e executando localmente.
- [ ] Integração básica frontend/backend funcionando.
- [ ] Admin e CMS implementados.
- [ ] Editor de landing pages implementado.
- [ ] Integrações comerciais implementadas e testadas em sandbox.
- [ ] Segurança, QA, homologação e deploy concluídos.

## Próxima ação prioritária
1. Claude revisar e consolidar as propostas frontend em `docs/API_CONTRACTS.md`, definir modelos de produto/carrinho/landing page, sessão e permissões.
2. Inspecionar a homepage em navegador desktop e mobile; ajustar design conforme screenshots e aprovar tokens/identidade.
3. Criar testes de interação/acessibilidade e iniciar catálogo e página de produto após contratos acordados.

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

## Registro factual — Fase 1, 2026-10-13
- Criado `frontend/` com Next.js App Router, React, TypeScript e Tailwind CSS 4; execução local e build de produção passaram.
- Implementada homepage com navegação responsiva, busca e sacola/favoritos locais, vitrines, categorias, campanha conceito, manifesto e rodapé.
- Catálogo e preços são demonstrativos; os quatro ativos de imagem foram gerados originalmente para esta implementação.
- Não existem APIs conectadas, backend, autenticação, checkout, frete ou persistência nesta entrega. Ver propostas não acordadas em `docs/API_CONTRACTS.md`.
- `docs/PRODUCT_SPEC.md` registra escopo integral da loja, admin e construtor visual futuro.
- A inspeção visual da Berzerk via browser não estava disponível no ambiente; conteúdo público indexado foi consultado para identificar organização comercial, sem inferir detalhes de screenshot.
- Registro Bootstrap acima permanece como histórico inicial; este registro descreve o estado atual após a Fase 1.

## Registro factual — Refinamento da homepage, 2026-10-13
- Preservado o hero original e refinada a hierarquia tipográfica das seções para reduzir competição visual com os produtos.
- Cards de Heavy Metal, Classic Rock, Grunge e Alternative passaram a usar os quatro assets autorais de gênero com overlay, recorte responsivo e interação de elevação.
- `ProductCard` passou a consumir `variants` do contrato de catálogo, com favoritos, seleção de tamanho, labels e valores demonstrativos sem prometer parcelamento/estoque/disponibilidade reais.
- Barra de anúncio revisada para comunicar que condições comerciais estão em validação; produtos de lançamentos e coleção exclusiva permanecem distintos por fatias do mock.
- `npm.cmd run lint`, `npm.cmd run typecheck`, `npm.cmd run build` e resposta HTTP 200 local passaram; browser não disponível para screenshots nos breakpoints solicitados.
- Próximo passo exato: executar inspeção visual em 390px, 768px, 1440px e 1920px assim que um navegador estiver disponível e então iniciar testes de interação/acessibilidade da homepage.
