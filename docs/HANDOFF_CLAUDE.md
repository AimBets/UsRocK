# Handoff — Claude para Codex

> Escreva aqui o que o backend concluiu, quais APIs estão disponíveis e o que o frontend deve conectar.

## Última entrega — E6.1: fundação do painel administrativo (2026-10-16)
- **Situação:** implementado e testado localmente (PostgreSQL real e servidor compilado ao vivo). Esta é a **primeira de nove entregas da E6**; o plano completo está em `docs/API_CONTRACTS.md`, seção "Painel administrativo (E6)".
- **Branch:** `claude/e6-admin`, atualizada por fast-forward para `origin/main` `16db9ad` (PR #9), que já contém o backend E5 (`a336bbd`). **Sem commit, push ou merge**, aguardando autorização.
- **Frontend:** nenhum arquivo de `frontend/` foi alterado.

### Auditoria do backend existente (antes da E6.1)
- Admin já existente: cupons e campanhas (`campaigns:manage`, E4) e pedidos (`orders:manage`, E5). Cupons/campanhas só tinham log estruturado e validavam o corpo antes da permissão (anônimo com corpo inválido recebia `400`).
- Permissões definidas na E3 e ainda sem rota: `catalog:manage`, `inventory:manage`, `customers:read`, `users:manage`, `audit:read`, `media:upload`, `landing_pages:*`.
- Não existiam: trilha de auditoria persistente, gestão de equipe, dashboard, CRUD de catálogo/estoque, clientes, configurações, relatórios.

### Implementado e testado
- **Migração `0005_admin`** (aditiva, só tabela nova): `admin_audit_logs` + gatilho que recusa `UPDATE`/`DELETE`. Sem chave estrangeira para `users`, de propósito: a trilha sobrevive à exclusão da conta.
- **Guarda padrão** `protectAdminScope(app, permission)` (`src/modules/auth/auth.plugin.ts`): permissão antes da validação, `Cache-Control: no-store`; `requirePermission` passa a registrar recusas em log (`actorId`, permissão, rota; sem dados pessoais). Aplicada às rotas admin de marketing, pedidos, equipe e auditoria.
- **Auditoria** (`src/modules/audit/`): `recordAudit` na mesma transação da alteração; `diffChanges` (só campos efetivamente alterados, colunas de controle ignoradas); saneamento de chaves sensíveis e limites de tamanho; `GET /admin/audit-logs` com filtros e cursor (`audit:read`).
- **Equipe** (`src/modules/access/`, `users:manage`): catálogo de papéis, lista da equipe/busca por e-mail exato, definição de papéis, bloqueio/reativação (bloquear encerra sessões). Recusas `cannot_modify_self` e `last_admin`; operador revalidado dentro da transação; contas admin travadas em ordem estável para serializar alterações concorrentes.
- **Rotas existentes auditadas:** criação/edição de cupons e campanhas (agora transacionais, com trava da linha na edição) e transições/etiquetas de pedidos. Contratos de resposta inalterados.

### Testes executados (resultado real, 2026-10-16)
- `npm run lint` ✅ · `npm run typecheck` ✅ · `npm run build` ✅ · `npm run openapi:check` ✅.
- `npm test`: 12 arquivos, **114 testes** ✅ (104 anteriores + 10 novos: saneamento e diff da auditoria, 401 antes da validação e `no-store` em todas as rotas admin novas e em `/admin/coupons`, 403 para cliente/operação/conteúdo com log sem dados pessoais, catálogo de papéis igual à matriz, validação de entrada).
- `npm run test:integration` (PostgreSQL 17): 6 arquivos, **104 testes** ✅ (92 anteriores + 12 novos): acesso restrito ao admin; lista só da equipe e busca por e-mail; paginação sem repetição; concessão com efeito imediato na mesma sessão e entrada de auditoria com `requestId`; sem registro quando nada muda; revogação imediata; `cannot_modify_self`; **concorrência determinística** (duas contas admin rebaixando uma à outra, liberadas juntas por uma trava externa: uma passa, a outra é recusada, resta exatamente um admin); bloqueio encerra sessões e impede login, reativação devolve o acesso; `UPDATE`/`DELETE` na trilha recusados pelo banco; entrada preservada após excluir a conta autora; cupom/campanha auditados só em alterações efetivas, com rollback em 409/400; transição de pedido auditada sem CPF/telefone/endereço/e-mail; filtros, período e cursor; logs sem e-mail.
- **Teste de mutação:** remover a trava dos administradores e a revalidação do operador fez o teste de concorrência falhar (ambas as requisições `200`, loja sem admin); código restaurado. A primeira versão desse teste **não** detectava a mutação (o `inject` serializava as requisições); foi reescrita para forçar a intercalação.
- Migração aplicada no banco de desenvolvimento (catálogo preservado: 6 produtos).
- Ao vivo (`node dist/server.js`, porta 3334): `/admin/roles` 403 para cliente; anônimo com corpo inválido 401; catálogo de papéis; concessão de `operator` → `/admin/orders` 200 na mesma sessão; `cannot_modify_self`; cupom criado; bloqueio → `/me` 401; trilha com 3 entradas e nome do autor; `Cache-Control: no-store`; `DELETE` direto na tabela recusado pelo gatilho; log do servidor sem e-mail/senha. Contas, cupom e entradas de teste removidos (a tabela de auditoria só continha essas 3 entradas e foi esvaziada com `TRUNCATE`).

### Para o Codex (painel)
1. **Tipos:** incluir em `selected` do gerador: `AdminUser`, `AdminUserList`, `RoleCatalog`, `AuditLogEntry`, `AuditLogList` (e os já existentes `AdminCoupon*`, `AdminCampaign*`, `AdminOrder*`).
2. **Acesso ao painel:** usar `GET /me` → `permissions` para decidir o que mostrar (menu por permissão). A decisão de segurança é sempre do servidor; tratar `401` (login) e `403` (sem acesso) em qualquer tela.
3. **Equipe (`users:manage`):** lista com `GET /admin/users`; "adicionar à equipe" = buscar por e-mail (`?email=`) e `PUT /admin/users/{id}/roles` com o conjunto completo; papéis e descrições de `GET /admin/roles`. Bloquear/reativar com `PATCH .../status`, com confirmação explícita (encerra as sessões da pessoa). Mensagens para `cannot_modify_self` e `last_admin`; ocultar ações sobre a própria conta.
4. **Auditoria (`audit:read`):** linha do tempo com filtros (ação, tipo, recurso, autor, período) e cursor; exibir `changes` como "de → para" e `[redacted]` como "valor protegido". Em telas de detalhe (cupom, campanha, pedido, conta), o histórico do registro é `?resourceType=…&resourceId=…`.
5. **Mudança de comportamento:** `/admin/coupons` e `/admin/campaigns` agora respondem `401` (não `400`) a visitante com corpo inválido, como as demais rotas admin.

### Não implementado / limitações
- E6.2–E6.9 (dashboard, catálogo, estoque, pedidos avançados, clientes, marketing completo, configurações/relatórios, upload): planejadas, não iniciadas.
- Concorrência otimista (`ETag`/`If-Match`) fica para a E6.3, junto da edição do catálogo; cupons/campanhas usam "última escrita vence", agora com trava de linha e auditoria.
- Sem limite de taxa específico para escrita administrativa (vale o limite global por IP); sem segundo fator para contas admin; sem alerta ativo de tentativas negadas (só log). Recomendado antes de produção (E9).
- Retenção/exportação da trilha de auditoria e política de expurgo: E9. A trilha guarda o `id` da conta autora indefinidamente (sem e-mail, sem IP).
- Reconsulta da etiqueta (`order.shipment_sync`) é auditada mesmo quando o status não muda.

## Entrega anterior — E5: checkout, pagamentos e logística (2026-10-15)
- **Situação:** backend E5 implementado e testado localmente (PostgreSQL real, servidores HTTP locais que imitam Mercado Pago e SuperFrete, servidor compilado ao vivo com Mailpit).
- **Branch:** `claude/e5-checkout` (base `36a5d74`, merge do PR #5). **Sem commit, push ou merge**, aguardando autorização.
- **Frontend:** nenhum arquivo de `frontend/` foi alterado.
- **Limitação principal:** não havia credenciais de **sandbox** do Mercado Pago nem da SuperFrete no ambiente; por isso **nenhuma chamada aos sandboxes reais foi feita**. Os clientes HTTP foram escritos a partir da documentação oficial da SuperFrete (superfrete.readme.io) e do código-fonte do SDK oficial do Mercado Pago (sdk-nodejs), e testados contra servidores locais que imitam essas APIs. `npm run sandbox:smoke` valida credenciais e formatos assim que houver tokens de teste.

### Implementado e testado
- **Migração `0004_checkout`** (aditiva): `addresses`, `shipping_quotes`, `orders` (+ sequência `order_number_seq` → `UR001001`), `order_items`, `order_status_history`, `stock_reservations`, `coupon_redemptions`, `payments`, `webhook_events`, `shipments`, `idempotency_keys`, `notifications`; colunas novas anuláveis `product_variants.weight_grams/height_cm/width_cm/length_cm` e `coupons.per_customer_limit`. Restrições no banco: total = subtotal − desconto + frete, linha = preço × quantidade, CPF/CEP/UF/telefone, um endereço padrão por cliente.
- **Endereços** (`src/modules/addresses/`): CRUD do cliente, CPF com dígito verificador, CEP/UF/telefone normalizados, CPF e telefone sempre mascarados nas respostas, limite de 10.
- **Frete** (`src/modules/shipping/`): interface `ShippingProvider`; cliente SuperFrete (cotação, criação de etiqueta pendente, consulta, cancelamento); tabela **simulada** de desenvolvimento (`SHIPPING_PROVIDER=fixture`, `isSimulated: true`, proibida em produção); cotação armazenada e vinculada à sacola, ao seu conteúdo exato e ao CEP.
- **Checkout** (`src/modules/checkout/`): prévia sem efeitos; `POST /checkouts` com `Idempotency-Key`; criação atômica (trava da sacola, recálculo no servidor, reserva condicional de estoque, cupom com trava e limites total/por cliente, cópias imutáveis, histórico, e-mail na fila, sacola esvaziada); `expectedTotal` opcional para recusar total desatualizado.
- **Pedidos** (`src/modules/orders/`): máquina de estados, histórico com autor, consumo da reserva no pagamento, liberação na expiração/cancelamento, aprovação tardia, `attentionReason` para casos que exigem operador; API do cliente (lista, detalhe, pagar, sincronizar, cancelar) e admin mínimo (`orders:manage`).
- **Mercado Pago** (`src/modules/payments/`): interface `PaymentGateway` (pronta para Bricks), Checkout Pro com preferência de linha única no total exato, `X-Idempotency-Key`, expiração alinhada à reserva; webhook com assinatura `x-signature` validada, deduplicação, consulta obrigatória à API oficial, verificação de valor/moeda, `500` em falha temporária.
- **SuperFrete webhook**: `X-ME-Signature` sobre o corpo bruto, estado reconsultado na API, `posted` → `shipped` (e-mail com rastreio), `delivered` → `delivered`.
- **Comunicação** (`src/modules/notifications/`): fila transacional com deduplicação, envio fora de transação, 5 tentativas com espera crescente; 3 modelos de e-mail (recebido, pago, mudança de estado), aviso de pedido demonstrativo; WhatsApp só como interface e canal desligado (nenhum envio).
- **Tarefas** (`src/jobs/jobs.ts`): expiração de reservas (com reconciliação final no Mercado Pago), envio da fila e limpeza, no próprio processo (`JOBS_ENABLED`, `JOBS_INTERVAL_SECONDS`), seguras com várias instâncias (travas/`SKIP LOCKED`).
- **Segurança:** guardas de sessão/permissão rodam antes da validação (anônimo recebe 401, não 400); limites por IP para cotação, pagamento e sincronização; logs sem e-mail, CPF, CEP, endereço ou segredos (testado); `MERCADO_PAGO_MODE=production` e `SUPERFRETE_ENV=production` recusados fora de `NODE_ENV=production`.
- Ajuste pequeno na E4: a resolução da sacola (visitante/conta/junção) virou `createCartResolver` em `cart.routes.ts`, reutilizada pelo checkout, sem mudança de comportamento (66 testes da E4 seguem passando).

### Testes executados (resultado real, 2026-10-15)
- `npm run lint` ✅ · `npm run typecheck` ✅ · `npm run build` ✅ · `npm run openapi:check` ✅ · `npm audit --omit=dev`: 0 vulnerabilidades.
- `npm test`: 11 arquivos, **104 testes** ✅ (89 anteriores + 15 novos: CPF/CEP/máscaras, máquina de estados, assinaturas MP/SuperFrete, clientes HTTP contra servidores locais, validação de ambiente, 401 antes de validação, webhook forjado).
- `npm run test:integration` (PostgreSQL 17 real): 5 arquivos, **92 testes** ✅ (66 anteriores + 26 da E5): endereços; cotação (sucesso, falha 5xx, recusa, sacola com problema); checkout completo com cupom e reserva; idempotência (reenvio, chave reutilizada, chave inválida); **preço adulterado pelo cliente ignorado** e `total_changed`; cotação vencida/de outro CEP/de outra sacola/sacola alterada; **estoque insuficiente**; **cupom inválido/expirado** e limites total e por cliente; **concorrência** (4 compras para 2 unidades → 2×201 + 2×409, reservado = 2); **Mercado Pago fora do ar** (pedido criado, pagamento reaberto depois); **pagamento aprovado, recusado e pendente**; **webhooks duplicados** (estoque consumido uma vez); webhook forjado; valor divergente; falha do provedor → 500 e reprocessamento; sincronização pela página de retorno; **expiração de reserva** (estoque e cupom devolvidos), pagamento aprovado antes da expiração sem webhook, aprovação tardia com/sem estoque; cancelamento pelo cliente; paginação; fila de e-mail com falha e nova tentativa; admin (403, transições, etiqueta, webhook SuperFrete, rastreio, entrega, cancelamento de pago com reposição); logs sem dados pessoais.
- Teste de mutação: remover a condição de estoque da reserva e a verificação de valor do pagamento derrubou os testes de concorrência e de valor divergente; código restaurado.
- Migração aplicada no banco de desenvolvimento; seed reaplicado sem alterar o catálogo (6 produtos).
- Ao vivo (`node dist/server.js`, `SHIPPING_PROVIDER=fixture`, Mercado Pago desligado, tarefas a cada 5 s): cadastro 201 → endereço (CPF mascarado) → sacola → `DEMO10` recusado com `coupon_not_applicable` (cupom restrito à Ritual Collection) → cotação simulada → prévia (25980 + 1990 = 27970) → `POST /checkouts` 201 `UR001001` com `payment: null` → `POST /orders/{id}/payment` 503 `payment_unavailable` → e-mail "Pedido UR001001 recebido" no Mailpit → reserva vencida → tarefa expirou o pedido, estoque reservado 2 → 0, e-mail "Expirado" no Mailpit. Log sem e-mail/CPF. Dados e e-mails fictícios removidos.
- **Não executado:** sandbox real do Mercado Pago e da SuperFrete (sem credenciais); CI do GitHub (nada enviado).

### Não implementado / limitações
- Checkout de visitante (sem conta): não implementado; o checkout exige login.
- Estorno, pagamento de etiquetas na carteira SuperFrete e emissão de NF-e: não automatizados (ações financeiras/fiscais manuais). Envio com declaração de conteúdo.
- Frete grátis por cupom: não implementado.
- Assinatura da SuperFrete: codificação do HMAC não documentada; aceitamos hex e base64 — confirmar com notificação real.
- Medidas reais dos produtos: variantes do seed não têm peso/medidas; vale o padrão `SHIPPING_DEFAULT_*` (300 g, 28×20×4 cm).
- Reconciliação periódica de pagamentos pendentes além da expiração: não há (só na expiração e por `payment/sync`).
- Webhooks do Mercado Pago só chegam a uma URL pública https (túnel em desenvolvimento).
- Limites de requisição em memória (uma instância).

## Pedidos ao Codex (E5)
1. **Tipos:** `npm run openapi:generate` no frontend e incluir em `selected`: `Address`, `AddressList`, `ShippingQuote`, `ShippingOption`, `CheckoutSummary`, `CheckoutResult`, `PaymentSession`, `Order`, `OrderItem`, `OrderSummary`, `OrderList`, `OrderStatus`, `OrderShippingAddress`, `OrderPayment`, `OrderTracking` (e `AdminOrder`, `AdminOrderSummary`, `AdminOrderList` para o futuro painel).
2. **Frete na sacola:** campo de CEP → `POST /shipping/quotes`; mostrar opções (nome, transportadora, preço, prazo em dias úteis). Se `isSimulated`, exibir aviso "valores simulados". Tratar `409 cart_has_issues`, `400 shipping_rejected`, `503 shipping_unavailable`. A sacola (`GET /cart`) continua com `totals.shipping: null`: o frete só entra no total no checkout.
3. **Checkout (`/checkout`):** exige sessão (redirecionar ao login preservando o destino). Passos: endereço (`GET/POST /me/addresses`, formulário com CPF, telefone, CEP, UF) → cotar para o CEP do endereço → escolher modalidade → `POST /checkouts/preview` → revisar → confirmar com `POST /checkouts` enviando `Idempotency-Key` (UUID gerado ao abrir a etapa de confirmação e reutilizado em reenvios) e `expectedTotal` igual ao total exibido. Botão desabilitado durante o envio.
4. **Respostas do checkout:** `201` → redirecionar para `payment.checkoutUrl`; se `payment` for `null`, ir para o pedido com botão "Pagar" (`POST /orders/{id}/payment`). `409 total_changed` → recarregar a prévia e pedir nova confirmação. `409 shipping_quote_expired`/`shipping_quote_mismatch` → cotar de novo. `409 cart_has_issues`/`insufficient_stock` → voltar à sacola. Cupom em `cart.coupon` → mostrar motivo e oferecer remover.
5. **Retorno do Mercado Pago:** criar **`/checkout/retorno?pedido={id}`** → `POST /orders/{id}/payment/sync` e então exibir `GET /orders/{id}`. Mostrar o estado do **servidor** (aprovado, pendente com opção de aguardar/atualizar, recusado com "Tentar novamente" via `POST /orders/{id}/payment`). **Não** ler `status`/`collection_status` da URL.
6. **Área do cliente:** `/conta/pedidos` (`GET /orders`, cursor) e **`/conta/pedidos/{id}`** (link dos e-mails): itens, totais, endereço mascarado, frete, rastreio (`shipping.tracking`), histórico, botões conforme `canPay`/`canCancel`, contador até `reservationExpiresAt` enquanto pendente; `/conta/enderecos` com CRUD. Exibir `isDemo`.
7. **Ambiente local:** com `SHIPPING_PROVIDER=fixture` no `backend/.env` o fluxo inteiro funciona sem credenciais (pagamento fica `payment_unavailable`). CEP `99999999` simula falha do frete.

## Riscos e observações (E5)
- Pedidos são criados e o estoque reservado antes do pagamento; a sacola é esvaziada na criação do pedido. Se o pedido expirar, os itens não voltam para a sacola (o cliente refaz a compra).
- A tarefa em segundo plano roda no processo da API; em produção com várias instâncias continua correta (travas), mas pode convir separar em worker.
- `payment_amount_mismatch`, `paid_after_*`, `chargeback` e `refund_required` precisam de tela de atenção no painel (E6).

## Entrega anterior — E4: sacola, favoritos, cupons, campanhas e newsletter (2026-10-15)
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
| `GET /api/v1/admin/roles`, `GET /admin/users`, `PUT /admin/users/{id}/roles`, `PATCH /admin/users/{id}/status` | Implementadas e testadas (E6.1) | Painel — tela de equipe |
| `GET /api/v1/admin/audit-logs` | Implementada e testada (E6.1) | Painel — auditoria e histórico por registro |
| `GET/POST /api/v1/me/addresses`, `PATCH`/`DELETE /me/addresses/{id}` | Implementadas e testadas (E5) | Sim — checkout e `/conta/enderecos` |
| `POST /api/v1/shipping/quotes` | Implementada e testada (E5; sandbox real pendente de credenciais) | Sim — sacola e checkout |
| `POST /api/v1/checkouts/preview`, `POST /api/v1/checkouts` | Implementadas e testadas (E5) | Sim — `/checkout` |
| `GET /api/v1/orders`, `GET /orders/{id}`, `POST /orders/{id}/payment`, `/payment/sync`, `/cancel` | Implementadas e testadas (E5) | Sim — retorno do pagamento e área do cliente |
| `POST /api/v1/webhooks/mercadopago`, `/webhooks/superfrete` | Implementadas e testadas com servidores locais (E5) | Não (servidor-a-servidor) |
| `/api/v1/admin/orders` (+ `/{id}`, `/transitions`, `/shipments`, `/shipments/{id}/sync`) | Implementadas e testadas (E5) | Futuro painel (E6) |
| `GET /api/v1/cart`, `POST /cart/items`, `PATCH`/`DELETE /cart/items/{itemId}`, `POST /cart/import`, `PUT`/`DELETE /cart/coupon` | Implementadas e testadas (E4) | Sim — drawer, `/carrinho`, cupom |
| `GET /api/v1/me/favorites`, `PUT`/`DELETE /me/favorites/{productId}`, `POST /me/favorites/import` | Implementadas e testadas (E4) | Sim — `/favoritos`, coração dos cards (com sessão) |
| `GET /api/v1/campaigns/active` | Implementada e testada (E4) | Sim — `CampaignPanel`, barra de anúncio |
| `POST /api/v1/newsletter/subscriptions`, `/newsletter/confirm`, `/newsletter/unsubscribe` | Implementadas e testadas (E4) | Sim — rodapé + 2 páginas novas |
| `/api/v1/admin/coupons`, `/api/v1/admin/campaigns` (+ `/{id}`) | Implementadas e testadas (E4) | Futuro painel (E6) |
| `POST /api/v1/auth/register`, `/auth/login`, `/auth/logout`, `GET /me`, `POST /me/password`, `/auth/password/*` | Implementadas e testadas (E3) | Sim — já integradas |
| `GET /api/v1/products`, `/products/{slug}`, `/collections`, `/collections/{slug}`, `/categories` | Implementadas e testadas (E2) | Sim — já integradas |
| `GET /api/v1/health`, `/health/live` | Implementadas e testadas (E1) | Não |

Para rodar: `cd backend && npm install && npm run db:up && npm run db:migrate && npm run db:seed && npm run dev` → `http://127.0.0.1:3333/docs`. E-mails de desenvolvimento em `http://127.0.0.1:8025`.

## Pedidos ao Codex (E4, ainda válidos)
1. **Tipos:** rodar `npm run openapi:generate` no frontend e incluir em `selected` de `scripts/generate-openapi-types.mjs` os schemas `Cart`, `CartItem`, `CartCoupon`, `CartItemIssue`, `CouponIssue`, `CartImportResponse`, `Favorite`, `FavoriteList`, `Campaign`, `ActiveCampaigns` (todos os construtos usados já são suportados pelo gerador).
   - Observação: o `openapi:check` do frontend falha **hoje mesmo com o `openapi.json` do `HEAD`**, só por fim de linha: `frontend/src/types/openapi.d.ts` está com CRLF na cópia local e o check não normaliza `\r\n` (o do backend normaliza). O conteúdo gerado é idêntico. Sugestão: normalizar `\r\n` antes de comparar ou fixar `eol=lf` em `.gitattributes`.
2. **Sacola:** trocar o reducer local por `/api/v1/cart*` com `credentials: "include"`; usar `items[].maxQuantity` no seletor, `issues` para avisos por item e `totals`/`coupon` exatamente como recebidos (sem recalcular). Tratar `409` por `details[0].code` (`insufficient_stock`, `out_of_stock`, `max_quantity_exceeded`, `cart_full`, `unavailable`) e `404` (item/variante). `variant.availability` e `previousUnitPrice` estão disponíveis para mensagens.
3. **Migração da prévia:** na primeira carga com o backend disponível, enviar as linhas do `localStorage` para `POST /cart/import` (uma vez) e limpar a chave `usrock-commerce-preview-v1`; mostrar `skipped` se houver. Após login/cadastro, basta chamar `GET /cart` — a junção acontece no servidor.
4. **Favoritos:** com sessão, usar `/me/favorites*`; após login, importar os favoritos locais com `POST /me/favorites/import` e limpar o local. Visitante continua com favoritos locais. `PUT`/`DELETE` sem corpo: enviar `{}` ou não enviar `Content-Type` (com `Content-Type: application/json` e corpo vazio o Fastify responde 400).
5. **Cupom:** `CouponForm` → `PUT /cart/coupon { code }`; remover com `DELETE /cart/coupon`. Mensagens por `details[0].code` (lista na seção de contratos); `coupon.status = "not_applicable"` + `issue` quando um cupom já aplicado deixa de valer.
6. **Campanhas:** `CampaignPanel` → `GET /campaigns/active?placement=home_panel` (server-side; cache de 60 s); exibir `cta`, `media`, `endsAt` (contador), `couponCode` quando presentes; estado vazio quando `data` for `[]`; sinalizar `isDemo`.
7. **Newsletter:** `POST /newsletter/subscriptions { email, consent: true, source: "footer" }`. A caixa de consentimento deve ser **obrigatória e desmarcada** (o texto atual "Opcional; comunicações editoriais" precisa mudar, porque a newsletter em si é marketing). Exibir sempre a mensagem do 202. Criar as páginas **`/newsletter/confirmar?token=`** (POST `/newsletter/confirm`) e **`/newsletter/cancelar?token=`** (POST `/newsletter/unsubscribe`), com `Referrer-Policy: no-referrer`, `noindex` e tratamento de `400 invalid_token`.
8. **Checkout:** disponível no backend desde a E5 — ver "Pedidos ao Codex (E5)". `totals.shipping` da sacola continua `null`; o frete entra no total do checkout.

## Riscos e observações
- Repositório dentro do OneDrive (risco de lentidão/bloqueio com `node_modules`).
- Limites de requisição em memória: válidos para uma instância; com várias instâncias será preciso armazenamento compartilhado.
- A sacola não reserva estoque: dois clientes podem ter a mesma última unidade na sacola; a reserva e a confirmação definitiva ficam no checkout (E5).
- `maxQuantity` revela o estoque disponível até 10 unidades (prática comum; quantidades maiores continuam ocultas).
- Cadastro com e-mail já existente retorna 409 (ver E3); a newsletter, ao contrário, não revela inscrições.
- `npm audit`: 0 vulnerabilidades em produção; as moderadas do `drizzle-kit` (ferramenta de desenvolvimento) continuam.

## Próxima tarefa do Claude
- **Validar E5 nos sandboxes reais** assim que houver credenciais de teste: `npm run sandbox:smoke`, compra de teste com comprador de teste e cartões `APRO`/`OTHE`/`CONT`, webhook por túnel https, cotação e etiqueta no sandbox SuperFrete (confirmar codificação de `X-ME-Signature`).
- **E6.2 — Dashboard (aguarda revisão da E6.1):** indicadores reais de pedidos, vendas, faturamento, ticket médio, status, fila de atenção, estoque baixo e mais vendidos, com período e fuso `America/Sao_Paulo`. Em seguida, E6.3 (catálogo com `ETag`/`If-Match`).

## Entregas anteriores
### E3 — contas, sessão e permissões (2026-10-13)
Migração `0002_accounts` (`users`, `sessions`, `password_reset_tokens`, `consents`); cadastro, login, logout, `/me`, troca e recuperação de senha por e-mail (Mailpit); sessão por cookie `usrock_session` httpOnly com só o hash no banco, expiração absoluta e por inatividade; Argon2id; limites por IP e por e-mail; consentimentos LGPD com versão da política; comando `user:create-admin`. Verificado: 67 testes unitários e 45 de integração. Pendências: textos jurídicos, verificação de e-mail, gestão de usuários (E6), LGPD (E9).

### E2 — catálogo público, somente leitura (2026-10-13)
Migração `0001_catalog` (categorias, coleções, produtos com busca full-text, variantes com preço em centavos, mídia, estoque e movimentações); rotas `GET /api/v1/products` (busca, filtros, 4 ordenações, cursor), `/products/{slug}`, `/collections`, `/collections/{slug}`, `/categories`; disponibilidade pública sem quantidades; `npm run db:seed` com os 6 produtos demonstrativos (`isDemo: true`). Verificado: 52 testes unitários e 27 de integração.

### E1 — fundação do backend (2026-10-13)
Fastify + TypeScript em `backend/`, ambiente validado por Zod, PostgreSQL 17 + Mailpit no Docker (Postgres na porta 5433 do host), Drizzle com migração `0000_init` (`citext`), `/api/v1/health` e `/health/live`, envelope de erro padronizado, `X-Request-Id`, paginação por cursor, `Money` em centavos, logs pino com mascaramento, helmet/CORS/rate limit/verificação de Origin, OpenAPI 3.1 + Swagger UI em dev, CI em `.github/workflows/backend-ci.yml`. Verificado: 40 testes unitários e 4 de integração.
