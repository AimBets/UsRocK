"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { login } from "@/lib/api/auth";
import { authErrorMessage } from "@/lib/auth-errors";
import { useAuth } from "./auth-provider";
import { PasswordField } from "./password-field";

function safeDestination(value: string) {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/conta";
}

export function LoginForm({ next = "/conta", passwordReset = false }: { next?: string; passwordReset?: boolean }) {
  const router = useRouter();
  const { setAuthenticated } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      const user = await login({ email: String(data.get("email")), password: String(data.get("password")) });
      setAuthenticated(user);
      router.replace(safeDestination(next));
      router.refresh();
    } catch (cause) {
      setError(authErrorMessage(cause, "Não foi possível entrar agora."));
      setPending(false);
    }
  }

  return (
    <>
      <div className="auth-panel-heading"><span>ACESSO / 01</span><h2>Entre na sua conta</h2><p>Use o e-mail e a senha cadastrados na UsRock.</p></div>
      {passwordReset && <div className="auth-success" role="status">Senha redefinida. Entre novamente com a nova senha.</div>}
      <form className="auth-form" onSubmit={submit}>
        <label className="auth-field" htmlFor="login-email"><span>E-mail</span><input autoComplete="email" id="login-email" maxLength={254} name="email" required type="email" /></label>
        <PasswordField autoComplete="current-password" id="login-password" label="Senha" name="password" />
        <div className="flex justify-end"><Link className="auth-inline-link" href="/conta/recuperar-senha">Esqueci minha senha</Link></div>
        {error && <div className="auth-error" role="alert">{error}</div>}
        <button className="button-primary w-full" disabled={pending} type="submit">{pending ? <><LoaderCircle className="animate-spin" size={17} /> Entrando...</> : <>Entrar <ArrowRight size={17} /></>}</button>
      </form>
      <p className="auth-switch">Ainda não tem conta? <Link href="/cadastro">Criar minha conta</Link></p>
    </>
  );
}
