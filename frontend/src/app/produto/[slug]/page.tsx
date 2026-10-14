import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { AnnouncementBar } from "@/components/storefront/announcement-bar";
import { Footer } from "@/components/storefront/footer";
import { Header } from "@/components/storefront/header";
import { ProductCard } from "@/components/storefront/product-card";
import { ProductOptions } from "@/components/storefront/product-options";
import { ApiError } from "@/lib/api/client";
import { getProduct, getProducts } from "@/lib/api/catalog";
import type { ProductDetail } from "@/types/catalog";

export const dynamic = "force-dynamic";

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let product: ProductDetail;
  try {
    product = await getProduct(slug);
  } catch (error) {
    if (error instanceof ApiError && error.code === "NOT_FOUND") notFound();
    throw error;
  }

  const related = product.category
    ? await getProducts({ category: product.category.slug, limit: 4 }).then((page) => page.data.filter((item) => item.id !== product.id).slice(0, 3)).catch(() => [])
    : [];

  return (
    <div>
      <AnnouncementBar />
      <Header />
      <main id="conteudo" className="bg-stage text-white">
        <div className="shell py-10 md:py-16">
          <Link className="text-link text-stone-400" href="/catalogo"><ArrowLeft size={15} /> Voltar ao catálogo</Link>
          <div className="mt-8 grid gap-10 lg:grid-cols-[1.25fr_.75fr] lg:gap-16">
            <section aria-label={`Galeria de ${product.name}`} className="product-gallery">
              {product.media.length ? product.media.map((media, index) => (
                <div className="relative aspect-square overflow-hidden bg-ink" key={`${media.url}-${index}`}>
                  <Image alt={media.alt} className="object-cover" fill priority={index === 0} sizes="(max-width: 1024px) 100vw, 58vw" src={media.url} unoptimized={media.url.startsWith("http")} />
                </div>
              )) : <div className="product-image-empty aspect-square">Imagem indisponível</div>}
            </section>
            <section className="lg:sticky lg:top-28 lg:self-start">
              <p className="eyebrow">{product.collections[0]?.title ?? product.category?.name ?? "UsRock"}</p>
              <h1 className="mt-4 font-display text-5xl uppercase leading-[.9] tracking-[-.04em] md:text-7xl">{product.name}</h1>
              {product.label && <span className="mt-5 inline-block border border-copper/50 px-3 py-2 text-[.62rem] font-bold uppercase tracking-[.14em] text-copper">{product.label}</span>}
              <p className="mt-7 whitespace-pre-line text-sm leading-7 text-stone-300">{product.description}</p>
              <ProductOptions product={product} />
              <dl className="mt-8 grid grid-cols-2 gap-4 border-t border-white/10 pt-6 text-xs">
                <div><dt className="text-stone-500">Categoria</dt><dd className="mt-1">{product.category?.name ?? "Não informada"}</dd></div>
                <div><dt className="text-stone-500">Disponibilidade</dt><dd className="mt-1">{product.availability === "low_stock" ? "Baixa" : product.availability === "in_stock" ? "Disponível" : "Indisponível"}</dd></div>
              </dl>
            </section>
          </div>
        </div>
        {related.length > 0 && <section className="border-t border-white/10 bg-obsidian py-16"><div className="shell"><p className="eyebrow">Mais da categoria</p><h2 className="mt-3 font-display text-4xl uppercase">Você também pode gostar</h2><div className="mt-9 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{related.map((item) => <ProductCard key={item.id} product={item} />)}</div></div></section>}
      </main>
      <Footer />
    </div>
  );
}
