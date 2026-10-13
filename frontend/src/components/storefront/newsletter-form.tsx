"use client";

import { FormEvent, useState } from "react";
import { ArrowRight } from "lucide-react";

export function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(email.includes("@") ? "Cadastro simulado. A integração de e-mail ainda não está ativa." : "Informe um e-mail válido para testar.");
  }

  return (
    <form className="mt-8" onSubmit={submit}>
      <label className="sr-only" htmlFor="newsletter-email">Seu melhor e-mail</label>
      <div className="flex border-b border-stone-600 focus-within:border-copper">
        <input
          className="min-w-0 flex-1 bg-transparent py-4 text-sm text-white outline-none placeholder:uppercase placeholder:tracking-[0.15em] placeholder:text-stone-600"
          id="newsletter-email"
          onChange={(event) => { setEmail(event.target.value); setMessage(""); }}
          placeholder="SEU MELHOR E-MAIL"
          type="email"
          value={email}
        />
        <button className="px-3 text-copper transition hover:text-white" type="submit" aria-label="Cadastrar e-mail"><ArrowRight size={20} /></button>
      </div>
      <p className="mt-3 min-h-5 text-xs leading-5 text-stone-500" aria-live="polite">{message || "Interface demonstrativa; nenhum dado é enviado."}</p>
    </form>
  );
}
