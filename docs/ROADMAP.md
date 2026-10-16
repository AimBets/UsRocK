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
- [~] Variações/tamanhos, carrinho e checkout: variações (E2), sacola/cupons/favoritos (E4) e checkout/pedidos/endereços (E5) implementados e testados no backend; telas E4/E5 do frontend pendentes.

## Fase 2 — Operação
- [~] Login, permissões e área do cliente: API de contas/sessão/permissões implementada e testada (E3); telas do frontend pendentes.
- [~] Admin de produtos, estoque, pedidos, clientes e campanhas: backend E6 dividido em 9 entregas (ver `docs/API_CONTRACTS.md`, "Painel administrativo (E6)"); E6.1 (fundação, equipe e permissões) implementada e testada; dashboard (E6.2) e catálogo (E6.3) são as próximas; UI do painel pendente.
- [~] Logs de auditoria: trilha persistente e imutável das operações administrativas implementada e testada (E6.1); retenção/exportação na E9.

## Fase 3 — Landing pages
- [ ] Templates editáveis e editor em blocos com preview.
- [ ] Gestão de imagens, rascunho/publicação, agendamento e versões.
- [ ] Produtos vinculados, SEO, conversões e teste end-to-end.

## Fase 4 — Integrações
- [~] Mercado Pago: Checkout Pro implementado (preferência, webhook assinado, consulta à API, idempotência) e testado contra servidor local; sandbox real pendente de credenciais; homologação depois.
- [~] SuperFrete: cotação, etiqueta pendente, consulta e webhook implementados conforme a documentação oficial e testados contra servidor local; sandbox real pendente de credenciais; pagamento de etiqueta e NF-e manuais.
- [ ] WhatsApp via integração autorizada e opt-in (E5 deixou só a interface e o canal desligado; nenhum envio).
- [~] Email transacional: fila com novas tentativas e modelos de pedido implementados e verificados no Mailpit (E5); provedor de produção a definir.

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
- E4 (sacola de visitante/conta com junção no login, favoritos, cupons, campanhas com admin mínimo, newsletter com dupla confirmação) concluída localmente no backend em 2026-10-15; integrada à `main` pelo PR #5.
- E5 (endereços, frete SuperFrete, checkout idempotente com reserva de estoque, pedidos, Mercado Pago Checkout Pro em sandbox, webhooks assinados, e-mails por fila, admin mínimo de pedidos) concluída localmente no backend em 2026-10-15, testada contra servidores locais; sandboxes reais pendentes de credenciais; integrada à `main` pelo PR #9.
- E6 dividida em E6.1 fundação/equipe/auditoria → E6.2 dashboard → E6.3 catálogo → E6.4 estoque → E6.5 pedidos avançados → E6.6 clientes → E6.7 marketing completo → E6.8 configurações e relatórios → E6.9 upload de mídia (depende de armazenamento). E6.1 concluída localmente em 2026-10-16 (migração `0005_admin`); sem commit até autorização.
