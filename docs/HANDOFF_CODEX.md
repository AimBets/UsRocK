# Handoff — Codex para Claude

> Escreva aqui o que o frontend concluiu, de quais contratos depende e o que o backend precisa fornecer.

## Última entrega — correção urgente da regressão de catálogo na E4 (2026-10-15)
- Causa comprovada: o PostgreSQL continuava saudável e continha 6 produtos, 26 variantes e 6 mídias, mas o Fastify não estava ativo. O log do Next registrava `ECONNREFUSED 127.0.0.1:3333`; como homepage e catálogo consomem exclusivamente a API real, as vitrines exibiam corretamente o estado de indisponibilidade e não recorriam a mocks. A comparação com `HEAD` confirmou que a E4 não alterou filtros, cliente HTTP, rewrite nem consultas do catálogo.
- Recuperação: migrações e seed idempotentes foram reaplicados; Fastify e Next foram executados juntos. API direta e rewrite devolveram os mesmos seis IDs/slugs. Homepage e `/catalogo` renderizaram os seis produtos; os seis detalhes responderam 200; todas as seis mídias responderam 200 como `image/png` e com corpo não vazio.
- Correção frontend: `/produto/[slug]` agora diferencia indisponibilidade da API de `NOT_FOUND`. Falha de conexão rende estado explícito com retorno ao catálogo e “Tentar novamente”, em vez de depender de um 500/error boundary; 404 permanece reservado a produto realmente ausente.
- Prevenção: criado `npm.cmd run test:catalog-live`, que exige Fastify e Next reais e valida API direta, rewrite, os seis slugs/variantes/mídias, homepage, catálogo, seis detalhes, seis arquivos de imagem, `/carrinho` e `/favoritos`. Não há fallback para mocks.
- Ambiente: `turbopack.root` foi fixado em `frontend/`, eliminando a inferência ambígua causada por um `package-lock.json` não rastreado na raiz sem apagar esse arquivo potencialmente paralelo. Um bloqueio `EPERM` do OneDrive em `.next` foi resolvido removendo somente o cache gerado e recriável antes do build limpo.
- E4 preservada: drawer, carrinho, favoritos e persistência local permaneceram. Os testes agora também cobrem restauração conjunta, remoção do carrinho e preservação dos favoritos.
- Evidência visual em Edge headless: catálogo desktop mostrou os seis cards e suas imagens; detalhe mostrou a imagem principal e três relacionados; homepage/hero desktop e mobile preservaram fotografia, cabeçalho e identidade. O scroll por fragmento do Edge headless não posicionou as seções inferiores da homepage, portanto sua presença foi comprovada pelo HTML renderizado e pelo teste ao vivo, não por screenshot dedicado.
- Verificações finais: banco `6/26/6`; `npm.cmd test` (**6/6**), `npm.cmd run test:catalog-live`, `openapi:check`, lint, TypeScript e build passaram. O build final não emitiu o aviso de múltiplos lockfiles. Nenhum arquivo de `backend/` foi modificado.
- Próximo passo exato: manter Fastify ativo ao executar a loja e incluir `test:catalog-live` na revisão/CI integrada quando houver ambiente com PostgreSQL; só então revisar e autorizar commit/PR da branch `codex/e4-commerce`.

