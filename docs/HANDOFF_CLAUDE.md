# Handoff — Claude para Codex

> Escreva aqui o que o backend concluiu, quais APIs estão disponíveis e o que o frontend deve conectar.

## Última entrega — E3: contas, sessão e permissões (2026-10-13)
- **Situação:** API de contas implementada e testada localmente, incluindo envio real de e-mail para o Mailpit.
- **Branch:** `claude/backend` (base `b92f08b`). **E1, E2 e E3 sem commit, push ou merge**, aguardando autorização do responsável.
- **Frontend:** nenhum arquivo de `frontend/` foi alterado.

### Implementado e testado
- Migração `backend/drizzle/0002_accounts.sql`: `users`, `sessions`, `password_reset_tokens`, `consents`.
- Rotas (contrato completo em `docs/API_CONTRACTS.md`, seção "Autenticação, sessão e autorização"):
  - `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`
  - `GET /api/v1/me`, `POST /api/v1/me/password`
  - `POST /api/v1/auth/password/forgot`, `POST /api/v1/auth/password/reset`
- Sessão por cookie `usrock_session` (`HttpOnly`, `SameSite=Lax`, `Secure` em produção), token guardado só como hash, expiração absoluta (30 d) e por inatividade (14 d), sessão nova a cada login, revogação em logout/troca/redefinição de senha.
- Senhas com Argon2id; política de 10–128 caracteres; resposta 401 única para credenciais inválidas; recuperação de senha sem revelar se o e-mail existe.
- Limites: 10 tentativas/15 min por IP nas rotas de conta; por e-mail, 10 no login e 3 na recuperação de senha.
- Consentimentos LGPD registrados no cadastro (termos, privacidade e marketing por e-mail) com versão do texto e origem.
- E-mail via SMTP (Mailpit em dev; provedor de produção a definir) com template de redefinição de senha.
- Comando `npm run user:create-admin -- --email ... --name "..."` para o primeiro administrador.

### Testes executados (resultado real, 2026-10-13)
- `npm run lint` ✅ · `npm run typecheck` ✅ · `npm run build` ✅ · `npm run openapi:check` ✅
- `npm test`: 9 arquivos, **67 testes** ✅ · `npm run test:integration` (PostgreSQL 17 real): 3 arquivos, **45 testes** ✅
- Cobertura das contas: cadastro e consentimentos, duplicidade sem diferenciar maiúsculas, cookie com atributos corretos, só hash no banco, `/me`, logout idempotente, sessão expirada/inativa/usuário desativado, 401 idêntico, Origin estranha bloqueada, permissões de admin, recuperação (e-mail, uso único, link anterior invalidado, expiração, revogação de sessões), troca de senha, limites por IP e por e-mail, e logs sem senha/e-mail/token.
- Ponta a ponta manual com servidor real: pedido de redefinição → e-mail recebido no Mailpit → token do link → nova senha → login → `/me` (admin com todas as permissões) → logout → `/me` 401 → cadastro 201. As contas de teste foram apagadas do banco de desenvolvimento em seguida.
- CI do GitHub não executado (nada enviado).

### Não implementado
- Textos de Termos de Uso e Política de Privacidade (o consentimento registra a versão `rascunho-2026-10`); verificação de e-mail (`emailVerified` fica `false`); edição de perfil/endereços (endereços entram com o checkout, E5); gestão de usuários pelo admin (E6); exportação/anonimização de dados LGPD (E9).
- Envio de e-mail em segundo plano sem fila: se o SMTP falhar, o erro é registrado no log e não há nova tentativa (fila prevista para a E5).

## APIs disponíveis
| Rota | Estado | Para o frontend? |
|---|---|---|
| `POST /api/v1/auth/register`, `/auth/login`, `/auth/logout` | Implementadas e testadas | Sim — cadastro, login, sair |
| `GET /api/v1/me` | Implementada e testada | Sim — estado da sessão, menu da conta, permissões do admin |
| `POST /api/v1/me/password` | Implementada e testada | Sim — área do cliente |
| `POST /api/v1/auth/password/forgot`, `/auth/password/reset` | Implementadas e testadas | Sim — "esqueci minha senha" e página de redefinição |
| `GET /api/v1/products`, `/products/{slug}`, `/collections`, `/collections/{slug}`, `/categories` | Implementadas e testadas (E2) | Sim — catálogo |
| `GET /api/v1/health`, `/health/live` | Implementadas e testadas (E1) | Não |

