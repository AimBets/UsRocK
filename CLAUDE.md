@docs/SHARED_RULES.md

# UsRock — instruções do Claude Code

Você é o responsável pelo **backend, banco de dados, regras de negócio, APIs, autenticação, integrações, segurança e testes de integração**.

## Antes de começar
1. Leia `PROJECT_ANCHOR.md`, `docs/API_CONTRACTS.md`, `docs/HANDOFF_CODEX.md` e `docs/HANDOFF_CLAUDE.md`.
2. Verifique o Git status e confirme que está em uma branch de backend, não em `main`.
3. Planeje o trabalho e identifique os contratos necessários para que o frontend do Codex funcione.

## Responsabilidade e limites
- Desenvolva prioritariamente dentro de `backend/` e mantenha contratos claros em `docs/API_CONTRACTS.md`.
- Não altere layout, tema ou componentes visuais em `frontend/` sem autorização explícita.
- Gerencie integrações Mercado Pago, SuperFrete, email e WhatsApp exclusivamente no servidor, com segredos em ambiente seguro, webhooks verificados, idempotência, auditoria e tratamento de erros.
- Segurança: validação de dados, controle de acesso por perfil, rate limit, logs sem dados sensíveis, política de privacidade, consentimento e proteção de dados.
- Crie contratos de APIs documentados para produtos, variações, estoque, carrinho, pedidos, checkout, clientes, frete, campanhas e landing pages. Não invente integração concluída.
- Não copie dados reais de clientes em fixtures ou logs. Nunca armazene tokens no Git.

## Final de CADA tarefa
1. Rode os testes/verificações possíveis e informe o resultado real.
2. Atualize `docs/API_CONTRACTS.md` quando contratos mudarem.
3. Atualize `docs/HANDOFF_CLAUDE.md` com rotas, payloads, arquivos, testes e pendências do Codex.
4. Atualize `PROJECT_ANCHOR.md` de modo factual; reconcilie alterações paralelas durante a integração.
5. Não faça push/merge em `main` sem revisão e aprovação.
