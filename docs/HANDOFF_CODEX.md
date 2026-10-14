# Handoff — Codex para Claude

> Escreva aqui o que o frontend concluiu, de quais contratos depende e o que o backend precisa fornecer.

## Última entrega — integração E1/E2 validada (2026-10-13)
- Situação: comunicação Next.js → Fastify → PostgreSQL e catálogo público E2 **implementados e validados localmente** na branch `codex/integracao-backend`. Sem commit, push ou merge.
- Comunicação: rewrite `/api/:path*` para `${USROCK_API_ORIGIN}/api/:path*`, com padrão local `http://127.0.0.1:3333`; variável somente de servidor documentada em `frontend/.env.example`; cliente HTTP central com `credentials: include`, timeout, envelope de erro por `code`, `requestId`, detalhes e `Retry-After`; helper server-only encaminha cookie HttpOnly ao Fastify. A proteção CSRF continua no Fastify por validação de `Origin`, conforme contrato E1.
- Contratos: `frontend/scripts/generate-openapi-types.mjs` lê `backend/openapi/openapi.json`, gera `frontend/src/types/openapi.d.ts` e possui modo `--check` sem escrita; os tipos de catálogo derivam de `components.schemas`. Dinheiro é mantido como `amountMinor` inteiro e só dividido por 100 na formatação BRL.
- Catálogo: homepage deixou de importar produtos fictícios e consulta `/products` e `/collections`; `/catalogo` implementa busca, categoria, coleção, tamanho, faixa de preço, disponibilidade, quatro ordenações e cursor; `/produto/[slug]` implementa galeria, variantes, preços, disponibilidade e uma seleção adicional da mesma categoria (não rotulada como recomendação do backend). Estados de carregamento, vazio, erro, indisponibilidade e 404 foram adicionados.
- Segurança comercial: `isDemo` aparece nos cards/detalhe; carrinho continua local e explicitamente demonstrativo porque E4 não existe. Nenhum preço, desconto, estoque ou condição foi inventado no frontend.
- Arquivos principais: `frontend/next.config.ts`, `.env.example`, `package.json`, `scripts/generate-openapi-types.mjs`, `src/types/{openapi.d.ts,catalog.ts}`, `src/lib/api/*`, `src/lib/format.ts`, `src/app/{page,loading,error}.tsx`, `src/app/catalogo/*`, `src/app/produto/[slug]/*`, componentes `product-card`, `product-options`, `catalog-state`, `header`, `storefront-provider`, `globals.css`, além desta documentação e `PROJECT_ANCHOR.md`.
- Correções da auditoria: gerador OpenAPI passou a interpretar `const` e `type: [...]` anulável; link interno do header usa `next/link`; serialização tipada dos filtros foi ajustada; `loading.tsx` global foi removido porque o streaming antecipava HTTP 200 para produto inexistente, mantendo loading em `/catalogo`; `openapi:check` passou a comparar o conteúdo mesmo quando o arquivo ainda não está rastreado. Um `package-lock.json` vazio criado acidentalmente na raiz durante a falha anterior foi removido.
- Validações de frontend: `npm.cmd run openapi:generate`, `npm.cmd run openapi:check`, `npm.cmd run lint`, `npm.cmd run typecheck` e `npm.cmd run build` passaram. Build Next.js 16.4 compilou `/`, `/catalogo` e `/produto/[slug]` como rotas dinâmicas; `/_not-found` permaneceu estática.
- Evidência de banco/API: Docker saudável; migrações aplicadas; seed idempotente; PostgreSQL continha `6` produtos, `26` variantes, `6` mídias, `3` coleções e `1` categoria. A linha `nocturne-wings-oversized|Nocturne Wings Oversized|12990` consultada diretamente no PostgreSQL coincidiu em slug, nome e menor preço com o Fastify. `/health` confirmou banco `up`.
- Evidência via Next: `/api/v1/products` pelo rewrite devolveu os mesmos IDs e centavos do Fastify; homepage e `/catalogo` continham o produto do banco e não continham os IDs antigos do mock. Passaram busca, categoria, coleção, tamanho, faixa em reais convertida para centavos, somente disponíveis, ordenação crescente/decrescente e cursor.
- Estados: loading do catálogo presente no stream; resultado vazio exibido; `VALIDATION_ERROR` preservou HTTP 400 e `code`; produto inexistente passou a retornar HTTP 404; com Fastify desligado, home e catálogo exibiram indisponibilidade sem mock, e detalhe retornou HTTP 500 com shell do error boundary (`ApiError.code = SERVICE_UNAVAILABLE`).
- Serviços após a auditoria: processos Fastify e Next.js encerrados; containers PostgreSQL e Mailpit continuam ativos e saudáveis.

### Execução local exata
```powershell
cd backend
npm.cmd run db:up
npm.cmd run db:migrate
npm.cmd run db:seed
npm.cmd run dev

# Em outro terminal
cd frontend
npm.cmd run openapi:check
npm.cmd run dev
```
A loja fica em `http://localhost:3000`, API direta em `http://127.0.0.1:3333` e Swagger em `http://127.0.0.1:3333/docs`.

## Pedidos ao Claude
- Nenhum bloqueio contratual para E2 encontrado. Produtos relacionados não têm endpoint próprio; o frontend mostra apenas "mais da categoria" usando o filtro existente.
- Manter `isDemo` enquanto preços/estoques do seed forem ilustrativos. Carrinho e validação autoritativa de preço/estoque dependem da E4/E5.
- Nenhum erro de implementação do backend foi encontrado nesta auditoria.

## Próxima tarefa do Codex
- Apresentar E1/E2 para revisão do responsável. Somente após aprovação explícita, iniciar telas e fluxo real de autenticação E3.
