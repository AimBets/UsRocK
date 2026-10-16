"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, LockKeyhole, ShoppingBag, Truck } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { useStorefront } from "@/components/storefront/storefront-provider";
import { ShippingEstimator } from "@/components/checkout/shipping-estimator";
import { CartLineItem } from "./cart-line-item";
import { CouponForm } from "./coupon-form";

export function CartPage() {
  const { busy, cart, cartLines, commerceError, hydrated, migrationNotice, refreshCommerce, removeFromCart, setQuantity } = useStorefront();
  if (!hydrated) return <div className="commerce-page-state" role="status"><span className="skeleton" />Carregando sua sacola…</div>;
  if (commerceError && !cartLines.length) return (
    <div className="commerce-page-state" role="alert">
      <AlertTriangle size={52} strokeWidth={1.2} />
      <h2>Sacola indisponível</h2>
      <p>{commerceError}</p>
      <button className="button-primary" onClick={() => void refreshCommerce()} type="button">Tentar novamente</button>
      <Link className="text-link" href="/catalogo">Voltar ao catálogo</Link>
    </div>
  );
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
        {commerceError && <p className="commerce-warning"><AlertTriangle size={15} /> {commerceError} <button onClick={() => void refreshCommerce()} type="button">Tentar novamente</button></p>}
        {migrationNotice && <p className="commerce-warning"><AlertTriangle size={15} /> {migrationNotice}</p>}
        {cartLines.map((line) => <CartLineItem disabled={busy} key={line.id} line={line} onQuantity={(quantity) => void setQuantity(line.id, quantity).catch(() => undefined)} onRemove={() => void removeFromCart(line.id).catch(() => undefined)} />)}
      </section>
      <aside className="order-summary" aria-label="Resumo da sacola">
        <p className="eyebrow">Resumo</p>
        <div className="order-summary-row"><span>{cart.itemCount} {cart.itemCount === 1 ? "item" : "itens"}</span><strong>{formatMoney(cart.totals.subtotal)}</strong></div>
        <div className="order-summary-row is-muted"><span>Descontos</span><span>{cart.totals.discount.amountMinor ? `− ${formatMoney(cart.totals.discount)}` : "—"}</span></div>
        <div className="order-summary-row is-muted"><span>Frete</span><span>Calculado na próxima etapa</span></div>
        <div className="order-summary-total"><span>Total atual</span><strong>{formatMoney(cart.totals.total)}</strong></div>
        <CouponForm />
        <ShippingEstimator />
        <Link aria-disabled={cart.hasIssues || busy} className={`button-primary mt-6 w-full ${cart.hasIssues || busy ? "is-disabled" : ""}`} href={cart.hasIssues || busy ? "/carrinho" : "/checkout"}><LockKeyhole size={16} /> Ir para checkout</Link>
        <div className="summary-note"><Truck size={18} /><p>Preço, estoque, elegibilidade e desconto vêm do servidor. O frete entra no total somente na prévia do checkout.</p></div>
        <Link className="text-link mt-6" href="/catalogo">Continuar comprando <ArrowRight size={14} /></Link>
      </aside>
    </div>
  );
}
