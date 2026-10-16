"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, LoaderCircle, PackageOpen, ReceiptText } from "lucide-react";
import { listOrders } from "@/lib/api/checkout";
import { checkoutError, orderTone } from "@/lib/checkout-state";
import { formatMoney } from "@/lib/format";
import type { OrderList, OrderSummary } from "@/types/checkout";

export function OrdersList() {
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [pageInfo, setPageInfo] = useState<OrderList["pageInfo"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load(cursor?: string) {
    setLoading(true); setError("");
    try { const result = await listOrders(cursor); setOrders((current) => cursor ? [...current, ...result.data] : result.data); setPageInfo(result.pageInfo); }
    catch (cause) { setError(checkoutError(cause)); } finally { setLoading(false); }
  }
  useEffect(() => {
    let active = true;
    void listOrders().then((result) => { if (active) { setOrders(result.data); setPageInfo(result.pageInfo); } })
      .catch((cause) => { if (active) setError(checkoutError(cause)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  if (loading && !orders.length) return <div className="commerce-page-state" role="status"><LoaderCircle className="animate-spin" size={32} />Carregando pedidos…</div>;
  if (error && !orders.length) return <div className="commerce-page-state" role="alert"><AlertTriangle size={42} /><h2>Pedidos indisponíveis</h2><p>{error}</p><button className="button-primary" onClick={() => void load()} type="button">Tentar novamente</button></div>;
  if (!orders.length) return <div className="commerce-page-state"><PackageOpen size={46} /><h2>Nenhum pedido ainda</h2><p>Quando você concluir uma compra, o acompanhamento aparecerá aqui.</p><Link className="button-primary" href="/catalogo">Explorar catálogo</Link></div>;

  return <div className="orders-list">{error && <p className="auth-error" role="alert">{error}</p>}{orders.map((order) => <article className="order-list-card" key={order.id}><div className="order-list-icon"><ReceiptText size={22} /></div><div><p>Pedido <strong>{order.number}</strong>{order.isDemo && <span className="commerce-demo-label">Demonstrativo</span>}</p><small>{new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short" }).format(new Date(order.createdAt))} · {order.itemCount} {order.itemCount === 1 ? "item" : "itens"}</small></div><span className={`status-pill is-${orderTone[order.status]}`}>{order.statusLabel}</span><strong className="order-list-total">{formatMoney(order.total)}</strong><Link aria-label={`Ver pedido ${order.number}`} href={`/conta/pedidos/${order.id}`}>Detalhes <ArrowRight size={14} /></Link></article>)}{pageInfo?.hasNextPage && pageInfo.nextCursor && <button className="button-ghost orders-more" disabled={loading} onClick={() => void load(pageInfo.nextCursor!)} type="button">{loading ? <LoaderCircle className="animate-spin" size={15} /> : "Carregar mais"}</button>}</div>;
}

