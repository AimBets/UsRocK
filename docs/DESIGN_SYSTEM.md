# Design System — UsRock

**Responsável:** Codex. **Estado:** tokens e padrões refinados aplicados à homepage; validação visual por navegador segue pendente porque não há browser disponível neste ambiente.

## Direção
- Marca: UsRock; atitude rock/metal, navegação limpa, apresentação editorial e acabamento premium.
- Referência de organização comercial: https://berzerk.com.br/. A inspeção visual da página não pôde ser feita neste ambiente; o conteúdo público indexado confirmou padrões de vitrine, filtros, preços, ofertas e sinais de confiança. Não inferir detalhes visuais além disso.
- Não copiar logotipo, fotos, textos, trade dress ou materiais protegidos da referência.
- Identidade inicial: preto e grafite como base, osso para contraste editorial e cobre como acento; composição editorial com espaço negativo e fotografia autoral.

## Tokens iniciais

| Token | Valor | Uso |
|---|---|---|
| `obsidian` | `#090909` | Fundo principal e navegação |
| `ink` | `#121212` | Superfícies escuras e texto escuro |
| `stage` | `#171615` | Seções de vitrine |
| `bone` | `#EFEDE7` | Fundo editorial claro |
| `copper` | `#C77742` | Ação, foco e acento |
| `rust` | `#9E4F2E` | Acento sobre superfície clara |
| `stone` | escala Tailwind | Texto secundário e divisores |

Tipografia usa stacks locais: Arial/Helvetica para interface e `Arial Narrow`, `Roboto Condensed`, Impact como fallback de títulos. Validar licença e identidade tipográfica antes de fixar fonte de marca.

Escalas: container até 88rem; margens laterais de 1.25rem em telas pequenas e 2.5rem a partir de 768px; grid de produtos de 1, 2 e 3 colunas; títulos editoriais fluidos com `clamp`; controles com alvo mínimo próximo de 44px.

## Componentes previstos
- Loja: header, megamenu, busca, navegação mobile, cards de produto, variações, badges, galeria, carrinho, checkout, filtros.
- Admin: sidebar, tabelas, dashboards, formulários, filtros, estados vazios, validação, toasts, diálogos.
- Landing pages: editor em blocos, painel de propriedades, reordenação, prévia desktop/mobile, biblioteca de templates, versão/publicação.

## Padrões aplicados na homepage

- Header sticky, barra comercial, links de navegação, busca em overlay, menu mobile, painel de sacola e contadores locais.
- Hero com fotografia original e área de texto de alto contraste.
- Cards de produto com valor demonstrativo, badge, comparação de preço explicitamente marcada como exemplo, seletor de variantes, favorito e ação de sacola local.
- Vitrines sem repetição de itens entre lançamentos e coleção exclusiva, navegação por gêneros com imagem autoral/overlay, campanha de shows, manifesto, benefícios sinalizados como futuros e footer com formulário demonstrativo.
- Barra comercial comunica o estado de demonstração sem prometer frete, segurança, parcelamento, estoque ou disponibilidade reais.
- Estados interativos anunciam resultado com `aria-live`; overlays ficam inertes quando fechados; link para pular ao conteúdo e foco visível.
- Movimento discreto; CSS respeita `prefers-reduced-motion`.

## Critérios
- Responsividade desktop/tablet/mobile; acessibilidade; contraste e navegação por teclado.
- Estados loading, erro, vazio e sucesso.
- Componentes reaproveitáveis, não criar páginas incompatíveis entre si.
- Animações sutis e respeitando reduced-motion.

## Registro de decisões visuais
- Implementado em `frontend/src/app/globals.css`; imagens em `frontend/public/images/` são ativos originais gerados para esta homepage.
- Pendente: revisão por screenshot desktop/mobile (390, 768, 1440 e 1920px), aprovação final de paleta/tipografia e diretrizes para fotografia de produto real.
