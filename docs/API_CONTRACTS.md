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
