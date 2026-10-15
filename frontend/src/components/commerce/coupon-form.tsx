"use client";

import { FormEvent, useState } from "react";
import { Tag } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { applyCoupon, removeCoupon } from "@/lib/api/commerce";
import { useStorefront } from "@/components/storefront/storefront-provider";

const couponMessages: Record<string, string> = {
  coupon_invalid: "Cupom inválido.",
  coupon_expired: "Este cupom expirou.",
  coupon_usage_exhausted: "O limite de usos deste cupom foi atingido.",
  coupon_requires_account: "Entre na sua conta para usar este cupom.",
  coupon_minimum_not_met: "O subtotal mínimo deste cupom ainda não foi atingido.",
  coupon_not_applicable: "Este cupom não se aplica aos itens atuais.",
};

export function CouponForm() {
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { cart, replaceCart } = useStorefront();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!code.trim()) { setMessage("Digite um código."); return; }
    setSubmitting(true);
    try {
      const next = await applyCoupon({ code: code.trim() });
      replaceCart(next);
      setMessage(next.coupon?.status === "applied" ? "Cupom aplicado pelo servidor." : couponMessages[next.coupon?.issue ?? "coupon_not_applicable"]);
    } catch (error) {
      const issue = error instanceof ApiError ? error.details?.[0]?.code : undefined;
      setMessage(issue && couponMessages[issue] ? couponMessages[issue] : error instanceof ApiError ? error.message : "Não foi possível validar o cupom.");
    } finally {
      setSubmitting(false);
    }
  }

  async function clearCoupon() {
    setSubmitting(true);
    try { replaceCart(await removeCoupon()); setCode(""); setMessage("Cupom removido."); }
    catch (error) { setMessage(error instanceof ApiError ? error.message : "Não foi possível remover o cupom."); }
    finally { setSubmitting(false); }
  }

  return (
    <form className="coupon-form" onSubmit={submit}>
      <label htmlFor="coupon-code"><Tag size={15} /> Cupom</label>
      <div>
        <input autoComplete="off" id="coupon-code" maxLength={40} onChange={(event) => { setCode(event.target.value.toUpperCase()); setMessage(""); }} placeholder="CÓDIGO" value={code} />
        <button disabled={submitting} type="submit">{submitting ? "Validando…" : "Validar"}</button>
      </div>
      {cart.coupon && <div className="coupon-current"><strong>{cart.coupon.code}</strong><span>{cart.coupon.description}</span><button disabled={submitting} onClick={() => void clearCoupon()} type="button">Remover</button></div>}
      <p aria-live="polite">{message || (cart.coupon?.issue ? couponMessages[cart.coupon.issue] : "Validade, elegibilidade e desconto são confirmados exclusivamente pelo servidor.")}</p>
    </form>
  );
}
