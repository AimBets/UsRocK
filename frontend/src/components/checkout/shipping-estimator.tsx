"use client";

import { FormEvent, useState } from "react";
import { AlertTriangle, LoaderCircle, PackageCheck, Truck } from "lucide-react";
import { quoteShipping } from "@/lib/api/checkout";
import { checkoutError, digits } from "@/lib/checkout-state";
import { formatMoney } from "@/lib/format";
import type { ShippingQuote } from "@/types/checkout";

export function ShippingEstimator() {
  const [quote, setQuote] = useState<ShippingQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError(""); setQuote(null);
    const postalCode = digits(String(new FormData(event.currentTarget).get("postalCode") || ""), 8);
    try { setQuote(await quoteShipping(postalCode)); } catch (cause) { setError(checkoutError(cause)); } finally { setLoading(false); }
  }
  return <section className="shipping-estimator" aria-labelledby="shipping-title"><div><Truck size={18} /><h3 id="shipping-title">Calcular entrega</h3></div><form onSubmit={submit}><label className="sr-only" htmlFor="cart-postal-code">CEP</label><input id="cart-postal-code" inputMode="numeric" maxLength={9} name="postalCode" placeholder="00000-000" required /><button disabled={loading} type="submit">{loading ? <LoaderCircle className="animate-spin" size={15} /> : "Calcular"}</button></form>{error && <p className="shipping-error" role="alert"><AlertTriangle size={14} />{error}</p>}{quote && <div className="shipping-results">{quote.isSimulated && <p className="simulation-notice"><AlertTriangle size={14} /> Valores simulados para desenvolvimento; nenhuma transportadora foi consultada.</p>}{!quote.options.length ? <p>Nenhuma modalidade disponível para este CEP.</p> : quote.options.map((option) => <div key={option.serviceId}><PackageCheck size={15} /><span><strong>{option.name}</strong><small>{option.carrier} · {option.deliveryDays.min === option.deliveryDays.max ? option.deliveryDays.min : `${option.deliveryDays.min}–${option.deliveryDays.max}`} dias úteis</small></span><strong>{formatMoney(option.price)}</strong></div>)}</div>}</section>;
}