## Entrega anterior — prévia local de comércio E4 (2026-10-15)
- Situação: frontend de sacola e favoritos concluído na branch `codex/e4-commerce`, sem alterações em `backend/`. A entrega é deliberadamente local e não se apresenta como integração E4 pronta.
- Sacola: drawer reutilizável, rota `/carrinho`, linhas por variante, quantidade limitada a 10 na prévia, remoção, subtotal inteiro em centavos, estados vazio/carregando/erro de persistência e CTA de checkout desabilitada até existirem revalidação autoritativa, frete e checkout.
- Favoritos: rota `/favoritos`, contador no cabeçalho, persistência no navegador, estado vazio e aviso de que a sincronização entre dispositivos depende da API E4. Visitantes recebem convite de login sem promessa de sincronização ativa.
- Persistência: snapshots mínimos de produto/variante em `localStorage`, validação defensiva na hidratação, descarte de entradas incompletas ou indisponíveis, reconstrução de identificadores e limite de quantidade. Dados de preço/estoque continuam explicitamente uma prévia e não substituem o servidor.
- Preparação comercial: painel de campanha sem conteúdo fictício ativo, formulário de cupom sem aplicar desconto e newsletter sem enviar dados; todos informam que as respectivas APIs ainda não existem.
- Responsividade: grid da sacola permanece em uma coluna abaixo de 1024 px; favoritos usa 1/2/3 colunas conforme o espaço disponível. A inspeção visual real permaneceu bloqueada porque o ambiente não expôs nenhum navegador (`apps: []`, `browsers: []`); não foi declarada como concluída.
- Verificações reais: `npm.cmd test` (**5/5**), `npm.cmd run openapi:check`, `npm.cmd run lint`, `npm.cmd run typecheck` e `npm.cmd run build` passaram. O build Next.js 16.4 gerou `/carrinho` e `/favoritos` como rotas estáticas; ambas responderam HTTP 200 no servidor de produção local. `git diff --check` não encontrou erros (somente aviso de normalização LF/CRLF já existente).
- Integração necessária: contrato E4 para carrinho de visitante/conta e junção no login, favoritos sincronizados, campanhas ativas, cupons e newsletter com confirmação em duas etapas. O backend deve continuar sendo a fonte de verdade de preço, estoque, elegibilidade, descontos e totais.
- Próximo passo exato: inspecionar `/carrinho`, drawer e `/favoritos` em 390, 768, 1024 e 1440 px assim que um navegador estiver disponível; depois substituir a persistência de prévia pelos endpoints E4 aprovados, preservando migração/fallback explícito do estado local.

## Entrega anterior — autenticação E3 integrada e validada (2026-10-14)
- Situação: fluxos reais de conta implementados na branch `codex/autenticacao-e3`, sobre o backend E3 já integrado à base. As correções finais desta auditoria ainda não foram commitadas, enviadas ou mescladas.
- Rotas e UX: `/entrar`, `/cadastro`, `/conta`, `/conta/recuperar-senha` e `/conta/redefinir-senha`; sessão global por `GET /api/v1/me`; proteção server-side da área do cliente; logout; troca de senha; recuperação sem enumeração de conta; redefinição com token de uso único; estados de carregamento, sucesso, erro, conflito, indisponibilidade e limite de tentativas.
- Segurança: cookie `HttpOnly` permanece opaco ao frontend; chamadas usam o rewrite same-origin e `credentials: include`; o Server Component encaminha cookies ao Fastify; destino pós-login aceita apenas caminhos internos; a página de redefinição usa `Referrer-Policy: no-referrer`, `noindex` e não registra o token no código do frontend.
- Consentimento: cadastro exige aceite de Termos/Privacidade e mantém marketing opcional desmarcado. As páginas legais deixam explícito que os textos jurídicos são rascunhos pendentes; não são apresentadas como políticas definitivas.
- Conta: exibe apenas dados, papéis e permissões retornados por `/me`; pedidos, endereços e verificação de e-mail continuam marcados como indisponíveis enquanto os módulos correspondentes não existem.
- Correções da auditoria: `logout()` passou a enviar `{}` como JSON, evitando `FST_ERR_CTP_EMPTY_JSON_BODY`; layout de conta recebeu contenção de largura em grids; o cabeçalho passou a ocultar corretamente o menu móvel no desktop e favoritos abaixo de 640 px, mantendo a marca em uma linha.
- Evidência ponta a ponta pelo Next (`localhost:3000/api/v1/*`): cadastro 201 → `/me` 200 → troca de senha 204 → logout 204 → `/me` 401 → senha antiga 401 → senha nova 200. Recuperação enviou e-mail ao Mailpit; token de 43 caracteres foi extraído para a conta exata; redefinição respondeu 204. Todas as contas fictícias foram removidas do PostgreSQL ao final (`DELETE 1`).
- Evidência visual: render desktop em 1440 px e emulação real de 390 px inspecionados. Em 390 px, `innerWidth`, `clientWidth` e `scrollWidth` ficaram em 390, sem overflow horizontal; menu móvel visível, favoritos oculto e logotipo sem quebra.
- Verificações finais: `npm.cmd run openapi:check`, `npm.cmd run lint`, `npm.cmd run typecheck` e `npm.cmd run build` passaram após as correções. O build Next.js 16.4 gerou todas as rotas esperadas sem erro.
- Dependências restantes do backend/operação: textos jurídicos definitivos, provedor transacional de produção, verificação de e-mail e módulos de pedidos/endereços. Nenhuma alteração foi feita em `backend/`.

## Entrega anterior — integração E1/E2 validada (2026-10-13)
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
