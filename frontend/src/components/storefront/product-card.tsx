"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Heart, Plus } from "lucide-react";
import type { Product } from "@/types/catalog";
import { formatMoney, formatPriceRange } from "@/lib/format";
import { useStorefront } from "./storefront-provider";

export function ProductCard({ product }: { product: Product }) {
  const firstAvailable = product.variants.find((variant) => variant.availability !== "out_of_stock") ?? product.variants[0];
  const [selectedVariantId, setSelectedVariantId] = useState(firstAvailable?.id ?? "");
  const [message, setMessage] = useState("");
  const { addToCart, favoriteIds, toggleFavorite } = useStorefront();
  const isFavorite = favoriteIds.has(product.id);
  const selectedVariant = product.variants.find((variant) => variant.id === selectedVariantId);
  const image = product.primaryMedia;
  const collection = product.collections[0]?.title ?? product.category?.name ?? "Catálogo UsRock";

  function addProduct() {
    if (!selectedVariant || selectedVariant.availability === "out_of_stock") return;
    addToCart(product.id, selectedVariant.id);
    setMessage(`Tamanho ${selectedVariant.size} selecionado na sacola demonstrativa.`);
  }

  return (
    <article className="product-card group">
      <div className="product-image-wrap">
        <Link aria-label={`Ver ${product.name}`} href={`/produto/${product.slug}`}>
          {image ? (
            <Image alt={image.alt} className="object-cover transition duration-700 group-hover:scale-[1.035]" fill sizes="(max-width: 640px) 86vw, (max-width: 1024px) 45vw, 30vw" src={image.url} unoptimized={image.url.startsWith("http")} />
          ) : <span className="product-image-empty">Imagem indisponível</span>}
        </Link>
        {product.label && <span className="product-badge">{product.label}</span>}
        <button
          aria-label={isFavorite ? `Remover ${product.name} dos favoritos` : `Favoritar ${product.name}`}
          aria-pressed={isFavorite}
          className={`favorite-button ${isFavorite ? "is-active" : ""}`}
          onClick={() => toggleFavorite(product.id)}
          type="button"
        >
          <Heart fill={isFavorite ? "currentColor" : "none"} size={18} />
        </button>
      </div>
      <div className="pt-5">
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-copper">{collection}</p>
        <h3 className="mt-2 text-lg font-medium text-stone-100"><Link href={`/produto/${product.slug}`}>{product.name}</Link></h3>
        <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-base font-semibold text-white">{formatPriceRange(product.priceRange.min, product.priceRange.max)}</span>
          {selectedVariant?.compareAtPrice && <span className="text-xs text-stone-500 line-through">{formatMoney(selectedVariant.compareAtPrice)}</span>}
          {product.isDemo && <span className="rounded-full bg-copper/15 px-2 py-1 text-[0.58rem] font-bold uppercase tracking-[0.12em] text-copper">dados demonstrativos</span>}
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-2" aria-label={`Selecione o tamanho para ${product.name}`}>
          {product.variants.map((variant) => (
            <button
              aria-pressed={selectedVariantId === variant.id}
              className={`size-button ${selectedVariantId === variant.id ? "is-active" : ""}`}
              disabled={variant.availability === "out_of_stock"}
              key={variant.id}
              onClick={() => { setSelectedVariantId(variant.id); setMessage(""); }}
              title={variant.availability === "out_of_stock" ? "Tamanho indisponível" : undefined}
              type="button"
            >
              {variant.size}
            </button>
          ))}
        </div>
        <button className="add-button" disabled={!selectedVariant || selectedVariant.availability === "out_of_stock"} onClick={addProduct} type="button">
          Adicionar à sacola <Plus size={16} />
        </button>
        <p className="mt-2 min-h-4 text-[0.65rem] text-stone-500" aria-live="polite">{message || (product.isDemo ? "Preço e estoque ilustrativos do seed de desenvolvimento." : "Preço e disponibilidade informados pelo catálogo.")}</p>
      </div>
    </article>
  );
}
