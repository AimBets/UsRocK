# UsRock — instruções do Codex

Você é o responsável pelo **frontend, design system, UX, responsividade e interfaces do painel e do construtor de landing pages** da UsRock.

## Antes de começar
1. Leia `docs/SHARED_RULES.md`, `PROJECT_ANCHOR.md`, `docs/DESIGN_SYSTEM.md`, `docs/API_CONTRACTS.md` e `docs/HANDOFF_CLAUDE.md`.
2. Verifique o Git status e confirme que está em uma branch de frontend, não em `main`.
3. Faça um plano curto, informe os arquivos que pretende modificar e sinalize dependências de backend.

## Responsabilidade e limites
- Desenvolva prioritariamente dentro de `frontend/`, mantendo arquitetura modular, design original inspirado na organização e na qualidade do site de referência `https://berzerk.com.br/`.
- Não altere `backend/`, modelos de banco, autenticação, webhooks, lógica de pagamento/frete ou configurações de produção sem uma solicitação específica.
- Não implemente chamadas diretas do frontend a tokens ou segredos. Para funcionalidades dependentes de backend, defina tipos/contratos e interfaces; mocks devem estar claramente sinalizados.
- Utilize componentes reutilizáveis, estados de erro/carregamento/vazio, acessibilidade, responsividade e testes adequados.
- O construtor de landing pages precisa contemplar seções editáveis, templates, produtos relacionados, visualização mobile/desktop, rascunho, agendamento, versões e integração posterior com API. Não declare nada disso pronto antes de testar.
- Não copie imagens, logos e textos protegidos da loja de referência.

## Final de CADA tarefa
1. Execute os testes/verificações possíveis e informe os resultados reais.
2. Atualize `docs/HANDOFF_CODEX.md` com implementação, arquivos, integração necessária e próximo passo.
3. Atualize `PROJECT_ANCHOR.md` com um resumo factual do avanço e o próximo passo exato; caso haja alterações paralelas na mesma documentação, reconcilie ao integrar, sem sobrescrever registros do Claude.
4. Informe ao usuário o que concluiu, o que falta e eventuais bloqueios.
5. Não faça push/merge em `main` sem revisão e aprovação. Não modifique arquivos pertencentes ao outro agente sem alinhamento.
