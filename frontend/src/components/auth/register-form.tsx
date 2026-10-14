"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { register } from "@/lib/api/auth";
import { authErrorMessage } from "@/lib/auth-errors";
import { useAuth } from "./auth-provider";
import { PasswordField } from "./password-field";

export function RegisterForm() {
  const router = useRouter();
  const { setAuthenticated } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setConflict(false);
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password"));
    const confirmation = String(data.get("confirmation"));
    const email = String(data.get("email")).trim().toLowerCase();
    if (password !== confirmation) { setError("As senhas não coincidem."); return; }
    if (password.toLowerCase() === email) { setError("A senha não pode ser igual ao e-mail."); return; }
    setPending(true);
    try {
      const user = await register({
        name: String(data.get("name")).trim(),
        email,
        password,
        acceptTerms: true,
        marketingEmailOptIn: data.get("marketingEmailOptIn") === "on",
      });
      setAuthenticated(user);
      router.replace("/conta");
      router.refresh();
    } catch (cause) {
      setConflict(cause instanceof ApiError && cause.code === "CONFLICT");
      setError(authErrorMessage(cause, "Não foi possível criar sua conta."));
      setPending(false);
    }
  }

  return (
    <>
      <div className="auth-panel-heading"><span>CADASTRO / 01</span><h2>Crie seu acesso</h2><p>Seus dados são usados somente para operar sua conta e futuras compras.</p></div>
      <form className="auth-form" onSubmit={submit}>
        <label className="auth-field" htmlFor="register-name"><span>Nome</span><input autoComplete="name" id="register-name" maxLength={120} name="name" required /></label>
        <label className="auth-field" htmlFor="register-email"><span>E-mail</span><input autoComplete="email" id="register-email" maxLength={254} name="email" required type="email" /></label>
        <PasswordField autoComplete="new-password" describedBy="password-hint" id="register-password" label="Senha" minLength={10} name="password" />
        <p className="auth-hint" id="password-hint">Use entre 10 e 128 caracteres. Não há regra de composição.</p>
        <PasswordField autoComplete="new-password" id="register-confirmation" label="Confirme a senha" minLength={10} name="confirmation" />
        <label className="auth-check"><input name="acceptTerms" required type="checkbox" /><span>Li e aceito os <Link href="/legal/termos" target="_blank">Termos de Uso</Link> e a <Link href="/legal/privacidade" target="_blank">Política de Privacidade</Link>. Os textos jurídicos estão em revisão.</span></label>
        <label className="auth-check"><input name="marketingEmailOptIn" type="checkbox" /><span>Quero receber novidades e comunicações de marketing por e-mail. Opcional e desmarcado por padrão.</span></label>
        {error && <div className="auth-error" role="alert">{error}{conflict && <span className="mt-2 block"><Link href="/entrar">Entrar</Link> ou <Link href="/conta/recuperar-senha">recuperar a senha</Link>.</span>}</div>}
        <button className="button-primary w-full" disabled={pending} type="submit">{pending ? <><LoaderCircle className="animate-spin" size={17} /> Criando conta...</> : <>Criar conta <ArrowRight size={17} /></>}</button>
      </form>
      <p className="auth-switch">Já tem uma conta? <Link href="/entrar">Entrar</Link></p>
    </>
  );
}
