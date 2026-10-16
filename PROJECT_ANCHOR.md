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

## Estado atual — E4 integrada; frontend E5 validado contra branch separada do backend
- [x] Definição de escopo e divisão de responsabilidades.
- [x] Documentos iniciais de colaboração criados (após serem inseridos no repositório).
- [~] Base do frontend gerada e executável localmente; aprovação da stack completa e infraestrutura compartilhada pendentes.
- [~] Homepage premium refinada; lint, TypeScript, build e resposta HTTP local validados; inspeção visual em navegador e aprovação final pendentes.
- [x] Backend criado e executando localmente (E1: fundação; lint, typecheck, build, 40 testes unitários e 4 de integração passaram em 2026-10-13; sem commit até autorização).
- [x] Integração frontend/backend E1/E2 validada localmente: rewrite, catálogo, filtros, produto e estados consultando PostgreSQL via Fastify.
- [~] Autenticação E3 implementada e validada ponta a ponta no frontend; revisão e commit/PR das correções finais pendentes.
- [x] Frontend E4 integrado às APIs reais de sacola, favoritos, campanhas, cupom e newsletter; migração local, Mailpit, falhas e responsividade testados.
- [x] Backend E4 implementado e testado localmente (sacola de visitante/conta com junção no login, favoritos, cupons, campanhas, newsletter com dupla confirmação; 89 unitários + 66 de integração e verificação ao vivo em 2026-10-15; sem commit até autorização).
- [x] Regressão de vitrines investigada e recuperada: Fastify offline era a causa; seis produtos, detalhes e imagens foram revalidados de PostgreSQL até o build Next, sem mocks e sem alteração no backend.
- [~] Frontend E5 implementado e validado estaticamente, ao vivo e responsivamente contra uma cópia temporária de `claude/e5-checkout`; integração do backend à base, tipos OpenAPI gerados e sandboxes reais ainda pendentes.
- [ ] Admin e CMS implementados.
- [ ] Editor de landing pages implementado.
- [ ] Integrações comerciais implementadas e testadas em sandbox.
- [ ] Segurança, QA, homologação e deploy concluídos.

## Próxima ação prioritária
1. Revisar e integrar, com autorização, a branch de backend `claude/e5-checkout` antes de atualizar a base de `codex/e5-checkout`; o Codex não mesclou nem modificou arquivos do backend.
2. Com o OpenAPI E5 na base, adicionar seus schemas ao gerador do frontend, regenerar `openapi.d.ts`, remover o espelho provisório de `src/types/checkout.ts` e repetir a suíte completa.
3. Obter credenciais de teste para validar os sandboxes reais do Mercado Pago e da SuperFrete; até lá, manter explícitos o frete fixture e o pagamento indisponível em desenvolvimento.

## Registro das integrações
| Funcionalidade | Frontend | Backend | Estado da integração |
|---|---|---|---|
| Saúde da API | Rewrite validado | Implementado (`/api/v1/health`) | Next → Fastify → PostgreSQL comprovado localmente |
| Catálogo | Implementado e validado (`/`, `/catalogo`, `/produto/[slug]`) | Implementado e testado (E2: `/products`, `/products/{slug}`, `/collections`, `/categories`) | Integrado localmente; seed permanece `isDemo` |
| Login | Implementado e validado (`/entrar`, `/cadastro`, `/conta`, recuperação e redefinição) | Implementado e testado (E3: cadastro, login, logout, `/me`, troca e recuperação de senha) | Integrado ponta a ponta via rewrite; revisão/PR do frontend pendentes |
| Carrinho e favoritos | Integrado e testado (`/carrinho`, drawer, `/favoritos`, migração local e junção pós-login) | Implementado e testado (E4: `/cart*`, `/me/favorites*`) | Integrado; servidor é a fonte de preço, estoque, desconto e totais |
| Cupons e campanhas | Integrado (`CouponForm`, `CampaignPanel`) | Implementado e testado (E4: `/cart/coupon`, `/campaigns/active`, admin mínimo) | Loja integrada; UI administrativa continua futura (E6) |
| Newsletter | Inscrição, confirmação e descadastro integrados | Implementado e testado (E4: inscrição, confirmação, descadastro) | Integrado ponta a ponta com consentimento explícito e Mailpit |
| Frete | Estimativa na sacola e seleção no checkout implementadas e testadas contra fixture E5 | Implementado em `claude/e5-checkout`; integração à base pendente | Ponta a ponta local com fixture; sandbox SuperFrete real pendente |
| Checkout e pedidos | Fluxo, retorno e área do cliente implementados e testados | Implementado em `claude/e5-checkout`; integração à base pendente | Validado localmente com pagamento desativado; sandbox Mercado Pago e tipos OpenAPI integrados pendentes |
| Landing pages | Pendente | Pendente | Não iniciado |

