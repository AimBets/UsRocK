"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, CreditCard, LoaderCircle, LockKeyhole, PackageCheck, RefreshCw, ShieldCheck, Truck, UserRound } from "lucide-react";
import { useStorefront } from "@/components/storefront/storefront-provider";
import { placeCheckout, previewCheckout, quoteShipping } from "@/lib/api/checkout";
import { ApiError } from "@/lib/api/client";
import { checkoutError, newIdempotencyKey } from "@/lib/checkout-state";
import { formatMoney } from "@/lib/format";
import type { Address, CheckoutSummary, ShippingQuote } from "@/types/checkout";
import { AddressBook } from "./address-book";

type Step = "address" | "shipping" | "review";

export function CheckoutFlow({ customerName }: { customerName: string }) {
  const router = useRouter();
  const { refreshCommerce } = useStorefront();
  const [step, setStep] = useState<Step>("address");
  const [address, setAddress] = useState<Address | null>(null);
  const [quote, setQuote] = useState<ShippingQuote | null>(null);
  const [serviceId, setServiceId] = useState("");
  const [summary, setSummary] = useState<CheckoutSummary | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const selectAddress = useCallback((next: Address) => {
    setAddress((current) => current?.id === next.id ? current : next);
    if (address?.id !== next.id) { setQuote(null); setServiceId(""); setSummary(null); setIdempotencyKey(""); }
  }, [address?.id]);

  const progress = useMemo(() => [
    { label: "Identificação", done: true, active: false },
    { label: "Endereço", done: Boolean(address), active: step === "address" },
    { label: "Entrega", done: Boolean(summary), active: step === "shipping" },
    { label: "Revisão", done: false, active: step === "review" },
    { label: "Pagamento", done: false, active: false },
  ], [address, step, summary]);

  async function loadQuote() {
    if (!address) return;
    setBusy(true); setError(""); setQuote(null); setServiceId(""); setSummary(null); setIdempotencyKey("");
    try { setQuote(await quoteShipping(address.postalCode)); setStep("shipping"); } catch (cause) { setError(checkoutError(cause)); } finally { setBusy(false); }
  }

  async function review(successMessage = "") {
    if (!address || !quote || !serviceId) return;
    setBusy(true); setError("");
    try {
      const next = await previewCheckout({ addressId: address.id, quoteId: quote.id, serviceId });
      setSummary(next); setIdempotencyKey(newIdempotencyKey()); setStep("review"); setError(successMessage);
    } catch (cause) {
      setError(checkoutError(cause));
      const code = cause instanceof ApiError ? cause.details?.[0]?.code : null;
      if (code === "shipping_quote_expired" || code === "shipping_quote_mismatch") { setQuote(null); setServiceId(""); }
    } finally { setBusy(false); }
  }

  async function confirm() {
    if (!address || !quote || !serviceId || !summary || !idempotencyKey) return;
    setBusy(true); setError("");
    try {
      const result = await placeCheckout({ addressId: address.id, quoteId: quote.id, serviceId, expectedTotal: summary.totals.total }, idempotencyKey);
      await refreshCommerce();
      if (result.payment) {
        window.location.assign(result.payment.checkoutUrl);
        return;
      }
      router.replace(`/conta/pedidos/${result.order.id}?novo=1`);
    } catch (cause) {
      setError(checkoutError(cause));
      const code = cause instanceof ApiError ? cause.details?.[0]?.code : null;
      if (code === "total_changed") { setSummary(null); setStep("shipping"); await review("O total mudou e foi atualizado pelo servidor. Confira os novos valores antes de confirmar novamente."); }
      else if (code === "shipping_quote_expired" || code === "shipping_quote_mismatch") { setSummary(null); setQuote(null); setServiceId(""); setStep("shipping"); }
      else if (code === "idempotency_key_reused") setIdempotencyKey(newIdempotencyKey());
      else if (code === "cart_has_issues" || code === "insufficient_stock") router.push("/carrinho");
    } finally { setBusy(false); }
  }

  return <div className="checkout-layout">
    <nav aria-label="Etapas do checkout" className="checkout-progress">{progress.map((item, index) => <div aria-current={item.active ? "step" : undefined} className={`${item.active ? "is-active" : ""} ${item.done ? "is-done" : ""}`} key={item.label}><span>{item.done ? <Check size={13} /> : index + 1}</span><small>{item.label}</small></div>)}</nav>
    <div className="checkout-trust"><ShieldCheck size={18} /><span><strong>{customerName}</strong>, sua sessão está protegida. Valores, estoque e descontos serão confirmados pelo servidor.</span></div>
    {error && <div className="checkout-error" role="alert"><AlertTriangle size={18} /><p>{error}</p></div>}

    {step === "address" && <section className="checkout-card"><AddressBook onSelect={selectAddress} selectable selectedId={address?.id} /><div className="checkout-footer-actions"><Link className="text-link" href="/carrinho"><ArrowLeft size={14} /> Voltar à sacola</Link><button className="button-primary" disabled={!address || busy} onClick={() => void loadQuote()} type="button">{busy ? <LoaderCircle className="animate-spin" size={16} /> : <>Calcular entrega <ArrowRight size={16} /></>}</button></div></section>}

    {step === "shipping" && <section className="checkout-card"><div className="checkout-section-heading"><div><p className="eyebrow">Etapa 03</p><h2>Escolha a entrega</h2><p>Para {address?.street}, {address?.number} · {address?.city}/{address?.state}</p></div><button className="button-ghost" onClick={() => setStep("address")} type="button">Trocar endereço</button></div>
      {!quote && <button className="quote-retry" disabled={busy} onClick={() => void loadQuote()} type="button"><RefreshCw size={18} /> Cotar novamente</button>}
      {quote?.isSimulated && <div className="simulation-notice"><AlertTriangle size={16} /><strong>Valores simulados.</strong> Este ambiente usa a tabela fixture autorizada pelo backend e não consulta uma transportadora real.</div>}
      <div className="shipping-options">{quote?.options.map((option) => <label className={serviceId === option.serviceId ? "is-selected" : ""} key={option.serviceId}><input checked={serviceId === option.serviceId} name="shipping" onChange={() => { setServiceId(option.serviceId); setSummary(null); setIdempotencyKey(""); }} type="radio" value={option.serviceId} /><PackageCheck size={20} /><span><strong>{option.name}</strong><small>{option.carrier} · {option.deliveryDays.min === option.deliveryDays.max ? option.deliveryDays.min : `${option.deliveryDays.min}–${option.deliveryDays.max}`} dias úteis após postagem</small></span><strong>{formatMoney(option.price)}</strong></label>)}</div>
      {quote && !quote.options.length && <p className="checkout-state">Nenhuma modalidade atende este CEP. Confira o endereço ou tente novamente.</p>}
      <div className="checkout-footer-actions"><button className="text-link" onClick={() => setStep("address")} type="button"><ArrowLeft size={14} /> Endereço</button><button className="button-primary" disabled={!serviceId || busy} onClick={() => void review()} type="button">{busy ? <LoaderCircle className="animate-spin" size={16} /> : <>Revisar pedido <ArrowRight size={16} /></>}</button></div>
    </section>}

    {step === "review" && summary && <div className="checkout-review-grid"><section className="checkout-card"><div className="checkout-section-heading"><div><p className="eyebrow">Etapa 04</p><h2>Revise antes de pagar</h2></div></div><div className="checkout-items">{summary.items.map((item) => <article key={item.variantId}><span><strong>{item.productName}</strong><small>Tamanho {item.size} · {item.quantity} {item.quantity === 1 ? "unidade" : "unidades"}</small></span><strong>{formatMoney(item.lineTotal)}</strong></article>)}</div><dl className="review-details"><div><dt><UserRound size={15} /> Recebedor</dt><dd>{address?.recipientName}</dd></div><div><dt><Truck size={15} /> Entrega</dt><dd>{summary.shipping.name} · {summary.shipping.carrier}</dd></div><div><dt><MapPinIcon /> Destino</dt><dd>{address?.street}, {address?.number} · {address?.city}/{address?.state}</dd></div></dl>{summary.isDemo && <div className="simulation-notice"><AlertTriangle size={16} /> Pedido demonstrativo: contém produtos marcados como demonstração.</div>}</section>
      <aside className="order-summary checkout-final-summary"><p className="eyebrow">Total do servidor</p><div className="order-summary-row"><span>Produtos</span><strong>{formatMoney(summary.totals.subtotal)}</strong></div><div className="order-summary-row is-muted"><span>Desconto{summary.coupon ? ` · ${summary.coupon.code}` : ""}</span><span>{summary.totals.discount.amountMinor ? `− ${formatMoney(summary.totals.discount)}` : "—"}</span></div><div className="order-summary-row"><span>Frete</span><strong>{formatMoney(summary.totals.shipping)}</strong></div><div className="order-summary-total"><span>Total</span><strong>{formatMoney(summary.totals.total)}</strong></div><p className="reservation-note">O estoque será reservado por {summary.reservationMinutes} minutos após a criação do pedido.</p><button className="button-primary w-full" disabled={busy} onClick={() => void confirm()} type="button">{busy ? <><LoaderCircle className="animate-spin" size={16} /> Criando pedido…</> : <><CreditCard size={16} /> Confirmar e ir ao pagamento</>}</button><div className="summary-note"><LockKeyhole size={18} /><p>A UsRock não recebe dados do cartão. O pagamento é concluído no Mercado Pago e só será aprovado após confirmação real do backend.</p></div><button className="text-link mt-6" disabled={busy} onClick={() => { setSummary(null); setIdempotencyKey(""); setStep("shipping"); }} type="button"><ArrowLeft size={14} /> Alterar entrega</button></aside>
    </div>}
  </div>;
}

function MapPinIcon() { return <svg aria-hidden="true" fill="none" height="15" viewBox="0 0 24 24" width="15"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" stroke="currentColor" strokeWidth="2"/><circle cx="12" cy="10" r="2" stroke="currentColor" strokeWidth="2"/></svg>; }

