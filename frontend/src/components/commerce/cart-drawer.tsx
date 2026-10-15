"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, ShoppingBag, X } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { useStorefront } from "@/components/storefront/storefront-provider";
import { CartLineItem } from "./cart-line-item";

export function CartDrawer() {
  const { cartLines, cartOpen, cartTotals, hydrated, removeFromCart, setCartOpen, setQuantity, storageError } = useStorefront();
  return (
    <div className={`drawer-overlay ${cartOpen ? "is-open" : ""}`} onClick={() => setCartOpen(false)} aria-hidden={!cartOpen}>
      <aside className="drawer drawer-right cart-drawer" onClick={(event) => event.stopPropagation()} aria-label="Sacola" role="dialog" aria-modal="true" inert={!cartOpen}>
        <div className="drawer-heading">
          <div><span className="eyebrow">Sua sacola</span><p className="mt-1 text-sm text-stone-400">Prévia local · validação E4 pendente</p></div>
          <button className="icon-button" type="button" onClick={() => setCartOpen(false)} aria-label="Fechar sacola"><X size={22} /></button>
        </div>
        {!hydrated ? <div className="commerce-loading" role="status"><span className="skeleton" />Carregando sua sacola…</div> : cartLines.length ? (
          <>
            <div className="cart-drawer-lines">
              {cartLines.map((line) => <CartLineItem compact key={line.id} line={line} onQuantity={(quantity) => setQuantity(line.id, quantity)} onRemove={() => removeFromCart(line.id)} />)}
            </div>
            <div className="cart-drawer-summary">
              {storageError && <p className="commerce-warning"><AlertTriangle size={15} /> Não foi possível persistir esta sacola no navegador.</p>}
              <div><span>Subtotal estimado</span><strong>{cartTotals.subtotal ? formatMoney(cartTotals.subtotal) : "—"}</strong></div>
              <p>Preços, disponibilidade, descontos e total serão revalidados pelo backend antes do checkout.</p>
              <Link className="button-primary w-full" href="/carrinho" onClick={() => setCartOpen(false)}>Revisar sacola <ArrowRight size={16} /></Link>
            </div>
          </>
        ) : (
          <div className="commerce-empty">
            <ShoppingBag size={44} strokeWidth={1.25} />
            <h2>Sua sacola está vazia</h2>
            <p>Explore o catálogo, escolha o tamanho e monte sua seleção.</p>
            <Link className="button-primary" href="/catalogo" onClick={() => setCartOpen(false)}>Explorar catálogo</Link>
          </div>
        )}
      </aside>
    </div>
  );
}
