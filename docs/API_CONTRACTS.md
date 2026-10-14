# Contratos de API — UsRock

**Responsável:** Claude. **Estado (E3, 2026-10-13):** convenções transversais (E1), catálogo público somente leitura (E2) e contas/sessão/permissões (E3) implementados e testados no backend, ainda sem commit. Carrinho, frete, checkout, pedidos e landing pages continuam propostos.

**Fonte de verdade tipada:** `backend/openapi/openapi.json` (OpenAPI 3.1, gerado a partir dos schemas Zod; o CI falha se estiver desatualizado). Em desenvolvimento, documentação interativa em `http://127.0.0.1:3333/docs` e JSON em `/docs/json`. O frontend pode gerar tipos com `openapi-typescript` a partir desse arquivo. Nos componentes do documento, use os schemas sem sufixo (ex.: `ErrorResponse`) para respostas; os sufixados `…Input` descrevem o formato aceito em requisições e são gerados pela biblioteca.

## Arquitetura acordada
- Serviço próprio em `backend/` (Node.js 24, TypeScript, Fastify 5, PostgreSQL 17, Drizzle ORM, Zod 4, OpenAPI). Aprovado pelo responsável do projeto em 2026-10-13.
- O Next.js encaminhará `/api/*` ao backend (rewrite), mantendo cookies de sessão no mesmo domínio da loja. Solicitação registrada ao Codex em `docs/HANDOFF_CLAUDE.md`; ainda não aplicada.
- Integrações aprovadas para fases futuras: Mercado Pago Checkout Pro em sandbox (Bricks depois, se necessário), Mailpit em desenvolvimento (provedor transacional a definir), WhatsApp pela API oficial. Nada disso está implementado.

## Convenções (acordadas e implementadas na E1)
| Tema | Regra | Situação |
|---|---|---|
| Prefixo | `/api/v1` | Implementado |
| Formato | JSON (`application/json`) em entrada e saída; corpo máximo 1 MiB; outros content-types recebem 415 | Implementado e testado |
| Datas | ISO 8601 em UTC (`2026-10-13T21:00:00.000Z`) | Convenção |
| IDs | UUID em string; slugs (minúsculas, `a-z0-9` e hífen) para URLs públicas | Implementado (E2) |
| Dinheiro | `Money = { amountMinor: inteiro em centavos, currencyCode: "BRL" }`. Nunca float. R$ 129,90 → `{ "amountMinor": 12990, "currencyCode": "BRL" }` | Schema e utilitários implementados e testados (`backend/src/shared/money.ts`) |
| Request ID | Toda resposta tem `X-Request-Id`. Um `X-Request-Id` recebido é reaproveitado se tiver 8–128 caracteres `[A-Za-z0-9._:-]`; senão o servidor gera um UUID | Implementado e testado |
| Erros | Envelope único (abaixo) | Implementado e testado |
| Paginação | Cursor opaco (abaixo) | Implementado e testado (`/products`, `/collections`) |
| Rate limit | Global por IP (padrão 300/min, configurável) → `429 RATE_LIMITED` com `Retry-After`. Armazenamento em memória: válido para uma instância | Implementado e testado |
| CORS | Somente origens em `CORS_ORIGINS`, com credenciais; cabeçalhos aceitos: `Content-Type`, `Idempotency-Key`, `If-Match`, `X-Request-Id`; expostos: `X-Request-Id`, `ETag`, `Retry-After` | Implementado e testado |
| CSRF | Requisições `POST/PUT/PATCH/DELETE` com `Origin` fora da lista recebem `403 FORBIDDEN`; sem parser `text/plain`; cookie de sessão `HttpOnly`, `SameSite=Lax`, `Secure` em produção. Chamadas servidor-a-servidor (webhooks) não enviam `Origin` e serão autenticadas por assinatura | Verificação de Origin implementada e testada |
| Concorrência | Recursos editáveis (landing pages, produtos no admin) usarão `ETag` + `If-Match`; divergência → `412 PRECONDITION_FAILED` | Código de erro reservado; uso a partir da E6/E7 |
| Idempotência | `POST` com efeito financeiro (`/checkouts`) exigirá `Idempotency-Key` | Cabeçalho já aceito pelo CORS; uso na E5 |

