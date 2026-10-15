import Image from "next/image";
import { ArrowRight, Headphones, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import { AnnouncementBar } from "@/components/storefront/announcement-bar";
import { Footer } from "@/components/storefront/footer";
import { Header } from "@/components/storefront/header";
import { Hero } from "@/components/storefront/hero";
import { ProductCard } from "@/components/storefront/product-card";
import { CatalogState } from "@/components/storefront/catalog-state";
import { CampaignPanel } from "@/components/commerce/campaign-panel";
import { getCollections, getProducts } from "@/lib/api/catalog";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [productsResult, collectionsResult] = await Promise.allSettled([getProducts({ limit: 6 }), getCollections(4)]);
  const products = productsResult.status === "fulfilled" ? productsResult.value.data : [];
  const collections = collectionsResult.status === "fulfilled" ? collectionsResult.value.data : [];
  const catalogUnavailable = productsResult.status === "rejected";
  return (
    <div id="top">
      <AnnouncementBar />
      <Header />
      <main id="conteudo">
        <Hero />

        <section className="bg-obsidian py-16 text-white md:py-24" id="novidades" aria-labelledby="new-title">
          <div className="shell">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Drop 001 · peças-conceito</p>
                <h2 className="section-title" id="new-title">Novidades<br />em alto volume.</h2>
              </div>
              <div className="max-w-sm border-l border-copper/50 pl-5 text-sm leading-6 text-stone-400">
                <p>Seleção carregada diretamente do catálogo UsRock. Itens marcados como demonstrativos usam o seed de desenvolvimento.</p>
                <a className="text-link mt-5" href="/catalogo">Ver catálogo completo <ArrowRight size={15} /></a>
              </div>
            </div>
            <div className="mt-10 grid gap-x-5 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
              {products.slice(0, 3).map((product) => <ProductCard key={product.id} product={product} />)}
            </div>
            {catalogUnavailable && <CatalogState kind="error" message="O catálogo está temporariamente indisponível. A identidade da loja permanece acessível enquanto restabelecemos a conexão." />}
            {!catalogUnavailable && products.length === 0 && <CatalogState kind="empty" message="Nenhum produto publicado no momento." />}
          </div>
        </section>

        <section className="border-y border-stone-300 bg-bone py-16 text-ink md:py-24" id="colecoes" aria-labelledby="genres-title">
          <div className="shell">
            <p className="eyebrow text-rust">Explore por identidade</p>
            <div className="mt-3 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
              <h2 className="section-title text-ink" id="genres-title">Sua cena.<br />Seu uniforme.</h2>
              <p className="max-w-md text-sm leading-6 text-stone-600">Coleções publicadas e organizadas pelo catálogo da UsRock.</p>
            </div>
            <div className="mt-10 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {collections.map((collection, index) => (
                <a className="genre-card" href={`/catalogo?collection=${collection.slug}`} key={collection.id}>
                  {collection.heroMedia && <Image alt={collection.heroMedia.alt} className="absolute inset-0 -z-10 object-cover" fill sizes="(max-width: 768px) 100vw, 25vw" src={collection.heroMedia.url} unoptimized={collection.heroMedia.url.startsWith("http")} />}
                  <span className="text-[0.62rem] tracking-[0.2em] text-stone-400">COLEÇÃO / {String(index + 1).padStart(2, "0")}</span>
                  <div className="relative z-10 mt-auto">
                    <span className="block font-display text-4xl uppercase leading-none">{collection.title}</span>
                    <span className="mt-3 block text-xs text-stone-300">{collection.description ?? "Conheça os produtos desta coleção."}</span>
                  </div>
                  <span className="genre-index">0{index + 1}</span>
                  <ArrowRight className="absolute right-5 top-5" size={18} />
                </a>
              ))}
            </div>
            {collectionsResult.status === "fulfilled" && collections.length === 0 && <CatalogState kind="empty" message="Nenhuma coleção publicada no momento." />}
          </div>
        </section>

        <section className="bg-stage py-16 text-white md:py-24" id="camisetas" aria-labelledby="shirts-title">
          <div className="shell">
            <div className="section-heading">
              <div><p className="eyebrow">Essenciais da casa</p><h2 className="section-title" id="shirts-title">Camisetas<br />autorais.</h2></div>
              <p className="max-w-sm text-sm leading-6 text-stone-400">Produtos, variantes, preços e disponibilidade fornecidos pela API. Itens de seed permanecem identificados.</p>
            </div>
            <div className="mt-10 grid gap-x-5 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
              {products.slice(3).map((product) => <ProductCard key={product.id} product={product} />)}
            </div>
            {!catalogUnavailable && products.length > 0 && products.length <= 3 && <CatalogState kind="empty" message="Não há outros produtos publicados nesta seleção." />}
          </div>
        </section>

        <CampaignPanel />

        <section className="festival-section" id="festivais" aria-labelledby="festival-title">
          <div className="festival-grid" aria-hidden="true" />
          <div className="shell relative z-10 py-24 md:py-36">
            <div className="max-w-4xl">
              <p className="eyebrow text-black">Edições especiais · conceito futuro</p>
              <h2 className="mt-5 font-display text-[clamp(4rem,12vw,10rem)] uppercase leading-[0.76] tracking-[-0.055em] text-black" id="festival-title">DO PALCO<br />PRA RUA.</h2>
              <p className="mt-8 max-w-lg text-base leading-7 text-black/70">Landing pages exclusivas para shows, festivais e drops limitados serão criadas pelo futuro construtor visual da UsRock.</p>
              <a className="button-dark mt-9" href="#manifesto">Descobrir o conceito <ArrowRight size={17} /></a>
            </div>
          </div>
          <div className="festival-ticket" aria-hidden="true"><span>USROCK / LIVE SERIES</span><strong>001</strong></div>
        </section>

        <section className="bg-bone py-20 text-ink md:py-28" id="manifesto" aria-labelledby="manifesto-title">
          <div className="shell grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div className="relative aspect-[4/5] overflow-hidden bg-ink">
              <Image alt="Detalhe de camiseta preta autoral da coleção demonstrativa" className="object-cover object-center opacity-80" fill sizes="(max-width: 1024px) 100vw, 44vw" src="/images/product-raven.png" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
              <span className="absolute bottom-6 left-6 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-white">Originalidade acima do ruído</span>
            </div>
            <div className="lg:pl-12">
              <p className="eyebrow text-rust">Manifesto UsRock</p>
              <h2 className="section-title text-ink" id="manifesto-title">Não seguimos<br />a cena. Vivemos nela.</h2>
              <p className="mt-7 max-w-xl text-base leading-8 text-stone-600">A UsRock nasce para traduzir a energia da música em peças com acabamento, presença e identidade. Sem fantasia de rebeldia pronta: design autoral, repertório visual e respeito por cada comunidade.</p>
              <p className="mt-5 max-w-xl text-base leading-8 text-stone-600">O catálogo agora vem da operação local integrada. Produtos sinalizados como demonstrativos ainda não representam condições comerciais finais.</p>
              <a className="text-link mt-8 text-ink" href="#top">Voltar ao início <ArrowRight size={15} /></a>
            </div>
          </div>
        </section>

        <section className="border-y border-white/10 bg-obsidian text-white" aria-label="Benefícios comerciais demonstrativos">
          <div className="shell grid sm:grid-cols-2 lg:grid-cols-4">
            {[
              [ShieldCheck, "Checkout seguro", "Fluxo futuro a integrar pelo backend"],
              [RefreshCw, "Política de trocas", "Condições ainda pendentes de validação"],
              [Sparkles, "Design autoral", "Ativos originais criados para a UsRock"],
              [Headphones, "Atendimento humano", "Canais serão definidos pela operação"],
            ].map(([Icon, title, text], index) => (
              <div className={`benefit ${index > 0 ? "lg:border-l" : ""}`} key={String(title)}>
                <Icon className="text-copper" size={23} strokeWidth={1.5} />
                <div><h3 className="text-sm font-semibold uppercase tracking-[0.12em]">{String(title)}</h3><p className="mt-2 text-xs leading-5 text-stone-500">{String(text)}</p></div>
              </div>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