## Alterações recentes
- Bootstrap: estrutura inicial e documentos criados. Nenhuma integração funcional afirmada.

## Registro factual — Frontend E5 contra branch separada, 2026-10-16 (Codex)
- Branch `codex/e5-checkout` confirmada em base `a5917f7`, fora de `main`. O backend E5 está em `claude/e5-checkout` (`a336bbd`) e não foi mesclado; nenhum arquivo de `backend/` foi modificado pelo Codex.
- Implementados estimador de frete na sacola; checkout autenticado em endereço, cotação, modalidade, prévia e confirmação idempotente; retorno do Mercado Pago baseado somente no servidor; CRUD de endereços; listagem e detalhe de pedidos com capacidades, reserva, pagamento, cancelamento, rastreio e histórico.
- Estados críticos tratados por códigos estáveis: sacola vazia/com problema, estoque, frete rejeitado/indisponível/vencido/divergente, total alterado, cupom, idempotência em andamento/reutilizada, pagamento indisponível e pedido não pagável/cancelável.
- `src/types/checkout.ts` é um espelho provisório dos schemas OpenAPI E5 da branch do Claude. A geração oficial fica bloqueada até o backend E5 entrar na base; isso impede declarar a integração definitiva, embora os payloads tenham sido comparados com o contrato da branch.
- Validação estática: OpenAPI E4 atual, lint, TypeScript, build e 11/11 testes passaram. O build gerou `/checkout`, `/checkout/retorno`, `/conta/enderecos`, `/conta/pedidos` e `/conta/pedidos/[id]`.
- Validação ao vivo: cópia temporária de `claude/e5-checkout`, sem mesclagem, compilou; migração e seed passaram; Fastify com frete fixture e pagamento desligado validou CRUD/máscaras, falha/fixture de frete, prévia, criação, idempotência, pagamento indisponível, listagem e cancelamento.
- Edge/CDP navegou o checkout até a revisão e abriu edição de endereço em 390, 768, 1024 e 1440 px, além de sacola, pedidos, detalhe e retorno. Capturas inspecionadas sem overflow horizontal.
- As quatro contas e os quatro pedidos fictícios criados pelos checks desta retomada foram removidos do PostgreSQL; a conferência final encontrou zero usuários `codex-e5-*`.
- Sandboxes reais do Mercado Pago e da SuperFrete não foram executados por falta de credenciais. Nenhum commit, push ou merge foi realizado.
- Próximo passo exato: integrar o backend E5 com autorização, atualizar a base do frontend, gerar tipos do OpenAPI integrado e repetir todos os checks antes de revisão/PR.

