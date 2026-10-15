"use client";

import Image from "next/image";
import Link from "next/link";
import { Heart, LogIn, ShoppingBag, Trash2 } from "lucide-react";
import { formatPriceRange } from "@/lib/format";
import { useAuth } from "@/components/auth/auth-provider";
import { useStorefront } from "@/components/storefront/storefront-provider";

export function FavoritesPage() {
  const { status } = useAuth();
  const { addToCart, busy, commerceError, favorites, hydrated, refreshCommerce, toggleFavorite } = useStorefront();
  if (!hydrated) return <div className="commerce-page-state" role="status"><span className="skeleton" />Carregando favoritos…</div>;
  return (
    <>
      {status !== "authenticated" && <div className="session-callout"><LogIn size={20} /><div><strong>Favoritos salvos neste navegador</strong><p>Ao entrar, esta lista será unida com segurança aos favoritos da sua conta.</p></div><Link href="/entrar?next=%2Ffavoritos">Entrar</Link></div>}
      {commerceError && <p className="commerce-warning mt-8">{commerceError} <button onClick={() => void refreshCommerce()} type="button">Tentar novamente</button></p>}
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
              <div className="favorite-card-actions"><button disabled={!available || busy} onClick={() => available && void addToCart(product, available.id).catch(() => undefined)} type="button"><ShoppingBag size={16} /> {available ? `Adicionar ${available.size}` : "Indisponível"}</button><button aria-label={`Remover ${product.name} dos favoritos`} disabled={busy} onClick={() => void toggleFavorite(product).catch(() => undefined)} type="button"><Trash2 size={16} /></button></div>
            </article>;
          })}
        </div>
      )}
    </>
  );
}
