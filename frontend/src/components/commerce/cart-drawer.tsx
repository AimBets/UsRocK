"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, ShoppingBag, X } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { useStorefront } from "@/components/storefront/storefront-provider";
import { CartLineItem } from "./cart-line-item";

export function CartDrawer() {
  const { busy, cart, cartLines, cartOpen, commerceError, hydrated, migrationNotice, refreshCommerce, removeFromCart, setCartOpen, setQuantity } = useStorefront();
  return (
    <div className={`drawer-overlay ${cartOpen ? "is-open" : ""}`} onClick={() => setCartOpen(false)} aria-hidden={!cartOpen}>
      <aside className="drawer drawer-right cart-drawer" onClick={(event) => event.stopPropagation()} aria-label="Sacola" role="dialog" aria-modal="true" inert={!cartOpen}>
        <div className="drawer-heading">
          <div><span className="eyebrow">Sua sacola</span><p className="mt-1 text-sm text-stone-400">Preços e estoque validados pela UsRock</p></div>
          <button className="icon-button" type="button" onClick={() => setCartOpen(false)} aria-label="Fechar sacola"><X size={22} /></button>
        </div>
        {!hydrated ? <div className="commerce-loading" role="status"><span className="skeleton" />Carregando sua sacola…</div> : cartLines.length ? (
          <>
            <div className="cart-drawer-lines">
              {cartLines.map((line) => <CartLineItem compact disabled={busy} key={line.id} line={line} onQuantity={(quantity) => void setQuantity(line.id, quantity).catch(() => undefined)} onRemove={() => void removeFromCart(line.id).catch(() => undefined)} />)}
            </div>
            <div className="cart-drawer-summary">
              {commerceError && <p className="commerce-warning"><AlertTriangle size={15} /> {commerceError} <button onClick={() => void refreshCommerce()} type="button">Tentar novamente</button></p>}
              {migrationNotice && <p className="commerce-warning"><AlertTriangle size={15} /> {migrationNotice}</p>}
              <div><span>Total atual</span><strong>{formatMoney(cart.totals.total)}</strong></div>
              <p>Valores, descontos e disponibilidade são atualizados automaticamente pelo servidor.</p>
              <Link className="button-primary w-full" href="/carrinho" onClick={() => setCartOpen(false)}>Revisar sacola <ArrowRight size={16} /></Link>
            </div>
          </>
        ) : (
          <div className="commerce-empty">
            {commerceError ? <AlertTriangle size={44} strokeWidth={1.25} /> : <ShoppingBag size={44} strokeWidth={1.25} />}
            <h2>{commerceError ? "Sacola indisponível" : "Sua sacola está vazia"}</h2>
            <p>{commerceError ?? "Explore o catálogo, escolha o tamanho e monte sua seleção."}</p>
            {commerceError ? <button className="button-primary" onClick={() => void refreshCommerce()} type="button">Tentar novamente</button> : <Link className="button-primary" href="/catalogo" onClick={() => setCartOpen(false)}>Explorar catálogo</Link>}
          </div>
        )}
      </aside>
    </div>
  );
}