### Envelope de erro (`ErrorResponse`)
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Dados inválidos.",
    "requestId": "7f683c8e-6a34-4af6-80f3-8624b31eae7c",
    "details": [{ "path": "body.items.0.quantity", "message": "Too small: expected number to be >=1", "code": "too_small" }]
  }
}
```
- `code` é estável e é o que o frontend deve tratar: `BAD_REQUEST` 400, `VALIDATION_ERROR` 400, `UNAUTHENTICATED` 401, `FORBIDDEN` 403, `NOT_FOUND` 404, `METHOD_NOT_ALLOWED` 405, `CONFLICT` 409, `PRECONDITION_FAILED` 412, `PAYLOAD_TOO_LARGE` 413, `UNSUPPORTED_MEDIA_TYPE` 415, `RATE_LIMITED` 429, `INTERNAL_ERROR` 500, `SERVICE_UNAVAILABLE` 503.
- `message` é segura para exibição (pt-BR), mas não deve ser usada para lógica. Erros 5xx nunca expõem detalhes internos; eles ficam apenas no log, associados ao `requestId`.
- `details` só aparece em erros de validação; `path` começa com `body`, `querystring`, `params` ou `headers`. O texto de `details[].message` vem da biblioteca de validação (inglês) e serve para depuração; a UI deve usar `path` + `code` para escolher sua própria mensagem.

### Paginação (`{ data, pageInfo }`)
- Query: `limit` (1–100, padrão 24) e `cursor` (opaco, base64url, até 512 caracteres).
- Resposta: `{ "data": [...], "pageInfo": { "limit": 24, "hasNextPage": true, "nextCursor": "eyJ..." } }`. `nextCursor` é `null` na última página.
- O cliente nunca interpreta nem monta cursores; cursor inválido → `400 VALIDATION_ERROR` em `querystring.cursor`.
- Listas administrativas que precisarem de total/páginas numeradas terão contrato próprio quando forem definidas (E6).

### Autenticação, sessão e autorização (implementado na E3)
- **Sessão:** cookie `usrock_session` opaco (256 bits), `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` em produção (obrigatório). No banco fica só o SHA-256 do token. Validade absoluta de 30 dias e expiração após 14 dias sem uso (configuráveis). Sem JWT; o frontend **não lê nem armazena** o token: o navegador envia o cookie automaticamente (usar `credentials: "include"` em chamadas via rewrite do mesmo domínio).
- **Estado da sessão no frontend:** `GET /api/v1/me` → 200 com usuário, papéis e permissões; 401 para visitante.
- **Senhas:** Argon2id (19 MiB, 2 iterações). Política: 10 a 128 caracteres, diferente do e-mail, sem regras de composição.
- **Papéis:** `customer`, `operator`, `content_editor`, `admin`. Permissões: `catalog:manage`, `inventory:manage`, `orders:manage`, `customers:read`, `campaigns:manage`, `landing_pages:edit`, `landing_pages:publish` (somente `admin`), `media:upload`, `users:manage`, `audit:read`. Matriz em `backend/src/modules/auth/auth.types.ts`. Cadastro público cria sempre `customer`; o primeiro admin é criado pelo comando `npm run user:create-admin`.
- Rotas protegidas: `401 UNAUTHENTICATED` sem sessão válida; `403 FORBIDDEN` sem permissão. Recursos do próprio cliente serão protegidos por verificação de propriedade em cada módulo.
- **Proteções:** verificação de `Origin` em requisições que alteram dados; limite de 10 tentativas por 15 min por IP em cadastro/login/senha e, adicionalmente, por e-mail no login (10) e na recuperação de senha (3); mesma resposta 401 para senha errada, conta inexistente ou desativada, com tempo de resposta equivalente; recuperação de senha sempre responde 202.
- **Consentimentos (LGPD):** o cadastro registra, em histórico imutável, aceite de termos e privacidade e a escolha de marketing por e-mail, com versão do texto (`LEGAL_POLICY_VERSION`) e origem. **Os textos jurídicos ainda não existem** (versão atual: `rascunho-2026-10`).

#### Rotas de contas
| Método e rota | Corpo | Sucesso | Erros específicos |
|---|---|---|---|
| `POST /api/v1/auth/register` | `{ email, password, name, acceptTerms: true, marketingEmailOptIn?: boolean }` | `201 { user }` + cookie de sessão | `400` validação; `409 CONFLICT` e-mail já cadastrado |
| `POST /api/v1/auth/login` | `{ email, password }` | `200 { user }` + novo cookie (sessão nova a cada login) | `401` "E-mail ou senha inválidos." |
| `POST /api/v1/auth/logout` | — | `204`, cookie removido (idempotente) | — |
| `GET /api/v1/me` | — | `200 { user }`, `Cache-Control: no-store` | `401` visitante |
| `POST /api/v1/me/password` | `{ currentPassword, newPassword }` | `204`; encerra as **outras** sessões | `400` em `body.currentPassword` (`invalid_password`); `401` |
| `POST /api/v1/auth/password/forgot` | `{ email }` | `202 { message }` sempre | `429` |
| `POST /api/v1/auth/password/reset` | `{ token, password }` | `204`; encerra **todas** as sessões (entrar de novo) | `400` em `body.token` (`invalid_token`): link inválido, usado ou expirado |

`user` (`CurrentUser`): `{ id, email, name, roles[], permissions[], emailVerified, createdAt }`. E-mails são normalizados (espaços removidos, minúsculas).

Link de redefinição enviado por e-mail: `{APP_PUBLIC_URL}/conta/redefinir-senha?token=<43 caracteres>`, válido por 60 minutos, uso único; um novo pedido invalida o anterior. **Essa página ainda não existe no frontend** (pedido ao Codex).

## Contratos implementados

### `GET /api/v1/health` — prontidão
- **Status:** implementado e testado (unitário + integração com PostgreSQL real). Público, sem autenticação. `Cache-Control: no-store`.
- **200** quando todas as dependências respondem; **503** quando alguma falha ou excede 2 s. O motivo da falha só aparece no log.
```json
{ "status": "ok", "version": "development", "uptimeSeconds": 3, "timestamp": "2026-10-14T00:11:53.650Z",
  "checks": { "database": { "status": "up", "latencyMs": 11 } } }
