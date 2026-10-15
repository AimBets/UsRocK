"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, LockKeyhole, ShoppingBag, Truck } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { useStorefront } from "@/components/storefront/storefront-provider";
import { CartLineItem } from "./cart-line-item";
import { CouponForm } from "./coupon-form";

export function CartPage() {
  const { cartLines, cartTotals, hydrated, removeFromCart, setQuantity, storageError } = useStorefront();
  if (!hydrated) return <div className="commerce-page-state" role="status"><span className="skeleton" />Carregando sua sacola…</div>;
  if (!cartLines.length) return (
    <div className="commerce-page-state">
      <ShoppingBag size={52} strokeWidth={1.2} />
      <h2>Nada na sacola ainda</h2>
      <p>Seu próximo uniforme de palco pode estar a um clique.</p>
      <Link className="button-primary" href="/catalogo">Ver catálogo</Link>
    </div>
  );
  return (
    <div className="cart-page-grid">
      <section aria-label="Produtos na sacola" className="cart-page-lines">
        {storageError && <p className="commerce-warning"><AlertTriangle size={15} /> A persistência local falhou; mantenha esta aba aberta.</p>}
        {cartLines.map((line) => <CartLineItem key={line.id} line={line} onQuantity={(quantity) => setQuantity(line.id, quantity)} onRemove={() => removeFromCart(line.id)} />)}
      </section>
      <aside className="order-summary" aria-label="Resumo da sacola">
        <p className="eyebrow">Resumo</p>
        <div className="order-summary-row"><span>{cartTotals.itemCount} {cartTotals.itemCount === 1 ? "item" : "itens"}</span><strong>{cartTotals.subtotal ? formatMoney(cartTotals.subtotal) : "—"}</strong></div>
        <div className="order-summary-row is-muted"><span>Descontos</span><span>Aguardando cupom</span></div>
        <div className="order-summary-row is-muted"><span>Frete</span><span>Calculado no checkout E5</span></div>
        <div className="order-summary-total"><span>Subtotal estimado</span><strong>{cartTotals.subtotal ? formatMoney(cartTotals.subtotal) : "—"}</strong></div>
        <CouponForm />
        <button className="button-primary mt-6 w-full" disabled type="button"><LockKeyhole size={16} /> Checkout aguardando E4/E5</button>
        <div className="summary-note"><Truck size={18} /><p>O backend será a fonte de verdade para preços, estoque, descontos, frete e total final.</p></div>
        <Link className="text-link mt-6" href="/catalogo">Continuar comprando <ArrowRight size={14} /></Link>
      </aside>
    </div>
  );
}
