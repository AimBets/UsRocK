"use client";

import { FormEvent, useState } from "react";
import { Tag } from "lucide-react";

export function CouponForm() {
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(code.trim() ? "A API de cupons E4 ainda não está disponível. Nenhum desconto foi aplicado." : "Digite um código para validar quando a API E4 estiver disponível.");
  }

  return (
    <form className="coupon-form" onSubmit={submit}>
      <label htmlFor="coupon-code"><Tag size={15} /> Cupom</label>
      <div>
        <input autoComplete="off" id="coupon-code" maxLength={40} onChange={(event) => { setCode(event.target.value.toUpperCase()); setMessage(""); }} placeholder="CÓDIGO" value={code} />
        <button type="submit">Validar</button>
      </div>
      <p aria-live="polite">{message || "Validade, elegibilidade e desconto serão confirmados exclusivamente pelo servidor."}</p>
    </form>
  );
}
