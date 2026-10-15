"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { subscribeNewsletter } from "@/lib/api/commerce";

export function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.checkValidity()) {
      form.reportValidity();
      setMessage("Informe um e-mail válido.");
      return;
    }
    setSubmitting(true);
    setSuccess(false);
    try {
      const response = await subscribeNewsletter({ email, consent: true, source: "footer" });
      setMessage(response.message);
      setSuccess(true);
      setEmail("");
      setConsent(false);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Não foi possível solicitar a inscrição.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="mt-8" onSubmit={submit}>
      <label className="sr-only" htmlFor="newsletter-email">Seu melhor e-mail</label>
      <div className="flex border-b border-stone-600 focus-within:border-copper">
        <input
          className="min-w-0 flex-1 bg-transparent py-4 text-sm text-white outline-none placeholder:uppercase placeholder:tracking-[0.15em] placeholder:text-stone-600"
          id="newsletter-email"
          aria-describedby="newsletter-status"
          disabled={submitting}
          onChange={(event) => { setEmail(event.target.value); setMessage(""); setSuccess(false); }}
          placeholder="SEU MELHOR E-MAIL"
          type="email"
          required
          value={email}
        />
        <button className="px-3 text-copper transition hover:text-white disabled:opacity-50" disabled={submitting} type="submit" aria-label="Cadastrar e-mail">{submitting ? <span className="text-xs">Enviando…</span> : <ArrowRight size={20} />}</button>
      </div>
      <label className="newsletter-consent"><input checked={consent} disabled={submitting} onChange={(event) => setConsent(event.target.checked)} required type="checkbox" /><span>Concordo em receber e-mails de marketing, lançamentos e conteúdo editorial. Posso cancelar quando quiser. Consulte a <Link href="/legal/privacidade">privacidade</Link>.</span></label>
      <p className={`mt-3 min-h-5 text-xs leading-5 ${success ? "text-green-300" : "text-stone-500"}`} id="newsletter-status" aria-live="polite">{message ? <>{success && <CheckCircle2 className="mr-1 inline" size={13} />}{message}</> : "A inscrição só será ativada depois da confirmação enviada por e-mail."}</p>
    </form>
  );
}
