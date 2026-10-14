# PROJECT_ANCHOR — USROCK

> Fonte de continuidade do projeto. Mantenha informações verificáveis, sem declarar concluído aquilo que não foi testado.

## Identidade e objetivo
- Projeto: UsRock, e-commerce premium de roupas relacionadas a rock/metal.
- Referência para organização e qualidade visual: https://berzerk.com.br/ (não copiar ativos protegidos).
- Diferencial: construtor visual de landing pages promocionais para camisas, coleções e eventos.
- Ambiente inicial: GitHub + VS Code + Codex + Claude Code.
- Stack inicial do frontend: Next.js 16 App Router, React 19, TypeScript 6 e Tailwind CSS 4.
- Stack do backend (aprovada em 2026-10-13): serviço próprio em `backend/` com Node.js 24, TypeScript, Fastify 5, PostgreSQL 17 (Docker local), Drizzle ORM, Zod e OpenAPI 3.1. O Next.js encaminhará `/api/*` ao backend. Hospedagem de produção ainda não definida.

## Donos por área
- Codex: `frontend/`, UI/UX e `docs/DESIGN_SYSTEM.md`.
- Claude: `backend/`, contratos de APIs e integrações.
- Ambos: leitura dos handoffs; registro de suas tarefas; documentação central reconciliada a cada integração.

## Estado atual — Fase 1 frontend em andamento; backend E1, E2 e E3 concluídas localmente
- [x] Definição de escopo e divisão de responsabilidades.
- [x] Documentos iniciais de colaboração criados (após serem inseridos no repositório).
- [~] Base do frontend gerada e executável localmente; aprovação da stack completa e infraestrutura compartilhada pendentes.
- [~] Homepage premium refinada; lint, TypeScript, build e resposta HTTP local validados; inspeção visual em navegador e aprovação final pendentes.
- [x] Backend criado e executando localmente (E1: fundação; lint, typecheck, build, 40 testes unitários e 4 de integração passaram em 2026-10-13; sem commit até autorização).
- [x] Integração frontend/backend E1/E2 validada localmente: rewrite, catálogo, filtros, produto e estados consultando PostgreSQL via Fastify.
- [ ] Admin e CMS implementados.
- [ ] Editor de landing pages implementado.
- [ ] Integrações comerciais implementadas e testadas em sandbox.
- [ ] Segurança, QA, homologação e deploy concluídos.

## Próxima ação prioritária
1. Revisar a integração E1/E2 do frontend e autorizar commit/PR quando aprovada; depois, autorizar o Codex a iniciar as telas de contas E3. Carrinho e marketing E4 continuam fora do escopo desta etapa.
2. Inspecionar a homepage em navegador desktop e mobile; ajustar design conforme screenshots e aprovar tokens/identidade.
3. Criar testes de interação/acessibilidade e iniciar catálogo e página de produto após contratos acordados.

## Registro das integrações
| Funcionalidade | Frontend | Backend | Estado da integração |
|---|---|---|---|
| Saúde da API | Rewrite validado | Implementado (`/api/v1/health`) | Next → Fastify → PostgreSQL comprovado localmente |
| Catálogo | Implementado e validado (`/`, `/catalogo`, `/produto/[slug]`) | Implementado e testado (E2: `/products`, `/products/{slug}`, `/collections`, `/categories`) | Integrado localmente; seed permanece `isDemo` |
| Login | Pendente | Implementado e testado (E3: cadastro, login, logout, `/me`, troca e recuperação de senha) | API pronta localmente; telas pendentes |
| Frete | Pendente | Pendente | Não iniciado |
| Checkout | Pendente | Pendente | Não iniciado |
| Landing pages | Pendente | Pendente | Não iniciado |

## Alterações recentes
- Bootstrap: estrutura inicial e documentos criados. Nenhuma integração funcional afirmada.

## Registro factual — Integração frontend E1/E2 validada, 2026-10-13 (Codex)
- Branch `codex/integracao-backend` confirmada, árvore inicialmente limpa, remoto `AimBets/UsRocK`; `frontend/` e `backend/` presentes. Nenhum arquivo de `backend/` foi alterado.
- Implementados rewrite same-origin `/api/*` → Fastify, ambiente somente servidor, cliente HTTP tipado, tratamento de erros por `code`, timeout, encaminhamento server-only de cookie, gerador local de tipos a partir do OpenAPI e formatação de `Money.amountMinor` em BRL.
- Homepage passou a consumir produtos/coleções da E2; criadas listagem `/catalogo` com capacidades reais da API e página `/produto/[slug]` com galeria/variantes/preços/disponibilidade. Adicionados loading, vazio, erro, indisponibilidade e 404, preservando hero, paleta e linguagem visual.
- Itens `isDemo` continuam explicitamente ilustrativos; sacola permanece local/demonstrativa porque carrinho ainda não foi implementado no backend. Não há endpoint de relacionados; a página usa apenas listagem transparente da mesma categoria.
- O erro `setup refresh had errors` foi identificado como falha transitória do helper/sandbox ao criar processos; a execução foi recuperada sem reinstalar dependências. A auditoria usou uma sessão externa local autorizada.
- OpenAPI generate/check, ESLint, TypeScript e build passaram. Migração e seed idempotentes passaram; PostgreSQL apresentou 6 produtos, 26 variantes, 6 mídias, 3 coleções e 1 categoria.
- Prova ponta a ponta: a linha PostgreSQL `nocturne-wings-oversized|Nocturne Wings Oversized|12990` coincidiu com Fastify e com o objeto recebido pelo rewrite Next. Homepage, catálogo, filtros, cursor, ordenação, detalhe, mídia, BRL, vazio, indisponibilidade, erro 400 e 404 foram exercitados.
- Correção relevante: removido o loading global que fazia produto inexistente iniciar streaming com HTTP 200; loading permaneceu em `/catalogo` e o detalhe inexistente passou a responder 404.
- Nenhum erro do backend foi encontrado; nenhum arquivo em `backend/` foi modificado. Próximo passo exato: revisão da integração E1/E2 e, somente após aprovação, início da UI de autenticação E3.

