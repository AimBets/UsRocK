import Link from "next/link";
import { ArrowLeft, ArrowRight, Search, SlidersHorizontal } from "lucide-react";
import { AnnouncementBar } from "@/components/storefront/announcement-bar";
import { CatalogState } from "@/components/storefront/catalog-state";
import { Footer } from "@/components/storefront/footer";
import { Header } from "@/components/storefront/header";
import { ProductCard } from "@/components/storefront/product-card";
import { ApiError } from "@/lib/api/client";
import { getCategories, getCollections, getProducts, type ProductFilters, type ProductSort } from "@/lib/api/catalog";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const one = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
const allowedSorts = new Set<ProductSort>(["newest", "price_asc", "price_desc", "name_asc"]);

function reaisToMinor(value?: string) {
  if (!value) return undefined;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) : undefined;
}

function displayError(error: unknown) {
  if (!(error instanceof ApiError)) return "Não foi possível carregar o catálogo.";
  if (error.code === "VALIDATION_ERROR") return "Um dos filtros informados não é válido.";
  if (error.code === "RATE_LIMITED") return "Muitas consultas em pouco tempo. Aguarde e tente novamente.";
  return error.message;
}

export default async function CatalogPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const sortValue = one(raw.sort) as ProductSort | undefined;
  const filters: ProductFilters = {
    q: one(raw.q)?.trim() || undefined,
    category: one(raw.category),
    collection: one(raw.collection),
    size: one(raw.size),
    priceMin: reaisToMinor(one(raw.min)),
    priceMax: reaisToMinor(one(raw.max)),
    inStock: one(raw.inStock) === "true" ? true : undefined,
    sort: sortValue && allowedSorts.has(sortValue) ? sortValue : "newest",
    cursor: one(raw.cursor),
    limit: 12,
  };

  const result = await Promise.allSettled([getProducts(filters), getCategories(), getCollections(100)]);
  const products = result[0].status === "fulfilled" ? result[0].value : null;
  const categories = result[1].status === "fulfilled" ? result[1].value.data : [];
  const collections = result[2].status === "fulfilled" ? result[2].value.data : [];
  const queryForNext = new URLSearchParams();
  Object.entries(raw).forEach(([key, value]) => {
    const normalized = one(value);
    if (normalized && key !== "cursor") queryForNext.set(key, normalized);
  });
  if (products?.pageInfo.nextCursor) queryForNext.set("cursor", products.pageInfo.nextCursor);

  return (
    <div>
      <AnnouncementBar />
      <Header />
      <main id="conteudo" className="min-h-[70vh] bg-stage text-white">
        <section className="border-b border-white/10 py-14 md:py-20">
          <div className="shell">
            <Link className="text-link text-stone-400" href="/"><ArrowLeft size={15} /> Início</Link>
            <p className="eyebrow mt-9">Catálogo conectado</p>
            <h1 className="section-title">Encontre<br />seu uniforme.</h1>
            <p className="mt-6 max-w-2xl text-sm leading-6 text-stone-400">Busca, filtros, preços e disponibilidade consultados na API da UsRock. Itens demonstrativos são identificados em cada card.</p>
          </div>
        </section>

        <div className="shell grid gap-10 py-12 lg:grid-cols-[18rem_1fr] lg:py-16">
          <aside>
            <div className="flex items-center gap-2 border-b border-white/10 pb-4"><SlidersHorizontal size={17} className="text-copper" /><h2 className="text-sm font-bold uppercase tracking-[.14em]">Filtros</h2></div>
            <form className="catalog-filters" method="get">
              <label><span>Buscar</span><div className="filter-search"><Search size={15} /><input defaultValue={filters.q} name="q" placeholder="Nome ou descrição" /></div></label>
              <label><span>Categoria</span><select defaultValue={filters.category ?? ""} name="category"><option value="">Todas</option>{categories.map((item) => <option key={item.id} value={item.slug}>{item.name}</option>)}</select></label>
              <label><span>Coleção</span><select defaultValue={filters.collection ?? ""} name="collection"><option value="">Todas</option>{collections.map((item) => <option key={item.id} value={item.slug}>{item.title}</option>)}</select></label>
              <label><span>Tamanho</span><select defaultValue={filters.size ?? ""} name="size"><option value="">Todos</option>{["P", "M", "G", "GG", "XG"].map((size) => <option key={size}>{size}</option>)}</select></label>
              <div className="grid grid-cols-2 gap-3"><label><span>Mínimo (R$)</span><input defaultValue={one(raw.min)} min="0" name="min" step="0.01" type="number" /></label><label><span>Máximo (R$)</span><input defaultValue={one(raw.max)} min="0" name="max" step="0.01" type="number" /></label></div>
              <label className="filter-check"><input defaultChecked={filters.inStock} name="inStock" type="checkbox" value="true" /><span>Somente disponíveis</span></label>
              <label><span>Ordenar</span><select defaultValue={filters.sort} name="sort"><option value="newest">Mais recentes</option><option value="price_asc">Menor preço</option><option value="price_desc">Maior preço</option><option value="name_asc">Nome A–Z</option></select></label>
              <button className="button-primary w-full" type="submit">Aplicar filtros</button>
              <Link className="block text-center text-xs text-stone-500 underline underline-offset-4" href="/catalogo">Limpar filtros</Link>
            </form>
          </aside>

          <section aria-labelledby="results-title">
            <div className="flex items-end justify-between gap-4 border-b border-white/10 pb-5">
              <div><p className="eyebrow">Resultado</p><h2 className="mt-2 font-display text-3xl uppercase" id="results-title">{filters.q ? `Busca: ${filters.q}` : "Todos os produtos"}</h2></div>
              {products && <span className="text-xs text-stone-500">{products.data.length} nesta página</span>}
            </div>
            {!products && <CatalogState kind="error" message={displayError(result[0].status === "rejected" ? result[0].reason : null)} />}
            {products && products.data.length === 0 && <CatalogState kind="empty" message="Nenhum produto corresponde aos filtros selecionados." />}
            {products && products.data.length > 0 && <div className="mt-8 grid gap-x-5 gap-y-12 sm:grid-cols-2 xl:grid-cols-3">{products.data.map((product) => <ProductCard key={product.id} product={product} />)}</div>}
            {products?.pageInfo.hasNextPage && <div className="mt-12 flex justify-center"><Link className="button-ghost" href={`/catalogo?${queryForNext.toString()}`}>Próxima página <ArrowRight size={16} /></Link></div>}
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
