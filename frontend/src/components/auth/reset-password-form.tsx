"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { resetPassword } from "@/lib/api/auth";
import { authErrorMessage, fieldError } from "@/lib/auth-errors";
import { PasswordField } from "./password-field";

export function ResetPasswordForm({ token }: { token?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [invalidToken, setInvalidToken] = useState(!token);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password"));
    if (password !== String(data.get("confirmation"))) { setError("As senhas não coincidem."); return; }
    setPending(true); setError("");
    try {
      await resetPassword({ token, password });
      router.replace("/entrar?redefinida=1");
      router.refresh();
    } catch (cause) {
      setInvalidToken(Boolean(fieldError(cause, "token", "invalid_token")));
      setError(authErrorMessage(cause, "Não foi possível redefinir a senha."));
      setPending(false);
    }
  }

  return <><div className="auth-panel-heading"><span>RECUPERAÇÃO / 02</span><h2>Defina uma nova senha</h2><p>O link é sigiloso, expira em 60 minutos e só pode ser usado uma vez.</p></div>{invalidToken ? <div className="auth-error" role="alert"><p>{token ? error || "Este link é inválido, já foi usado ou expirou." : "O link de redefinição está incompleto."}</p><Link className="auth-inline-link mt-3 inline-block" href="/conta/recuperar-senha">Solicitar um novo link</Link></div> : <form className="auth-form" onSubmit={submit}><PasswordField autoComplete="new-password" describedBy="reset-password-hint" id="reset-password" label="Nova senha" minLength={10} name="password" /><p className="auth-hint" id="reset-password-hint">Use entre 10 e 128 caracteres.</p><PasswordField autoComplete="new-password" id="reset-confirmation" label="Confirme a nova senha" minLength={10} name="confirmation" />{error && <div className="auth-error" role="alert">{error}</div>}<button className="button-primary w-full" disabled={pending} type="submit">{pending ? <><LoaderCircle className="animate-spin" size={17} /> Redefinindo...</> : <>Redefinir senha <ArrowRight size={17} /></>}</button></form>}</>;
}
