# Roadmap — UsRock

Estados: [ ] pendente, [~] em andamento, [x] concluído e validado.

## Fase 0 — Base e colaboração
- [ ] Repositório clonado, regras versionadas, ferramentas autenticadas.
- [~] Base frontend Next.js/React/TypeScript/Tailwind 4 executável localmente; compatibilidade da stack total e hospedagem aguardam alinhamento com Claude.
- [~] Contratos iniciais: convenções transversais (erros, paginação, Money, request ID, sessão/permissões) implementadas no backend; contratos de negócio ainda propostos. Pipeline de CI do backend criado e validado localmente, ainda não executado no GitHub.
- [~] Fundação do backend (E1) implementada e testada localmente; aguardando revisão/commit.

## Fase 1 — Loja e design
- [~] Homepage responsiva implementada e validada por lint, TypeScript, build e resposta HTTP local; inspeção visual em navegador e aprovação final pendentes.
- [~] Busca, catálogo, filtros, coleções e páginas de produto: API do backend implementada e testada (E2, catálogo demonstrativo); páginas do frontend pendentes.
- [ ] Variações/tamanhos, carrinho e checkout (fluxo de testes).

## Fase 2 — Operação
- [~] Login, permissões e área do cliente: API de contas/sessão/permissões implementada e testada (E3); telas do frontend pendentes.
- [ ] Admin de produtos, estoque, pedidos, clientes e campanhas.
- [ ] Logs de auditoria, tratamento de erros e testes de integração.

## Fase 3 — Landing pages
- [ ] Templates editáveis e editor em blocos com preview.
- [ ] Gestão de imagens, rascunho/publicação, agendamento e versões.
- [ ] Produtos vinculados, SEO, conversões e teste end-to-end.

## Fase 4 — Integrações
- [ ] Mercado Pago (sandbox, depois homologação).
- [ ] SuperFrete (cotação, geração de etiqueta e rastreio conforme APIs reais).
- [ ] WhatsApp via integração autorizada e opt-in.
- [ ] Email transacional via provedor adequado; Gmail quando pertinente e permitido.

## Fase 5 — Produção
- [ ] Acessibilidade, segurança, desempenho, privacidade e testes.
- [ ] Backup, observabilidade, recuperação e deploy.

## Registro da Fase 1 — fundação do frontend
- Inclui catálogo demonstrativo tipado, hero e imagens originais, vitrine, gêneros, campanha conceito, manifesto, footer, navegação responsiva e busca/formulário/carrinho/favoritos em estado local.
- Integrações de loja, autenticação, dados comerciais e publicação ainda não existem; ver `docs/HANDOFF_CODEX.md` e `docs/API_CONTRACTS.md`.

## Registro do backend — E1 (Claude, 2026-10-13)
- Fases do backend: E1 fundação → E2 catálogo/estoque (leitura) → E3 contas/sessão/permissões → E4 carrinho, cupons, campanhas, favoritos, newsletter → E5 frete SuperFrete, checkout, pedidos, Mercado Pago Checkout Pro (sandbox), e-mails → E6 APIs do admin e auditoria → E7 landing pages versionadas → E8 WhatsApp/CRM → E9 produção (LGPD, backup, observabilidade, deploy).
- E1 concluída localmente; detalhes e testes em `docs/HANDOFF_CLAUDE.md`.
- E2 (catálogo público somente leitura + seed demonstrativo) concluída localmente em 2026-10-13; sem commit até autorização.
- E3 (contas, sessão por cookie, permissões, recuperação de senha por e-mail, consentimentos, comando de admin) concluída localmente em 2026-10-13; sem commit até autorização.