Para rodar: `cd backend && npm install && cp .env.example .env && npm run db:up && npm run db:migrate && npm run db:seed && npm run dev` → `http://127.0.0.1:3333/docs`. E-mails de desenvolvimento aparecem em `http://127.0.0.1:8025`.

## Pedidos ao Codex
1. **Rewrite `/api/*` → backend** (pré-requisito do login): em `frontend/next.config.ts`, `rewrites()` de `/api/:path*` para `${process.env.USROCK_API_ORIGIN}/api/:path*` (local `http://127.0.0.1:3333`), documentando `USROCK_API_ORIGIN` em `frontend/.env.example`. Com isso o cookie de sessão fica no domínio da loja. Chamadas `fetch` do navegador usam caminho relativo (`/api/v1/...`); em Server Components, repassar o cabeçalho `cookie` da requisição ao chamar o backend.
2. **Telas de conta:**
   - **Cadastro:** nome, e-mail, senha (mín. 10 caracteres), caixa obrigatória "Li e aceito os Termos de Uso e a Política de Privacidade" (`acceptTerms: true`) e caixa **opcional e desmarcada por padrão** para e-mails de marketing (`marketingEmailOptIn`). Os links dos termos ainda não têm conteúdo; sinalizar como pendente.
   - **Login** e **logout**; menu da conta baseado em `GET /api/v1/me` (401 = visitante).
   - **"Esqueci minha senha":** exibir sempre a mensagem retornada (202), sem indicar se a conta existe.
   - **Página `/conta/redefinir-senha?token=...`** (rota usada no link do e-mail): formulário de nova senha → `POST /api/v1/auth/password/reset`; em `400 invalid_token`, oferecer novo pedido; após sucesso, enviar ao login. Usar `Referrer-Policy: no-referrer` nessa página e não registrar o token em analytics/logs.
   - **Trocar senha** na área do cliente (`POST /api/v1/me/password`).
3. **Erros:** `401` login → "E-mail ou senha inválidos."; `409` cadastro → oferecer login/recuperação; `429` → aguardar (`Retry-After`); validação → `details[].path` + `code`.
4. **Catálogo (pendente da E2):** substituir os mocks de `storefront.ts` pelas rotas do catálogo e ajustar `types/catalog.ts` (Money em centavos, `collections`, `primaryMedia`/`media`, preço por variante, `low_stock`, `isDemo`, guardar `variantId` ao adicionar à sacola).
5. **Admin (futuro):** esconder/mostrar áreas do painel com base em `user.permissions`; o backend sempre revalida.

## Riscos e observações
- Repositório dentro do OneDrive (risco de lentidão/bloqueio com `node_modules`).
- Limites de requisição em memória: válidos para uma instância; com várias instâncias será preciso armazenamento compartilhado.
- Cadastro com e-mail já existente retorna 409, o que permite descobrir se um e-mail tem conta; mitigado pelo limite por IP. Alternativa mais restritiva (confirmação por e-mail antes de criar a conta) pode ser adotada com a verificação de e-mail.
- `npm audit`: 0 vulnerabilidades em produção; 4 moderadas apenas no `drizzle-kit` (ferramenta de desenvolvimento).

## Próxima tarefa do Claude
- **E4 — Carrinho e marketing (aguarda autorização):** carrinho de visitante (cookie) e de conta com junção no login, totais calculados no servidor, cupons, `GET /api/v1/campaigns/active`, favoritos sincronizados e newsletter com confirmação em duas etapas.

## Entregas anteriores
### E2 — catálogo público, somente leitura (2026-10-13)
Migração `0001_catalog` (categorias, coleções, produtos com busca full-text, variantes com preço em centavos, mídia, estoque e movimentações); rotas `GET /api/v1/products` (busca, filtros, 4 ordenações, cursor), `/products/{slug}`, `/collections`, `/collections/{slug}`, `/categories`; disponibilidade pública sem quantidades; `npm run db:seed` com os 6 produtos demonstrativos (`isDemo: true`). Verificado: 52 testes unitários e 27 de integração.

### E1 — fundação do backend (2026-10-13)
Fastify + TypeScript em `backend/`, ambiente validado por Zod, PostgreSQL 17 + Mailpit no Docker (Postgres na porta 5433 do host), Drizzle com migração `0000_init` (`citext`), `/api/v1/health` e `/health/live`, envelope de erro padronizado, `X-Request-Id`, paginação por cursor, `Money` em centavos, logs pino com mascaramento, helmet/CORS/rate limit/verificação de Origin, OpenAPI 3.1 + Swagger UI em dev, CI em `.github/workflows/backend-ci.yml`. Verificado: 40 testes unitários e 4 de integração.
