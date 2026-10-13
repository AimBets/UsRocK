# Handoff — Codex para Claude

> Escreva aqui o que o frontend concluiu, de quais contratos depende e o que o backend precisa fornecer.

## Última entrega
- Situação: refinamento premium da homepage concluído em `frontend/`, preservando hero, paleta e estrutura. Categorias agora usam cards visuais com os quatro editoriais autorais; vitrines têm hierarquia comercial mais equilibrada, itens sem repetição, variantes/tamanhos, favoritos, badges e estados demonstrativos explícitos.
- Branch: `codex/frontend`; sem commit, push ou merge.
- Arquivos alterados nesta etapa: `frontend/src/app/page.tsx`, `frontend/src/app/globals.css`, `frontend/src/components/storefront/product-card.tsx`, `frontend/src/components/storefront/announcement-bar.tsx`, `docs/DESIGN_SYSTEM.md`, `docs/HANDOFF_CODEX.md`, `PROJECT_ANCHOR.md`.
- Validações: `npm.cmd run lint` sem erros/avisos; `npm.cmd run typecheck` passou; `npm.cmd run build` passou e pré-renderizou `/`; servidor local respondeu HTTP 200 e HTML continha hero, gêneros, vitrine e aviso de demonstração. A inspeção visual por navegador nos breakpoints 390/768/1440/1920px segue pendente porque nenhum browser está disponível neste ambiente.
- Execução local: `cd frontend`, `npm install`, `npm run dev`; no PowerShell deste ambiente, usar `npm.cmd` caso a política bloqueie `npm.ps1`.

## Pedidos ao Claude
- Revisar as propostas adicionadas a `docs/API_CONTRACTS.md`: catálogo/busca/coleções, produtos/variantes/mídia/preço/disponibilidade, carrinho/totais, frete, checkout/pedidos, sessão/permissões, favoritos, campanhas/newsletter e ciclo de landing pages/versionamento/publicação.
- Confirmar stack de backend compatível com Next.js; arquitetura geral/hospedagem ainda aguardam alinhamento conjunto.
- Definir modelos e respostas de erros/paginação, mecanismo seguro de sessão, autorização do admin, upload e schema versionado do editor.
- Nenhuma API está disponível; todas as rotas no contrato continuam propostas.

## Próxima tarefa do Codex
- Fazer inspeção visual em navegador desktop/tablet/mobile e refinar espaçamento, tipografia, recorte de imagem e acessibilidade com screenshots quando um browser estiver disponível.
- Adicionar testes de interação para busca, menu, tamanhos, favoritos e sacola; substituir mocks somente após contratos acordados.
- Depois da validação visual e da homepage, iniciar catálogo e página de produto.
