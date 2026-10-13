"use client";

import Image from "next/image";
import { useState } from "react";
import { Heart, Plus } from "lucide-react";
import type { Product } from "@/types/catalog";
import { useStorefront } from "./storefront-provider";

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function ProductCard({ product }: { product: Product }) {
  const [selectedSize, setSelectedSize] = useState(product.variants[0]?.size ?? "—");
  const [message, setMessage] = useState("");
  const { addToCart, favoriteIds, toggleFavorite } = useStorefront();
  const isFavorite = favoriteIds.has(product.id);

  function addProduct() {
    addToCart();
    setMessage(`Tamanho ${selectedSize} selecionado na sacola demonstrativa.`);
  }

  return (
    <article className="product-card group">
      <div className="product-image-wrap">
        <Image
          alt={product.imageAlt}
          className="object-cover transition duration-700 group-hover:scale-[1.035]"
          fill
          sizes="(max-width: 640px) 86vw, (max-width: 1024px) 45vw, 30vw"
          src={product.image}
        />
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
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-copper">{product.collection}</p>
        <h3 className="mt-2 text-lg font-medium text-stone-100">{product.name}</h3>
        <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-base font-semibold text-white">{currency.format(product.price.amount)}</span>
          {product.compareAtPrice && <span className="text-xs text-stone-600 line-through">{currency.format(product.compareAtPrice.amount)}</span>}
          {product.compareAtPrice && <span className="rounded-full bg-copper/15 px-2 py-1 text-[0.58rem] font-bold uppercase tracking-[0.12em] text-copper">exemplo de oferta</span>}
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-2" aria-label={`Selecione o tamanho para ${product.name}`}>
          {product.variants.map((variant) => (
            <button
              aria-pressed={selectedSize === variant.size}
              className={`size-button ${selectedSize === variant.size ? "is-active" : ""}`}
              key={variant.id}
              onClick={() => { setSelectedSize(variant.size); setMessage(""); }}
              type="button"
            >
              {variant.size}
            </button>
          ))}
        </div>
        <button className="add-button" onClick={addProduct} type="button">
          Adicionar à sacola <Plus size={16} />
        </button>
        <p className="mt-2 min-h-4 text-[0.65rem] text-stone-500" aria-live="polite">{message || "Preço e disponibilidade demonstrativos nesta fase."}</p>
      </div>
    </article>
  );
}