## Registro factual — Integração frontend E4 definitiva, 2026-10-15 (Codex)
- Na retomada final da revisão, branch `codex/e4-integracao` e `HEAD 36a5d74` foram reconfirmados. O diff continua restrito ao frontend e à documentação; OpenAPI, lint, TypeScript, 7/7 testes e build passaram novamente, e `git diff --check` não encontrou erro. Fastify e Next estavam desligados, então os checks ao vivo não foram repetidos nessa rodada; os resultados ponta a ponta anteriores permanecem válidos e documentados.
- Remoto `AimBets/UsRocK`, branch `codex/e4-integracao` e `HEAD 36a5d74` confirmados; a branch parte do merge da PR #5 do backend E4 em `main/origin/main`. A árvore estava limpa no início. Nenhum arquivo em `backend/` foi modificado e nenhum commit, push ou merge foi feito.
- Tipos de sacola, favoritos, campanhas e newsletter agora são gerados de `backend/openapi/openapi.json`; o check normaliza CRLF/LF sem mascarar diferenças de conteúdo.
- A sacola usa exclusivamente `/api/v1/cart*`: visitante por cookie HttpOnly, conta após login, quantidades por `maxQuantity`, remoção, avisos por item, cupom e totais recebidos do servidor. Checkout/frete continuam desabilitados até E5.
- A migração de `usrock-commerce-preview-v1` mantém carrinho e favoritos locais até cada sincronização confirmar sucesso. Um diário de metas torna a importação retomável após resposta perdida: a repetição envia somente o delta ainda ausente, evitando duplicação; itens ignorados são informados.
- Favoritos permanecem locais para visitante e são unidos à conta após login. Campanhas publicadas de `home_panel` respeitam o feed ativo, conteúdo, vigência, coleção, CTA, mídia, cupom e `isDemo`. Cupom exibe somente desconto/elegibilidade/motivos retornados pela API.
- Newsletter exige consentimento de marketing desmarcado e explícito, envia inscrição 202 e oferece páginas `/newsletter/confirmar` e `/newsletter/cancelar` com `noindex`, `no-referrer` e tratamento de token inválido. O opt-in do cadastro de conta não foi alterado nem forçado.
- Estados de comunicação, estoque insuficiente, item indisponível, preço alterado, limite, sessão expirada e backend offline foram tratados. Com Fastify desligado, sacola e favoritos mostraram falha recuperável e preservação local; o hero/identidade continuou disponível.
- Verificações finais: frontend lint, TypeScript, build, OpenAPI e **7/7 testes** passaram; backend lint, TypeScript, build, OpenAPI, **89/89 unitários** e **66/66 integrações PostgreSQL** passaram. `test:catalog-live` confirmou 6 produtos/detalhes/imagens; `test:commerce-live` confirmou visitante, persistência, DEMO10, cadastro/junção, quantidade, favorito, newsletter, confirmação e descadastro via Mailpit. A conta/inscrição fictícias foram removidas.
- QA via Edge/CDP renderizou homepage, sacola e favoritos em 390, 768, 1024 e 1440 px e comprovou ausência de overflow. A skill de navegador interativo não expôs apps/browsers; a inspeção foi feita nas capturas reais do Edge headless. O cache gerado `.next`, bloqueado uma vez pelo OneDrive, foi removido e reconstruído com sucesso.
- Próximo passo exato: revisão humana do diff e autorização de commit/PR da branch `codex/e4-integracao`; depois, E5 no backend para habilitar checkout, frete, reserva e pedidos.

## Registro factual — Backend E4 (sacola e marketing), 2026-10-15 (Claude)
- Remoto `AimBets/UsRocK` e branch `claude/e4-commerce` (base `e030ad0`) confirmados. Nenhum arquivo de `frontend/` foi alterado; checkout, frete, Mercado Pago e SuperFrete não foram tocados (E5).
- Migração aditiva `0003_commerce`: `carts`, `cart_items`, `favorites`, `coupons`, `campaigns`, `newsletter_subscriptions`, `newsletter_events`, com restrições no banco para as regras comerciais.
- Sacola de visitante (cookie `usrock_cart` httpOnly, só hash no banco) e de conta; junção automática na primeira chamada após login (maior quantidade vence); importação da prévia local; preço, estoque, cupom e totais sempre recalculados no servidor, com avisos por item; concorrência serializada no banco.
- Cupons percentuais/fixos com mínimo, coleção, exigência de conta, vigência e limite de usos; favoritos da conta; feed público de campanhas vigentes; administração mínima de cupons/campanhas com `campaigns:manage`; newsletter com consentimento explícito, dupla confirmação por e-mail, descadastro e trilha LGPD.
- Seed demonstrativo ganhou cupom `DEMO10` e campanha `demo-ritual-drop` (`isDemo`); migração e seed reaplicados duas vezes sem alterar o catálogo (6 produtos / 26 variantes).
- Verificações reais: lint, typecheck, build, `openapi:check`, 89 testes unitários e 66 de integração com PostgreSQL; ponta a ponta ao vivo com servidor compilado e Mailpit (sacola → cupom → cadastro → junção → favoritos → newsletter confirmada e cancelada). Dados fictícios removidos.
- Constatado: o `openapi:check` do frontend falha por fim de linha CRLF na cópia local, mesmo com o contrato do `HEAD`; conteúdo gerado idêntico. Registrado para o Codex.
- Pendências: reserva de estoque/checkout/resgate de cupom (E5), limpeza de sacolas expiradas, auditoria persistente (E6), envio de campanhas (E8). Nenhum commit, push ou merge realizado.