```
- Uso: monitoramento e orquestração. A loja não precisa consumir esta rota.

### `GET /api/v1/health/live` — processo ativo
- **Status:** implementado e testado. Responde `{ "status": "ok" }` sem consultar dependências.

### Catálogo público (E2) — somente leitura
**Status:** implementado e testado (unitário + integração com PostgreSQL real). Público, sem autenticação. Respostas com `Cache-Control: public, max-age=60, stale-while-revalidate=300`: a disponibilidade pode atrasar até 1 min; carrinho e checkout (E4/E5) sempre revalidarão preço e estoque no servidor. Schemas completos em `backend/openapi/openapi.json`.

Regras comuns:
- Só aparecem produtos `active` com ao menos uma variante ativa; rascunhos, arquivados e produtos sem variante retornam 404 no detalhe e não aparecem em listas.
- Só aparecem coleções `published` e categorias ativas (inclusive nas referências dentro do produto).
- `availability`: `in_stock` | `low_stock` (disponível ≤ limite, padrão 3) | `out_of_stock`. Disponível = físico − reservado. Quantidades nunca são expostas. O produto assume a melhor disponibilidade entre as variantes.
- Preço e preço anterior pertencem à **variante**; o produto traz `priceRange { min, max }`.
- `isDemo: true` marca o catálogo demonstrativo do seed: preços e estoques ilustrativos, não comerciais.
- `media[].url` é caminho relativo ao site (`/images/...`, servido pelo Next.js) ou URL https absoluta.

#### `GET /api/v1/products`
Query (todas opcionais):

| Parâmetro | Tipo | Regra |
|---|---|---|
| `q` | texto 1–100 | Busca em nome e descrição (full-text em português + correspondência parcial no nome). Entrada tratada literalmente. Acentos ainda não são normalizados. |
| `category` | slug | Categoria ou suas subcategorias diretas |
| `collection` | slug | Coleção publicada |
| `size` | texto 1–10 | Tamanho exato da variante (`P`, `M`, `G`, `GG`, `XG`) |
| `priceMin`, `priceMax` | inteiro ≥ 0, **centavos** | `priceMin ≤ priceMax` |
| `inStock` | `true`/`false` | `true`: exige variante com estoque disponível |
| `sort` | `newest` (padrão), `price_asc`, `price_desc`, `name_asc` | Preço ordena pelo menor preço do produto |
| `limit`, `cursor` | ver Paginação | O cursor só vale para a mesma ordenação; outro `sort` → 400 |

Filtros de variante (`size`, preço, `inStock`) precisam ser atendidos pela **mesma** variante (ex.: `size=XG&inStock=true` = existe XG com estoque).

Resposta `200` (`{ data: ProductSummary[], pageInfo }`), exemplo de item (IDs abreviados):
```json
{
  "id": "9a83…", "slug": "eclipse-serpent-heavy-tee", "name": "Eclipse Serpent Heavy Tee",
  "label": "PREÇO EXEMPLO", "tone": "graphite", "isDemo": true,
  "category": { "id": "e998…", "slug": "camisetas", "name": "Camisetas" },
  "collections": [{ "id": "3501…", "slug": "ritual-collection", "title": "Ritual Collection" }],
  "priceRange": { "min": { "amountMinor": 13990, "currencyCode": "BRL" }, "max": { "amountMinor": 13990, "currencyCode": "BRL" } },
  "availability": "in_stock",
  "primaryMedia": { "url": "/images/product-serpent.png", "alt": "Camiseta grafite…", "width": 1254, "height": 1254 },
  "variants": [
    { "id": "2bf5…", "sku": "DEMO-ECLIPSE-SERPENT-HEAVY-TEE-P", "size": "P", "color": null,
      "price": { "amountMinor": 13990, "currencyCode": "BRL" }, "compareAtPrice": { "amountMinor": 15990, "currencyCode": "BRL" },
      "availability": "in_stock" }
  ]
}
```
Erros: `400 VALIDATION_ERROR` (parâmetros/cursor), `429`, `500`.

#### `GET /api/v1/products/{slug}`
`ProductDetail` = campos do resumo (sem `primaryMedia`) + `description`, `media[]` (ordenada), `seo { title, description }` (`title` usa o nome do produto quando não definido) e `publishedAt`. Slug fora do formato → `400`; inexistente/indisponível → `404 NOT_FOUND`.

#### `GET /api/v1/collections` e `GET /api/v1/collections/{slug}`
Lista paginada por cursor (ordem editorial `position`) e detalhe: `{ id, slug, title, description, heroMedia: { url, alt } | null }`. Produtos da coleção: `GET /api/v1/products?collection={slug}`.

#### `GET /api/v1/categories`
`{ data: Category[] }` **sem paginação** (máximo 500), árvore achatada com `parentId`.

## Modelo de dados (E2 criado; E3+ planejado)
Cada domínio terá suas tabelas Drizzle em `backend/src/modules/<domínio>/`. Convenções: UUID, `snake_case`, `created_at`/`updated_at` em `timestamptz`, valores em centavos (`*_minor`), e-mails/slugs em `citext` (extensão criada na migração `0000_init`).

| Domínio | Entidades principais | Fase |
|---|---|---|
| Catálogo | `products`, `product_variants` (SKU, tamanho/cor, preço e preço anterior em centavos), `categories`, `collections`, `product_collections`, `product_media` | **Criado na E2** (migração `0001_catalog`) |
| Estoque | `inventory_levels` (físico/reservado/limite de estoque baixo) e `inventory_movements` (histórico) **criados na E2**; `stock_reservations` (com expiração) na E5 | E2/E5 |
| Contas e clientes | `users`, `sessions` (hash do token), `password_reset_tokens`, `consents` **criados na E3** (migração `0002_accounts`); `addresses` e perfil do cliente | E3 / E5 |
| Carrinho e marketing | `carts`, `cart_items`, `coupons`, `campaigns`, `favorites`, `newsletter_subscriptions` (confirmação em duas etapas) | E4 |
| Pedidos e pagamentos | `orders` (cópia de preços/endereço no momento da compra), `order_items`, `order_status_history`, `payments`, `shipments`, `webhook_events` (chave única por evento do provedor), `idempotency_keys` | E5 |
| Operação | `audit_log` (quem, o quê, antes/depois, sem dados pessoais desnecessários) | E6 |
| Landing pages | `landing_pages` (slug, status `draft`/`scheduled`/`published`/`archived`, versão publicada), `landing_page_versions` (documento JSON imutável com `schemaVersion`, autor, data), `media_assets` | E7 |
| CRM e WhatsApp | segmentos, interações, opt-ins de WhatsApp | E8 |

Landing pages: cada salvamento cria uma versão imutável; o documento JSON tem `schemaVersion` e blocos tipados validados por Zod no servidor (união discriminada por `type`), com limites de tamanho, referências a produtos/coleções/mídia por ID e texto rico por lista de elementos permitidos. HTML ou scripts arbitrários são rejeitados.

## Matriz inicial de necessidades (rotas são propostas)
| Área | Necessidade | Endpoint candidato | Situação |
|---|---|---|---|
| Sistema | Saúde do serviço | `GET /api/v1/health`, `GET /api/v1/health/live` | **Implementado e testado (E1)** |
| Produtos | Catálogo e filtros | `GET /api/v1/products` | **Implementado e testado (E2)** |
| Produtos | Detalhe e variações | `GET /api/v1/products/{slug}` | **Implementado e testado (E2)** |
| Coleções | Lista e detalhe | `GET /api/v1/collections`, `GET /api/v1/collections/{slug}` | **Implementado e testado (E2)** |
| Categorias | Lista | `GET /api/v1/categories` | **Implementado e testado (E2)** |
| Contas | Cadastro, login, logout, sessão atual, troca e recuperação de senha | `/api/v1/auth/*`, `/api/v1/me`, `/api/v1/me/password` | **Implementado e testado (E3)** |
| Carrinho | Itens e totais | `POST /api/v1/cart/items` | Proposta (E4) |
| Frete | Cotação por CEP/itens | `POST /api/v1/shipping/quotes` | Proposta (E5) |
| Checkout | Iniciar pagamento | `POST /api/v1/checkouts` | Proposta (E5) |
| Pedidos | Status | `GET /api/v1/orders/{id}` | Proposta (E5) |
| Landing pages | Listar e editar rascunhos | `GET/POST /api/v1/admin/landing-pages` | Proposta (E7) |
| Landing pages | Publicação e versões | a definir | Proposta (E7) |

## Template por contrato
- Nome / objetivo:
- Proprietário:
- Status: proposto / acordado / implementado / testado
- Método, rota, autenticação e permissões:
- Request de exemplo (sem dados sensíveis):
- Response de exemplo:
- Erros, paginação e regras de validação:
- Frontend consumidor e teste executado:

## Integrações externas
Mercado Pago, SuperFrete, WhatsApp e email são responsabilidades do backend. Nenhum token ficará no cliente. Eventos assíncronos deverão considerar webhooks validados, idempotência e retries.

## Requisitos descobertos pela homepage — propostas para consolidação

**Estado:** requisitos de consumo do frontend; nenhuma rota abaixo foi implementada ou acordada. Claude é o proprietário deste documento e deve revisar payloads, autenticação, autorização e nomes finais.

### Catálogo e busca

- `GET /api/v1/products`: texto de busca, filtros por coleção/categoria/tamanho/preço/disponibilidade, ordenação e paginação por cursor ou página.
- `GET /api/v1/products/{id}`: descrição, preço atual e anterior, moeda, mídia ordenada com texto alternativo, variantes/tamanhos, disponibilidade, categoria, coleção, badges e recomendações.
- `GET /api/v1/collections`: coleções publicadas com slug, título, descrição e mídia de campanha.
- Contrato estável necessário para Product, Variant, Money, Media, Collection e PageInfo. Quantidade de estoque interna não deve ser exposta quando bastar um estado de disponibilidade.

### Carrinho e checkout

- `GET /api/v1/cart`, `POST /api/v1/cart/items`, `PATCH /api/v1/cart/items/{itemId}` e `DELETE /api/v1/cart/items/{itemId}`.
- Item exige `productId`, `variantId` e quantidade; servidor valida preço, disponibilidade e limite de quantidade.
- Totais retornados pelo backend: subtotal, descontos, frete quando aplicável e total com moeda. Cliente não calcula preço autoritativo.
- `POST /api/v1/shipping/quotes`: CEP e linhas de item; retorno de opções, preço, prazo e identificador da cotação.
- `POST /api/v1/checkouts`: referência do carrinho, endereço, opção de entrega e cupom; servidor retorna identificador e próximo passo seguro do pagamento.
- `GET /api/v1/orders/{id}`: status permitido ao cliente autenticado ou por mecanismo seguro definido pelo backend.

### Conta e favoritos

- Sessão/login/logout e perfis são exclusivamente definidos e implementados pelo backend. A UI precisa de estado de sessão e lista de permissões; tokens de provedor nunca devem ser lidos pelo código da loja.
- Favoritos podem iniciar em armazenamento local consentido; sincronização por conta requer endpoints autenticados de listar/adicionar/remover e regra de merge entre dispositivo e conta.

### Campanhas e conteúdo

- `GET /api/v1/campaigns/active`: conteúdo do anúncio comercial, período, condições e destino; o servidor é fonte de verdade de validade e elegibilidade.
- Newsletter/formulários de contato precisam de endpoint e política de consentimento, retenção, descadastro e rate limit antes de enviarem dados pessoais.

### Landing pages administrativas

- `GET/POST /api/v1/admin/landing-pages`; `GET/PATCH/DELETE /api/v1/admin/landing-pages/{id}`.
- `GET /api/v1/admin/landing-pages/{id}/versions`; criar snapshot, comparar ou restaurar por identificador.
- Ações propostas separadas para publicar, agendar, cancelar agendamento e arquivar, protegidas por permissões administrativas e validadas no servidor.
- Schema JSON versionado para seções tipadas, propriedades, referências de mídia/produto e metadados SEO. O backend valida schema, limites, mídia e estado; não aceitar scripts/HTML executável arbitrário.
- A API deve comunicar status, datas ISO 8601, versão atual, concorrência/ETag e erros de validação por campo.

### Requisitos de cliente e erro

- Confirmar sessão e permissões no backend; prevenir CSRF conforme o mecanismo de autenticação escolhido; aplicar rate limit e auditoria a mutations administrativas.
- Respostas de lista devem incluir paginação e filtros efetivos. Erros devem ter código estável, mensagem segura, request ID e detalhes de validação não sensíveis.
- Upload de mídia deve usar fluxo autenticado definido pelo backend, com validação de MIME real, tamanho, dimensão, autorização e armazenamento apropriado.
- Os dados da homepage são mocks em `frontend/src/data/storefront.ts`; não são fonte de preço, estoque, oferta, avaliação, frete ou disponibilidade real.

## Revisão do Claude sobre as propostas acima (E1, 2026-10-13)

As propostas do Codex foram aceitas como base. Os itens de Product/Variant abaixo **foram implementados na E2** (ver "Catálogo público"):

- **Money (decisão aprovada):** `{ amountMinor: number (inteiro, centavos), currencyCode: "BRL" }` substitui `Money.amount` decimal de `frontend/src/types/catalog.ts`.
- **Product (proposta para E2):** `collection` passa de texto para referência `{ id, slug, title }`; `image`/`imageAlt` viram `media: [{ url, alt, width, height, position }]`; preço e preço anterior pertencem à variante, com faixa de preço resumida no produto; `availability` usa `in_stock | low_stock | out_of_stock` (sem quantidade). `tone` pode virar campo opcional de merchandising; `dataStatus` não existe na API (é marcador do mock).
- **Variant (proposta para E2):** `{ id, sku, options: { size, color? }, price, compareAtPrice?, availability }`.
- **Detalhe por slug:** `GET /api/v1/products/{slug}` em vez de `{id}`, para URLs amigáveis e SEO.
- **Paginação:** escolhida por cursor (ver Convenções).
- **Sessão:** cookie `httpOnly` emitido pelo backend; o frontend usa `GET /api/v1/me` para estado de sessão e permissões (implementado na E3).
