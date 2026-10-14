# UsRock — backend

API da UsRock: Node.js 24 + TypeScript, Fastify 5, PostgreSQL 17 + Drizzle ORM, Zod 4 e OpenAPI 3.1.
Estado: **E1 (fundação) + E2 (catálogo público) + E3 (contas, sessão, permissões)**. Carrinho, pedidos e pagamentos ainda não existem.

## Rodando localmente

Pré-requisitos: Node.js 24, Docker Desktop em execução.

```bash
cd backend
npm install
cp .env.example .env          # valores locais; nunca commitar .env
npm run db:up                 # PostgreSQL (127.0.0.1:5433) + Mailpit (UI em http://127.0.0.1:8025)
npm run db:migrate
npm run db:seed               # catálogo DEMONSTRATIVO (6 produtos do mock da home)
npm run dev                   # http://127.0.0.1:3333 — docs em http://127.0.0.1:3333/docs
```

No PowerShell, se a política bloquear `npm.ps1`, use `npm.cmd`.

## Scripts

| Script | O que faz |
|---|---|
| `dev` | Servidor com recarga (tsx) e logs legíveis |
| `build` / `start` | Compila para `dist/` e executa a versão compilada |
| `lint` / `typecheck` | ESLint (regras com tipos) e TypeScript |
| `test` | Testes unitários (sem banco) |
| `test:integration` | Testes contra PostgreSQL real; **apaga e recria** o banco de `TEST_DATABASE_URL` (precisa terminar em `_test`) |
| `db:up` / `db:down` | Sobe/para a infraestrutura local via Docker Compose |
| `db:generate` | Gera migração a partir do schema Drizzle (`--custom` para SQL manual) |
| `db:migrate` | Aplica migrações pendentes em `DATABASE_URL` |
| `db:seed` | Insere/atualiza o catálogo demonstrativo (`is_demo`); recusado em produção; nunca sobrescreve produto real nem estoque existente |
| `user:create-admin` | Cria o primeiro admin ou promove conta existente: `npm run user:create-admin -- --email x@y --name "Nome"`; senha em `ADMIN_PASSWORD` (obrigatória em produção) |
| `openapi:generate` / `openapi:check` | Gera `openapi/openapi.json` / falha se estiver desatualizado (usado no CI) |

## Estrutura

```
src/
  app.ts                 montagem da aplicação (plugins + módulos sob /api/v1)
  server.ts              entrada: env, pool do banco, listen, desligamento gracioso
  config/                env.ts (validação Zod), logger.ts (pino + redação)
  db/                    client.ts (pool + Drizzle), migrate.ts, schema/ (índice das tabelas)
  plugins/               error-handler, security (helmet/CORS/rate limit/Origin), openapi
  shared/                errors (envelope de erro), pagination (cursor), money (centavos)
  modules/
    auth/                papéis, permissões, guards, interface SessionResolver
    accounts/            usuários, sessões por cookie, senha (Argon2id), recuperação, consentimentos
    mail/                envio SMTP (Mailpit em dev) e templates
    health/              GET /api/v1/health e /health/live
    catalog/             schema (tabelas), contracts (Zod/OpenAPI), repository (SQL), mappers, routes
  db/seed.ts             seed demonstrativo (dados em db/seed-data/)
  cli/create-admin.ts    criação do primeiro administrador
drizzle/                 migrações SQL versionadas
openapi/openapi.json     contrato gerado — referência para o frontend
test/                    *.test.ts (unitários) e *.int.test.ts (integração)
```

Novos domínios entram como `src/modules/<nome>/` com `*.routes.ts`, `*.service.ts`, `*.schema.ts` (tabelas Drizzle,
reexportadas em `src/db/schema/index.ts`) e testes, registrados em `app.ts` sob `/api/v1`.

## Convenções

Ver `docs/API_CONTRACTS.md`. Resumo: envelope de erro único com `requestId`; listas `{ data, pageInfo }` com cursor opaco;
dinheiro em centavos inteiros (`Money`); datas ISO 8601 UTC; contrato derivado dos schemas Zod.