## Registro factual — Correção da regressão de catálogo E4, 2026-10-15 (Codex)
- Remoto `AimBets/UsRocK` e branch `codex/e4-commerce` confirmados. A comparação com `HEAD` mostrou que a E4 preservou cliente HTTP, rewrite, filtros e consultas do catálogo; a homepage recebeu apenas o painel de campanha entre seções comerciais.
- Causa raiz: Fastify estava desligado. O log do Next mostrou `ECONNREFUSED 127.0.0.1:3333`; PostgreSQL permaneceu saudável com 6 produtos, 26 variantes e 6 mídias. Nenhum mock foi introduzido.
- Após migração/seed idempotentes e inicialização dos serviços, API direta e rewrite retornaram os mesmos seis produtos. Homepage e catálogo renderizaram os seis; os seis detalhes e as seis imagens responderam 200.
- `/produto/[slug]` passou a mostrar indisponibilidade recuperável quando a API cai, mantendo `notFound()` somente para `NOT_FOUND`. Homepage e catálogo já mostravam estados de erro com “Tentar novamente”.
- Adicionado check ao vivo sem mocks para API, rewrite, homepage, catálogo, detalhes, imagens, carrinho e favoritos. Testes locais de comércio subiram para 6 e cobrem restauração/remoção/preservação.
- `turbopack.root` foi fixado no diretório do frontend para impedir inferência ambígua quando existir lockfile paralelo na raiz. O lockfile não rastreado não foi apagado.
- Validação final: OpenAPI check, ESLint, TypeScript, 6/6 testes, build e teste de catálogo ao vivo passaram. Edge headless confirmou visualmente os seis cards no catálogo, imagens no detalhe e hero desktop/mobile. E4 permaneceu funcional; nenhum arquivo de backend foi modificado.
- Próximo passo exato: manter os três serviços ativos e executar o check ao vivo antes de revisão; depois concluir QA interativo responsivo e solicitar autorização antes de qualquer commit/push/merge.

## Registro factual — Prévia frontend E4, 2026-10-15 (Codex)
- Branch `codex/e4-commerce` confirmada, fora de `main`; nenhum arquivo de `backend/` foi alterado.
- Implementadas sacola local por variante com drawer e página de revisão, quantidades, remoção e subtotal em centavos; favoritos persistentes no navegador com página própria e contador no cabeçalho.
- Hidratação do `localStorage` valida snapshots e descarta dados incompletos/indisponíveis; quantidade local limitada a 10. Persistência, preços e estoque permanecem sinalizados como prévia, nunca como resultado autoritativo.
- Campanhas, cupons e newsletter receberam interfaces honestas que não publicam campanha, aplicam desconto ou enviam dados sem API. Checkout permanece desabilitado até E4/E5.
- Responsividade ajustada para sacola em coluna única abaixo de 1024 px e favoritos em 1/2/3 colunas. Inspeção visual não foi possível porque nenhum navegador estava disponível no ambiente; o bloqueio foi registrado, sem declarar QA visual concluído.
- Verificações: 5 testes de estado passaram; OpenAPI check, ESLint, TypeScript e build passaram; `/carrinho` e `/favoritos` responderam HTTP 200 no servidor de produção local.
- Próximo passo exato: realizar QA visual/interativo em 390, 768, 1024 e 1440 px; após aprovação do contrato E4, integrar carrinho/favoritos/campanhas/cupons/newsletter ao backend e testar a junção no login.

## Registro factual — Frontend de autenticação E3, 2026-10-14 (Codex)
- Branch `codex/autenticacao-e3` confirmada, fora de `main`. Nenhum arquivo em `backend/` foi alterado.
- Implementadas telas reais de login, cadastro, conta protegida, logout, troca de senha, solicitação e redefinição de senha, consumindo os contratos OpenAPI E3 e preservando o cookie `HttpOnly` no rewrite same-origin.
- Cadastro exige consentimento jurídico e deixa marketing opcional desmarcado; páginas legais são avisos de rascunho, pois os textos definitivos continuam pendentes.
- Fluxo ponta a ponta validado pelo Next com PostgreSQL e Mailpit: cadastro 201, sessão 200, troca 204, logout 204, sessão encerrada 401, senha antiga 401, senha nova 200, recuperação 202, e-mail local e redefinição 204. Contas fictícias removidas após os testes.
- A auditoria corrigiu logout com corpo JSON vazio válido (`{}`), overflow do grid de conta em telas estreitas e conflitos de especificidade do cabeçalho responsivo.
- Render desktop de 1440 px e viewport móvel real de 390 px foram inspecionados; em 390 px não houve overflow horizontal (`innerWidth = clientWidth = scrollWidth = 390`).
- Próximo passo exato: repetir os checks finais, revisar o diff e obter aprovação para commit/PR; depois, criar testes automatizados de interação/acessibilidade sem iniciar E4 antes do contrato correspondente.

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
