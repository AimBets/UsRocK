"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { ArrowLeft, ArrowRight, LoaderCircle, MailCheck } from "lucide-react";
import { forgotPassword } from "@/lib/api/auth";
import { authErrorMessage } from "@/lib/auth-errors";

export function ForgotPasswordForm() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await forgotPassword({ email: String(data.get("email")) });
      setMessage(response.message);
    } catch (cause) {
      setError(authErrorMessage(cause, "Não foi possível solicitar a recuperação."));
    } finally { setPending(false); }
  }

  if (message) return <div className="auth-confirmation"><MailCheck size={38} /><h2>Confira seu e-mail</h2><p>{message}</p><p className="auth-hint">A resposta é a mesma exista ou não uma conta, protegendo sua privacidade.</p><Link className="button-ghost mt-6" href="/entrar"><ArrowLeft size={16} /> Voltar ao login</Link></div>;

  return <><div className="auth-panel-heading"><span>RECUPERAÇÃO / 01</span><h2>Recupere seu acesso</h2><p>Enviaremos um link de uso único, válido por 60 minutos.</p></div><form className="auth-form" onSubmit={submit}><label className="auth-field" htmlFor="forgot-email"><span>E-mail da conta</span><input autoComplete="email" id="forgot-email" maxLength={254} name="email" required type="email" /></label>{error && <div className="auth-error" role="alert">{error}</div>}<button className="button-primary w-full" disabled={pending} type="submit">{pending ? <><LoaderCircle className="animate-spin" size={17} /> Enviando...</> : <>Enviar instruções <ArrowRight size={17} /></>}</button></form><p className="auth-switch"><Link href="/entrar">Voltar ao login</Link></p></>;
}
