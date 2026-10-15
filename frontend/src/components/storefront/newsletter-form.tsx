"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";

export function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [consent, setConsent] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.checkValidity()) {
      form.reportValidity();
      setMessage("Informe um e-mail válido.");
      return;
    }
    setMessage("A API de newsletter E4 ainda não está disponível. Nenhum dado foi enviado.");
  }

  return (
    <form className="mt-8" onSubmit={submit}>
      <label className="sr-only" htmlFor="newsletter-email">Seu melhor e-mail</label>
      <div className="flex border-b border-stone-600 focus-within:border-copper">
        <input
          className="min-w-0 flex-1 bg-transparent py-4 text-sm text-white outline-none placeholder:uppercase placeholder:tracking-[0.15em] placeholder:text-stone-600"
          id="newsletter-email"
          aria-describedby="newsletter-status"
          onChange={(event) => { setEmail(event.target.value); setMessage(""); }}
          placeholder="SEU MELHOR E-MAIL"
          type="email"
          required
          value={email}
        />
        <button className="px-3 text-copper transition hover:text-white" type="submit" aria-label="Cadastrar e-mail"><ArrowRight size={20} /></button>
      </div>
      <label className="newsletter-consent"><input checked={consent} onChange={(event) => setConsent(event.target.checked)} type="checkbox" /><span>Quero receber também comunicações editoriais e lançamentos. Opcional; consulte a <Link href="/legal/privacidade">privacidade</Link>.</span></label>
      <p className="mt-3 min-h-5 text-xs leading-5 text-stone-500" id="newsletter-status" aria-live="polite">{message ? <><CheckCircle2 className="mr-1 inline" size={13} />{message}</> : "Interface preparada para inscrição e confirmação em duas etapas; nenhum dado é enviado agora."}</p>
    </form>
  );
}
