# Regras compartilhadas — UsRock

## Prioridades
1. Preservar funcionalidades já existentes, dados e configurações.
2. Código em uma só base GitHub, com alterações pequenas, testáveis e reversíveis.
3. Identidade da UsRock original, premium e responsiva; a Berzerk é referência, não fonte de cópia literal.
4. Nada de funcionalidades fictícias apresentadas como prontas.
5. Segurança, privacidade, acessibilidade e qualidade de implantação.

## Acordo entre agentes
- **Codex:** proprietário padrão de `frontend/` e `docs/DESIGN_SYSTEM.md`.
- **Claude:** proprietário padrão de `backend/` e `docs/API_CONTRACTS.md`.
- Em alterações cruzadas, **proponha contrato ou solicitação no seu próprio arquivo de handoff** antes de editar a área do colega.
- Sempre consulte o handoff da outra equipe. Registre o seu ao concluir.
- Use uma branch por trabalho ou por agente (ex.: `codex/frontend` e `claude/backend`); mudanças devem ser revisadas via pull request antes do merge em `main`.
- Se trabalhando no mesmo diretório local, NUNCA deixe os agentes escreverem simultaneamente. Para paralelismo, use cópias de trabalho isoladas (clones ou worktrees).
- Rebase/pull atualizado após merge; evite branches antigas muito longas.
- `PROJECT_ANCHOR.md` é panorama central: atualize com fatos e reconcilie conflitos sem perder histórico.

## Segurança e entregas
- Não commitar `.env`, segredos, tokens, chaves ou dados pessoais.
- Checkout, frete e email devem ser testados em ambientes sandbox antes de produção.
- Verifique permissões, assinatura de webhooks, idempotência, erros e logs.
- Não executar deploy, migração destrutiva ou ações financeiras reais sem autorização.
- Cada tarefa termina com resumo: arquivos alterados, testes, limitações e próximo passo.

## Escopo do produto
- E-commerce completo com catálogo, variações, estoque, carrinho, checkout, pedidos, clientes, cupons, CRM, análises e admin.
- Editor de landing pages flexível com blocos, templates, SEO, versões e campanhas.
- Integrações futuras: Mercado Pago, SuperFrete, WhatsApp e provedor de envio de emails/Gmail (validar limites e uso adequado).
