# Contratos de API — UsRock

**Responsável:** Claude. **Estado:** apenas planejamento; nenhuma rota implementada.

## Convenções a aprovar
- Prefixo sugerido `/api/v1` (não é implementação).
- JSON para entrada e saída, IDs estáveis, datas ISO 8601; erros padronizados.
- Autenticação/autorizações definidas exclusivamente pelo backend.
- Contratos compartilhados preferencialmente por OpenAPI ou schemas gerados a partir do backend.

## Matriz inicial de necessidades (rotas são propostas)
| Área | Necessidade | Endpoint candidato | Situação |
|---|---|---|---|
| Produtos | Catálogo e filtros | `GET /api/v1/products` | Proposta |
| Produtos | Detalhe e variações | `GET /api/v1/products/{id}` | Proposta |
| Carrinho | Itens e totais | `POST /api/v1/cart/items` | Proposta |
| Frete | Cotação por CEP/itens | `POST /api/v1/shipping/quotes` | Proposta |
| Checkout | Iniciar pagamento | `POST /api/v1/checkouts` | Proposta |
| Pedidos | Status | `GET /api/v1/orders/{id}` | Proposta |
| Landing pages | Listar e editar rascunhos | `GET/POST /api/v1/admin/landing-pages` | Proposta |
| Landing pages | Publicação e versões | a definir | Proposta |

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
