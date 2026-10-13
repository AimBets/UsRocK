# Roadmap — UsRock

Estados: [ ] pendente, [~] em andamento, [x] concluído e validado.

## Fase 0 — Base e colaboração
- [ ] Repositório clonado, regras versionadas, ferramentas autenticadas.
- [~] Base frontend Next.js/React/TypeScript/Tailwind 4 executável localmente; compatibilidade da stack total e hospedagem aguardam alinhamento com Claude.
- [ ] Contratos iniciais aprovados e pipeline de testes básico.

## Fase 1 — Loja e design
- [~] Homepage responsiva implementada e validada por lint, TypeScript, build e resposta HTTP local; inspeção visual em navegador e aprovação final pendentes.
- [ ] Busca, catálogo, filtros, coleções e páginas de produto.
- [ ] Variações/tamanhos, carrinho e checkout (fluxo de testes).

## Fase 2 — Operação
- [ ] Login, permissões e área do cliente.
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
