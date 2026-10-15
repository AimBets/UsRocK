"use client";

import Image from "next/image";
import Link from "next/link";
import { Heart, LogIn, ShoppingBag, Trash2 } from "lucide-react";
import { formatPriceRange } from "@/lib/format";
import { useAuth } from "@/components/auth/auth-provider";
import { useStorefront } from "@/components/storefront/storefront-provider";

export function FavoritesPage() {
  const { status } = useAuth();
  const { addToCart, favorites, hydrated, toggleFavorite } = useStorefront();
  if (!hydrated) return <div className="commerce-page-state" role="status"><span className="skeleton" />Carregando favoritos…</div>;
  return (
    <>
      {status !== "authenticated" && <div className="session-callout"><LogIn size={20} /><div><strong>Favoritos salvos neste navegador</strong><p>Entre na sua conta para preparar a futura sincronização entre dispositivos quando a API E4 estiver disponível.</p></div><Link href="/entrar?next=%2Ffavoritos">Entrar</Link></div>}
      {!favorites.length ? <div className="commerce-page-state"><Heart size={52} strokeWidth={1.2} /><h2>Sua lista pede volume</h2><p>Use o coração nos produtos para guardar seus favoritos.</p><Link className="button-primary" href="/catalogo">Descobrir produtos</Link></div> : (
        <div className="favorites-grid">
          {favorites.map(({ product }) => {
            const available = product.variants.find((variant) => variant.availability !== "out_of_stock");
            const prices = product.variants.map((variant) => variant.price.amountMinor);
            const min = { amountMinor: Math.min(...prices), currencyCode: product.variants[0].price.currencyCode };
            const max = { amountMinor: Math.max(...prices), currencyCode: product.variants[0].price.currencyCode };
            return <article className="favorite-card" key={product.id}>
              <Link className="favorite-card-image" href={`/produto/${product.slug}`}>{product.image ? <Image alt={product.image.alt} fill sizes="(max-width: 640px) 100vw, 33vw" src={product.image.url} unoptimized={product.image.url.startsWith("http")} /> : <span>Sem imagem</span>}</Link>
              <div className="favorite-card-copy"><Link href={`/produto/${product.slug}`}>{product.name}</Link><strong>{formatPriceRange(min, max)}</strong>{product.isDemo && <span className="commerce-demo-label">Catálogo demonstrativo</span>}</div>
              <div className="favorite-card-actions"><button disabled={!available} onClick={() => available && addToCart(product, available.id)} type="button"><ShoppingBag size={16} /> {available ? `Adicionar ${available.size}` : "Indisponível"}</button><button aria-label={`Remover ${product.name} dos favoritos`} onClick={() => toggleFavorite(product)} type="button"><Trash2 size={16} /></button></div>
            </article>;
          })}
        </div>
      )}
    </>
  );
}
