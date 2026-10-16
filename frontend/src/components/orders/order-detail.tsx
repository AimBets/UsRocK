"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock3, CreditCard, LoaderCircle, MapPin, PackageCheck, RefreshCw, RotateCcw, Truck, XCircle } from "lucide-react";
import { cancelOrder, getOrder, startOrderPayment, syncOrderPayment } from "@/lib/api/checkout";
import { checkoutError, orderTone, paymentHeadline } from "@/lib/checkout-state";
import { formatMoney } from "@/lib/format";
import type { Order } from "@/types/checkout";

export function OrderDetail({ orderId, syncOnLoad = false }: { orderId: string; syncOnLoad?: boolean }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async (sync = false) => {
    setLoading(true); setError("");
    try {
      let result: Order;
      if (sync) {
        try { result = await syncOrderPayment(orderId); }
        catch (cause) { setError(`${checkoutError(cause)} Exibimos abaixo o último estado confirmado pela UsRock.`); result = await getOrder(orderId); }
      } else result = await getOrder(orderId);
      setOrder(result);
    } catch (cause) { setError(checkoutError(cause)); }
    finally { setLoading(false); }
  }, [orderId]);

  useEffect(() => {
    let active = true;
    const request = syncOnLoad
      ? syncOrderPayment(orderId).catch(async (cause) => {
          if (active) setError(`${checkoutError(cause)} Exibimos abaixo o último estado confirmado pela UsRock.`);
          return getOrder(orderId);
        })
      : getOrder(orderId);
    void request.then((result) => { if (active) setOrder(result); })
      .catch((cause) => { if (active) setError(checkoutError(cause)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [orderId, syncOnLoad]);
  useEffect(() => { if (!order?.canPay) return; const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, [order?.canPay]);
  const remaining = useMemo(() => order ? Math.max(0, new Date(order.reservationExpiresAt).getTime() - now) : 0, [now, order]);
  const remainingLabel = `${String(Math.floor(remaining / 60000)).padStart(2, "0")}:${String(Math.floor((remaining % 60000) / 1000)).padStart(2, "0")}`;

  async function pay() { if (!order) return; setBusy(true); setError(""); try { const session = await startOrderPayment(order.id); window.location.assign(session.checkoutUrl); } catch (cause) { setError(checkoutError(cause)); setBusy(false); } }
  async function cancel() { if (!order || !window.confirm(`Cancelar o pedido ${order.number}? A reserva de estoque será liberada.`)) return; setBusy(true); setError(""); try { setOrder(await cancelOrder(order.id)); } catch (cause) { setError(checkoutError(cause)); } finally { setBusy(false); } }

  if (loading && !order) return <div className="commerce-page-state" role="status"><LoaderCircle className="animate-spin" size={32} />Consultando o estado real do pedido…</div>;
  if (!order) return <div className="commerce-page-state" role="alert"><AlertTriangle size={42} /><h2>Pedido indisponível</h2><p>{error || "Não foi possível localizar este pedido."}</p><button className="button-primary" onClick={() => void load(syncOnLoad)} type="button">Tentar novamente</button></div>;

  const headline = paymentHeadline(order);
  const HeadlineIcon = order.status === "cancelled" || order.status === "expired" ? XCircle : order.status === "pending_payment" ? Clock3 : CheckCircle2;
  return <div className="order-detail">
    <Link className="text-link" href="/conta/pedidos"><ArrowLeft size={14} /> Todos os pedidos</Link>
    {error && <div className="checkout-error mt-6" role="alert"><AlertTriangle size={17} /><p>{error}</p></div>}
    <header className="order-detail-hero"><div><p className="eyebrow">Pedido {order.number}</p><h1><HeadlineIcon size={32} />{headline}</h1><p>Criado em {new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short" }).format(new Date(order.createdAt))}</p></div><span className={`status-pill is-${orderTone[order.status]}`}>{order.statusLabel}</span></header>
    {order.isDemo && <div className="simulation-notice"><AlertTriangle size={16} /> Este pedido contém itens demonstrativos. Operações de desenvolvimento devem permanecer sem cobrança real.</div>}
    {order.status === "pending_payment" && <section className="payment-action-card"><div><CreditCard size={22} /><span><strong>{order.payment?.status === "rejected" ? "Pagamento recusado" : "Pagamento ainda não confirmado"}</strong><small>{order.payment?.status === "rejected" ? "Você pode tentar novamente enquanto a reserva estiver ativa." : "A aprovação depende da confirmação consultada pelo backend."}</small></span></div>{order.canPay && <p className="reservation-clock"><Clock3 size={15} /> {remaining > 0 ? <>Reserva por mais <strong>{remainingLabel}</strong></> : "O prazo exibido terminou; atualize o status antes de tentar pagar."}</p>}<div className="payment-actions"><button className="button-primary" disabled={!order.canPay || remaining <= 0 || busy} onClick={() => void pay()} type="button">{busy ? <LoaderCircle className="animate-spin" size={16} /> : <><RotateCcw size={16} /> {order.payment ? "Tentar pagamento novamente" : "Ir ao pagamento"}</>}</button><button className="button-ghost" disabled={busy} onClick={() => void load(true)} type="button"><RefreshCw size={15} /> Atualizar status</button>{order.canCancel && <button className="danger-link" disabled={busy} onClick={() => void cancel()} type="button">Cancelar pedido</button>}</div></section>}

    <div className="order-detail-grid"><section className="checkout-card"><div className="checkout-section-heading"><div><p className="eyebrow">Itens</p><h2>Sua seleção</h2></div></div><div className="order-products">{order.items.map((item) => <article key={item.id}>{item.image ? <Image alt={item.image.alt} height={88} src={item.image.url} unoptimized={item.image.url.startsWith("http")} width={80} /> : <span className="order-product-empty">USR</span>}<div><Link href={`/produto/${item.productSlug}`}>{item.productName}</Link><small>Tamanho {item.size}{item.color ? ` · ${item.color}` : ""} · Qtd. {item.quantity}</small>{item.isDemo && <span className="commerce-demo-label">Demonstrativo</span>}</div><strong>{formatMoney(item.lineTotal)}</strong></article>)}</div></section>
      <aside className="order-summary"><p className="eyebrow">Valores registrados</p><div className="order-summary-row"><span>Produtos</span><strong>{formatMoney(order.totals.subtotal)}</strong></div><div className="order-summary-row is-muted"><span>Desconto{order.coupon ? ` · ${order.coupon.code}` : ""}</span><span>{order.totals.discount.amountMinor ? `− ${formatMoney(order.totals.discount)}` : "—"}</span></div><div className="order-summary-row"><span>Entrega</span><strong>{formatMoney(order.totals.shipping)}</strong></div><div className="order-summary-total"><span>Total</span><strong>{formatMoney(order.totals.total)}</strong></div>{order.payment && <div className="payment-provider-note"><CreditCard size={15} /><span>{order.payment.provider} · {order.payment.environment === "sandbox" ? "ambiente de testes" : "produção"}<small>Status do provedor: {order.payment.status}</small></span></div>}</aside>
    </div>

    <div className="order-detail-grid"><section className="account-card"><div className="account-card-title"><MapPin size={19} /><div><p>Entrega</p><h2>{order.shipping.name}</h2></div></div><address className="order-address"><strong>{order.shipping.address.recipientName}</strong><span>{order.shipping.address.street}, {order.shipping.address.number}{order.shipping.address.complement ? ` — ${order.shipping.address.complement}` : ""}</span><span>{order.shipping.address.district} · {order.shipping.address.city}/{order.shipping.address.state}</span><span>CEP {order.shipping.address.postalCode} · {order.shipping.address.recipientPhoneMasked}</span></address><p className="delivery-window"><Truck size={15} /> {order.shipping.carrier} · {order.shipping.deliveryDays.min === order.shipping.deliveryDays.max ? order.shipping.deliveryDays.min : `${order.shipping.deliveryDays.min}–${order.shipping.deliveryDays.max}`} dias úteis após postagem</p>{order.shipping.tracking && <div className="tracking-card"><PackageCheck size={18} /><span><strong>{order.shipping.tracking.status}</strong><small>{order.shipping.tracking.code ? `Código: ${order.shipping.tracking.code}` : "Código de rastreio ainda não disponível"}</small></span></div>}</section>
      <section className="account-card"><div className="account-card-title"><PackageCheck size={19} /><div><p>Histórico</p><h2>Andamento</h2></div></div><ol className="order-timeline">{order.history.map((entry, index) => <li key={`${entry.status}-${entry.at}-${index}`}><span /><div><strong>{statusLabel(entry.status)}</strong><small>{new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(entry.at))}</small></div></li>)}</ol></section></div>
  </div>;
}

const labels: Record<Order["status"], string> = { pending_payment: "Pedido recebido; aguardando pagamento", paid: "Pagamento aprovado", in_fulfillment: "Pedido em separação", shipped: "Pedido enviado", delivered: "Pedido entregue", cancelled: "Pedido cancelado", expired: "Reserva expirada", refunded: "Pagamento reembolsado" };
function statusLabel(status: Order["status"]) { return labels[status]; }