## Bloqueios / riscos
- Definir modelo de hospedagem (stack do backend definida em 2026-10-13).
- Repositório dentro do OneDrive: risco de lentidão/bloqueio com `node_modules`; recomendado excluir da sincronização.
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

## Registro factual — Backend E1, 2026-10-13 (Claude)
- Branch `claude/backend` verificada sobre `b92f08b` (merge do PR #1 com o frontend aprovado). Nenhum arquivo de `frontend/` foi alterado.
- Criada a fundação em `backend/`: Fastify + TypeScript, configuração validada com Zod, PostgreSQL 17 e Mailpit via Docker Compose (Postgres na porta 5433 do host), Drizzle ORM com migração `0000_init` (extensão `citext`), `GET /api/v1/health` e `/health/live`, envelope de erro padronizado, `X-Request-Id`, paginação por cursor, `Money` em centavos, logs pino com mascaramento de dados sensíveis, helmet/CORS/rate limit/verificação de Origin, OpenAPI 3.1 em `backend/openapi/openapi.json` e Swagger UI em `/docs` (somente desenvolvimento).
- Autenticação/autorização apenas estruturais (papéis, permissões, guards, interface de sessão); não há login, contas nem sessões.
- CI criado em `.github/workflows/backend-ci.yml` (filtrado por `backend/**`); ainda não executado no GitHub porque nada foi enviado.
- Verificações reais: lint, typecheck, build, `openapi:check`, 40 testes unitários, 4 testes de integração com PostgreSQL, migração idempotente, servidor compilado e modo dev respondendo; `npm audit --omit=dev` sem vulnerabilidades.
- Nenhum commit, push ou merge realizado. Próximo passo exato: revisão e autorização do commit/PR da E1; em seguida, E2 (catálogo).

## Registro factual — Backend E2 (catálogo), 2026-10-13 (Claude)
- Migração `0001_catalog`: categorias, coleções, produtos (busca full-text em português), vínculo produto–coleção, variantes (SKU, tamanho/cor, preço e preço anterior em centavos), mídia, níveis e movimentações de estoque, com restrições no banco (slug, preço anterior > preço, reservado ≤ físico, tamanho único por produto).
- Rotas públicas somente leitura: `GET /api/v1/products` (busca, categoria, coleção, tamanho, faixa de preço, em estoque, 4 ordenações, cursor), `GET /api/v1/products/{slug}`, `GET /api/v1/collections`, `GET /api/v1/collections/{slug}`, `GET /api/v1/categories`. Disponibilidade pública sem quantidades.
- `npm run db:seed`: catálogo demonstrativo com os 6 produtos do mock da home (`isDemo: true`, estoques ilustrativos); idempotente, recusado em produção, não sobrescreve produtos reais nem estoque existente.
- Verificações reais: lint, typecheck, build, `openapi:check`, 52 testes unitários e 27 de integração com PostgreSQL; servidor dev e compilado respondendo às rotas do catálogo.
- Não implementado: admin/CRUD de catálogo, upload de mídia, reservas de estoque, carrinho. Frontend ainda usa mocks.
- Nenhum commit, push ou merge realizado. Próximo passo exato: revisão/autorização do commit da E1+E2; conexão do frontend pelo Codex.

## Registro factual — Backend E3 (contas, sessão e permissões), 2026-10-13 (Claude)
- Migração `0002_accounts`: `users` (e-mail `citext` único, hash Argon2id, papéis, status), `sessions` (somente hash do token), `password_reset_tokens` (hash, expiração, uso único) e `consents` (histórico imutável com versão do texto e origem).
- Rotas: `POST /api/v1/auth/register`, `/auth/login`, `/auth/logout`, `/auth/password/forgot`, `/auth/password/reset`, `GET /api/v1/me`, `POST /api/v1/me/password`. Sessão por cookie `HttpOnly`/`SameSite=Lax` (`Secure` obrigatório em produção), expiração absoluta e por inatividade, revogação em logout, troca e redefinição de senha.
- Segurança: limites por IP e por e-mail, respostas sem enumeração de contas, verificação de Origin, logs sem senha/e-mail/token (testado).
- E-mail transacional via SMTP: Mailpit em desenvolvimento, verificado de ponta a ponta (pedido → e-mail recebido no Mailpit → redefinição → login → `/me`). Provedor de produção ainda não definido.
- `npm run user:create-admin` cria o primeiro administrador ou promove conta existente; em produção exige `ADMIN_PASSWORD`.
- Verificações reais: lint, typecheck, build, `openapi:check`, 67 testes unitários e 45 de integração com PostgreSQL. As contas criadas durante o teste manual foram removidas do banco de desenvolvimento.
- Pendências: textos de Termos/Privacidade (consentimento registra a versão `rascunho-2026-10`), verificação de e-mail, painel de gestão de usuários, exportação/anonimização LGPD (E9), envio de e-mail por fila com novas tentativas.
- Nenhum commit, push ou merge realizado.
