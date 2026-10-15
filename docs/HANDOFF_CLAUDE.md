# Handoff — Claude para Codex

> Escreva aqui o que o backend concluiu, quais APIs estão disponíveis e o que o frontend deve conectar.

## Última entrega — E4: sacola, favoritos, cupons, campanhas e newsletter (2026-10-15)
- **Situação:** backend E4 implementado e testado localmente, incluindo verificação ao vivo com o servidor compilado, PostgreSQL de desenvolvimento e envio real de e-mail ao Mailpit.
- **Branch:** `claude/e4-commerce` (base `e030ad0`, merge do PR #4). **Sem commit, push ou merge**, aguardando autorização do responsável.
- **Frontend:** nenhum arquivo de `frontend/` foi alterado. Checkout, frete, Mercado Pago e SuperFrete não foram tocados (E5).

### Implementado e testado
- Migração `backend/drizzle/0003_commerce.sql` (somente tabelas novas): `carts`, `cart_items`, `favorites`, `coupons`, `campaigns`, `newsletter_subscriptions`, `newsletter_events`. Restrições no banco espelham as regras (quantidade 1–10, dono único da sacola, forma do desconto, períodos, links seguros).
- **Sacola** (`src/modules/cart/`): visitante por cookie `usrock_cart` (httpOnly, só hash no banco, 30 dias deslizantes) e cliente por conta; junção automática na 1ª chamada `/cart*` após login (maior quantidade vence, cookie de visitante removido); importação da prévia local; preço, estoque, cupom e totais recalculados no servidor a cada resposta, com `issues` por item (`unavailable`, `out_of_stock`, `insufficient_stock`, `price_changed`) e `hasIssues`; alterações concorrentes serializadas por `FOR UPDATE`. Regras puras em `cart.pricing.ts`.
- **Cupons:** percentual (arredondado para baixo, teto opcional) ou valor fixo; mínimo, coleção, exige conta, vigência, limite de usos, ativo. Motivos estáveis de recusa; reavaliação a cada leitura; 20 tentativas/15 min por IP.
- **Favoritos** (`src/modules/favorites/`): listar/adicionar/remover idempotentes e importação, só para conta; lista traz `ProductSummary` completo e oculta produtos fora de venda.
- **Campanhas** (`src/modules/marketing/`): feed público `GET /campaigns/active` (vigência, prioridade, posição, cupom divulgado só enquanto válido) e administração mínima de cupons/campanhas com `campaigns:manage` (log com `actorId`).
- **Newsletter** (`src/modules/newsletter/`): consentimento explícito obrigatório, dupla confirmação por e-mail (48 h, uso único), descadastro idempotente, resposta 202 idêntica em todos os casos, limites por IP e por e-mail, trilha `newsletter_events` e espelho em `consents` quando o e-mail tem conta.
- **Seed:** cupom `DEMO10` e campanha `demo-ritual-drop` (`home_panel`), ambos `isDemo: true`, idempotentes, recusados em produção.
- Contratos completos: `docs/API_CONTRACTS.md`, seção "Sacola, favoritos, cupons, campanhas e newsletter (E4)"; schemas em `backend/openapi/openapi.json`.

### Testes executados (resultado real, 2026-10-15)
- `npm run lint` ✅ · `npm run typecheck` ✅ · `npm run build` ✅ · `npm run openapi:check` ✅ · `npm audit --omit=dev`: 0 vulnerabilidades.
- `npm test`: 10 arquivos, **89 testes** ✅ (67 anteriores + 22 novos de regras de preço/cupom, validações, segurança de rotas sem banco).
- `npm run test:integration` (PostgreSQL 17 real): 4 arquivos, **66 testes** ✅ (45 anteriores + 21 da E4): cookie e hash da sacola, preço do cliente ignorado, limites/estoque/venda, isolamento entre visitantes, reavaliação de preço e estoque, produto arquivado, expiração, importação, concorrência (6 adições simultâneas → 5×200 + 1×409, quantidade final 10), junção no login com cupom, 8 motivos de recusa de cupom, favoritos, permissões admin, paginação admin, links inseguros recusados, feed de campanhas, newsletter completa com consentimentos, token expirado/forjado e logs sem e-mail/token.
- Teste de mutação: trocar a regra de junção para "soma" e remover a checagem de subtotal mínimo derrubou 3 testes; código restaurado.
- Migração e seed aplicados **duas vezes** no banco de desenvolvimento (idempotentes); catálogo preservado em 6 produtos / 26 variantes.
- Ponta a ponta ao vivo (`node dist/server.js` + Mailpit): campanha demo com `DEMO10` → sacola de visitante (subtotal 40970) → `DEMO10` aplicado (desconto 2798, total 38172) → cupom inexistente 400 `coupon_invalid` → cadastro → junção (`owner=customer`, 3 itens, cupom mantido, cookie de visitante removido) → favoritos → newsletter 202 → e-mail no Mailpit → confirmação 200 → reuso do link 400 → descadastro 200. Dados e e-mails fictícios removidos ao final.
- CI do GitHub não executado (nada enviado).

### Não implementado / limitações
- Reserva de estoque, frete, checkout, pedidos e incremento de `timesRedeemed` (E5); limite de uso **por cliente** de cupom (E5); frete grátis como tipo de cupom (E5).
- Limpeza periódica de sacolas de visitante expiradas (ignoradas nas leituras; job pendente).
- Envio de campanhas para a lista confirmada (E8). Cadastro com `marketingEmailOptIn: true` registra consentimento na conta, mas **não** inscreve automaticamente na newsletter.
- Trilha persistente de auditoria do admin (E6); hoje só log estruturado.
- `price_changed` permanece no item até ele ser alterado novamente (não há "ciente" explícito).
- Entrega SMTP local ao Mailpit levou ~7,5 s no teste ao vivo; é em segundo plano e não afeta a resposta (fila com novas tentativas: E5).

## APIs disponíveis
| Rota | Estado | Para o frontend? |
|---|---|---|
| `GET /api/v1/cart`, `POST /cart/items`, `PATCH`/`DELETE /cart/items/{itemId}`, `POST /cart/import`, `PUT`/`DELETE /cart/coupon` | Implementadas e testadas (E4) | Sim — drawer, `/carrinho`, cupom |
| `GET /api/v1/me/favorites`, `PUT`/`DELETE /me/favorites/{productId}`, `POST /me/favorites/import` | Implementadas e testadas (E4) | Sim — `/favoritos`, coração dos cards (com sessão) |
| `GET /api/v1/campaigns/active` | Implementada e testada (E4) | Sim — `CampaignPanel`, barra de anúncio |
| `POST /api/v1/newsletter/subscriptions`, `/newsletter/confirm`, `/newsletter/unsubscribe` | Implementadas e testadas (E4) | Sim — rodapé + 2 páginas novas |
| `/api/v1/admin/coupons`, `/api/v1/admin/campaigns` (+ `/{id}`) | Implementadas e testadas (E4) | Futuro painel (E6) |
| `POST /api/v1/auth/register`, `/auth/login`, `/auth/logout`, `GET /me`, `POST /me/password`, `/auth/password/*` | Implementadas e testadas (E3) | Sim — já integradas |
| `GET /api/v1/products`, `/products/{slug}`, `/collections`, `/collections/{slug}`, `/categories` | Implementadas e testadas (E2) | Sim — já integradas |
| `GET /api/v1/health`, `/health/live` | Implementadas e testadas (E1) | Não |

Para rodar: `cd backend && npm install && npm run db:up && npm run db:migrate && npm run db:seed && npm run dev` → `http://127.0.0.1:3333/docs`. E-mails de desenvolvimento em `http://127.0.0.1:8025`.

## Pedidos ao Codex (E4)
1. **Tipos:** rodar `npm run openapi:generate` no frontend e incluir em `selected` de `scripts/generate-openapi-types.mjs` os schemas `Cart`, `CartItem`, `CartCoupon`, `CartItemIssue`, `CouponIssue`, `CartImportResponse`, `Favorite`, `FavoriteList`, `Campaign`, `ActiveCampaigns` (todos os construtos usados já são suportados pelo gerador).
   - Observação: o `openapi:check` do frontend falha **hoje mesmo com o `openapi.json` do `HEAD`**, só por fim de linha: `frontend/src/types/openapi.d.ts` está com CRLF na cópia local e o check não normaliza `\r\n` (o do backend normaliza). O conteúdo gerado é idêntico. Sugestão: normalizar `\r\n` antes de comparar ou fixar `eol=lf` em `.gitattributes`.
2. **Sacola:** trocar o reducer local por `/api/v1/cart*` com `credentials: "include"`; usar `items[].maxQuantity` no seletor, `issues` para avisos por item e `totals`/`coupon` exatamente como recebidos (sem recalcular). Tratar `409` por `details[0].code` (`insufficient_stock`, `out_of_stock`, `max_quantity_exceeded`, `cart_full`, `unavailable`) e `404` (item/variante). `variant.availability` e `previousUnitPrice` estão disponíveis para mensagens.
3. **Migração da prévia:** na primeira carga com o backend disponível, enviar as linhas do `localStorage` para `POST /cart/import` (uma vez) e limpar a chave `usrock-commerce-preview-v1`; mostrar `skipped` se houver. Após login/cadastro, basta chamar `GET /cart` — a junção acontece no servidor.
4. **Favoritos:** com sessão, usar `/me/favorites*`; após login, importar os favoritos locais com `POST /me/favorites/import` e limpar o local. Visitante continua com favoritos locais. `PUT`/`DELETE` sem corpo: enviar `{}` ou não enviar `Content-Type` (com `Content-Type: application/json` e corpo vazio o Fastify responde 400).
5. **Cupom:** `CouponForm` → `PUT /cart/coupon { code }`; remover com `DELETE /cart/coupon`. Mensagens por `details[0].code` (lista na seção de contratos); `coupon.status = "not_applicable"` + `issue` quando um cupom já aplicado deixa de valer.
6. **Campanhas:** `CampaignPanel` → `GET /campaigns/active?placement=home_panel` (server-side; cache de 60 s); exibir `cta`, `media`, `endsAt` (contador), `couponCode` quando presentes; estado vazio quando `data` for `[]`; sinalizar `isDemo`.
7. **Newsletter:** `POST /newsletter/subscriptions { email, consent: true, source: "footer" }`. A caixa de consentimento deve ser **obrigatória e desmarcada** (o texto atual "Opcional; comunicações editoriais" precisa mudar, porque a newsletter em si é marketing). Exibir sempre a mensagem do 202. Criar as páginas **`/newsletter/confirmar?token=`** (POST `/newsletter/confirm`) e **`/newsletter/cancelar?token=`** (POST `/newsletter/unsubscribe`), com `Referrer-Policy: no-referrer`, `noindex` e tratamento de `400 invalid_token`.
8. **Checkout:** manter desabilitado (E5). `totals.shipping` vem `null` até lá.

## Riscos e observações
- Repositório dentro do OneDrive (risco de lentidão/bloqueio com `node_modules`).
- Limites de requisição em memória: válidos para uma instância; com várias instâncias será preciso armazenamento compartilhado.
- A sacola não reserva estoque: dois clientes podem ter a mesma última unidade na sacola; a reserva e a confirmação definitiva ficam no checkout (E5).
- `maxQuantity` revela o estoque disponível até 10 unidades (prática comum; quantidades maiores continuam ocultas).
- Cadastro com e-mail já existente retorna 409 (ver E3); a newsletter, ao contrário, não revela inscrições.
- `npm audit`: 0 vulnerabilidades em produção; as moderadas do `drizzle-kit` (ferramenta de desenvolvimento) continuam.

## Próxima tarefa do Claude
- **E5 — Frete, checkout e pedidos (aguarda autorização):** endereços, cotação SuperFrete (sandbox), reserva de estoque com expiração, `POST /checkouts` com `Idempotency-Key`, pedidos com cópia de preços, Mercado Pago Checkout Pro em sandbox com webhook assinado, e-mails transacionais com fila, resgate de cupom (`timesRedeemed`, limite por cliente).

## Entregas anteriores
### E3 — contas, sessão e permissões (2026-10-13)
Migração `0002_accounts` (`users`, `sessions`, `password_reset_tokens`, `consents`); cadastro, login, logout, `/me`, troca e recuperação de senha por e-mail (Mailpit); sessão por cookie `usrock_session` httpOnly com só o hash no banco, expiração absoluta e por inatividade; Argon2id; limites por IP e por e-mail; consentimentos LGPD com versão da política; comando `user:create-admin`. Verificado: 67 testes unitários e 45 de integração. Pendências: textos jurídicos, verificação de e-mail, gestão de usuários (E6), LGPD (E9).

### E2 — catálogo público, somente leitura (2026-10-13)
Migração `0001_catalog` (categorias, coleções, produtos com busca full-text, variantes com preço em centavos, mídia, estoque e movimentações); rotas `GET /api/v1/products` (busca, filtros, 4 ordenações, cursor), `/products/{slug}`, `/collections`, `/collections/{slug}`, `/categories`; disponibilidade pública sem quantidades; `npm run db:seed` com os 6 produtos demonstrativos (`isDemo: true`). Verificado: 52 testes unitários e 27 de integração.

### E1 — fundação do backend (2026-10-13)
Fastify + TypeScript em `backend/`, ambiente validado por Zod, PostgreSQL 17 + Mailpit no Docker (Postgres na porta 5433 do host), Drizzle com migração `0000_init` (`citext`), `/api/v1/health` e `/health/live`, envelope de erro padronizado, `X-Request-Id`, paginação por cursor, `Money` em centavos, logs pino com mascaramento, helmet/CORS/rate limit/verificação de Origin, OpenAPI 3.1 + Swagger UI em dev, CI em `.github/workflows/backend-ci.yml`. Verificado: 40 testes unitários e 4 de integração.
