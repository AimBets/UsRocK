# Especificação do produto — UsRock

**Estado:** visão e requisitos iniciais; funcionalidades futuras não significam implementação concluída.

## Visão

A UsRock é uma loja digital premium de roupas autorais inspiradas por rock, metal, bandas, festivais e cultura alternativa. A experiência combina descoberta de produto, conteúdo editorial e campanhas de coleção. O construtor de landing pages será um diferencial operacional para campanhas, shows, festivais e lançamentos.

A identidade deve ser própria, atual e acessível. Berzerk é uma referência de organização comercial e qualidade percebida; seus ativos, textos, marcas, fotografias e trade dress não devem ser reproduzidos.

## Públicos e necessidades

- Fãs de música e cultura alternativa que procuram peças com identidade e qualidade.
- Clientes que precisam encontrar produtos por estilo, coleção, tamanho e disponibilidade.
- Operadores da loja que precisam administrar catálogo, estoque, campanhas, pedidos e relacionamento.
- Equipe de conteúdo que precisa publicar páginas de campanha sem depender de alterações de código.

## Loja pública

- Home editorial com anúncios, hero, novidades, coleções, campanhas e conteúdo institucional.
- Catálogo, busca, filtros, ordenação, paginação e páginas de coleção.
- Página de produto com imagens, descrição, preço, tamanhos, variantes, disponibilidade e recomendações.
- Favoritos, carrinho, cálculo de frete, cupons, checkout, confirmação e acompanhamento de pedidos.
- Área de cliente com dados, endereços, pedidos e preferências, conforme contratos de autenticação.
- Conteúdo sobre marca, tamanhos, envio, trocas, privacidade e atendimento.
- Estados de carregamento, vazio, erro, indisponibilidade e confirmação.

## Painel administrativo

- Visão geral de vendas, pedidos, estoque e campanhas; números sempre derivados de dados reais da API.
- CRUD de produtos, variantes, atributos, categorias, coleções, mídia e estoque.
- Operação de pedidos, clientes, cupons, campanhas, conteúdo e landing pages.
- Filtros, busca, ordenação, paginação, formulários validados e permissões por perfil.
- Feedback de sucesso/erro, estados vazios, confirmação de ações e histórico de auditoria fornecido pelo backend.
- Relatórios e CRM em etapas posteriores, sem métricas fictícias.

## Construtor visual de landing pages

- Criar a partir de templates ou página vazia; editar título, slug e metadados de SEO.
- Adicionar, remover, duplicar, editar e reordenar seções por interação visual.
- Blocos planejados: hero, texto, imagem, vídeo, coleção de produtos, produto em destaque, banner, FAQ, prova institucional e chamada de ação.
- Editor de propriedades com controles de texto, imagem/vídeo, cores, tipografia, espaçamento, alinhamento, fundo, bordas e estilos responsivos.
- Prévia desktop, tablet e mobile; o preview deve refletir o schema persistido da página.
- Biblioteca de mídia controlada pela API, com validação de formato, dimensão e tamanho.
- Relacionar produtos, coleções e campanhas sem duplicar o cadastro do catálogo.
- Estados e fluxo: rascunho, agendada, publicada e arquivada; publicar ou agendar exige permissão.
- Histórico imutável de versões, comparação e restauração.
- Animações opcionais, discretas, com suporte a `prefers-reduced-motion`.
- O schema será versionado e validado no servidor. O frontend não executará HTML ou scripts arbitrários fornecidos pelo usuário.
- Métricas de conversão serão consumidas de fonte definida pelo backend, sem rastreamento não autorizado.

## Módulos futuros

- Identidade do cliente, sessão, autorização administrativa e recuperação de conta.
- Catálogo, inventário, preços, promoções e mídia.
- Carrinho, CEP/frete, checkout, pagamentos e pedidos.
- Atendimento, notificações, opt-in, CRM, relatórios e auditoria.
- Mercado Pago, SuperFrete, WhatsApp e e-mail transacional, sempre mediados pelo backend.
- Landing pages, campanhas, agendamento, SEO e analytics consentido.

## Requisitos de qualidade

- Mobile-first; suportar celular, tablet e desktop sem perda de conteúdo ou ação.
- HTML semântico, navegação por teclado, foco visível, nomes acessíveis, texto alternativo e contraste adequado.
- SEO técnico: metadados, URLs estáveis, conteúdo rastreável, sitemap e dados estruturados quando os dados reais estiverem definidos.
- Desempenho: otimização de imagens e fontes, carregamento sob demanda e prevenção de layout shift.
- Privacidade: minimização de dados; nenhum segredo, token de provedor ou dado real de cliente no bundle ou em mocks.
- Testes para componentes, fluxos críticos, responsividade, erros e integração com contratos reais.
- Conteúdo de demonstração sempre identificável e substituível; não afirmar estoque, avaliações, vendas ou políticas reais.

## Situação da primeira fase

A homepage inicial usa imagens originais geradas para o projeto e catálogo demonstrativo tipado. Busca, favoritos, contagem de sacola e formulário de newsletter operam apenas no estado local do navegador; não há persistência nem integração de venda. Ver `docs/HANDOFF_CODEX.md` para validação e pendências.
