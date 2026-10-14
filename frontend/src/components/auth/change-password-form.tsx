"use client";

import { FormEvent, useState } from "react";
import { Check, KeyRound, LoaderCircle } from "lucide-react";
import { changePassword } from "@/lib/api/auth";
import { authErrorMessage, fieldError } from "@/lib/auth-errors";
import { PasswordField } from "./password-field";

export function ChangePasswordForm() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setSuccess("");
    const form = event.currentTarget;
    const data = new FormData(form);
    const currentPassword = String(data.get("currentPassword"));
    const newPassword = String(data.get("newPassword"));
    if (newPassword !== String(data.get("confirmation"))) { setError("As novas senhas não coincidem."); return; }
    if (currentPassword === newPassword) { setError("A nova senha deve ser diferente da senha atual."); return; }
    setPending(true);
    try {
      await changePassword({ currentPassword, newPassword });
      form.reset();
      setSuccess("Senha atualizada. Outras sessões da sua conta foram encerradas.");
    } catch (cause) {
      setError(fieldError(cause, "currentPassword", "invalid_password") ? "A senha atual está incorreta." : authErrorMessage(cause, "Não foi possível alterar a senha."));
    } finally { setPending(false); }
  }

  return <section className="account-card" aria-labelledby="password-title"><div className="account-card-title"><KeyRound size={19} /><div><p>Segurança</p><h2 id="password-title">Alterar senha</h2></div></div><form className="auth-form mt-6" onSubmit={submit}><PasswordField autoComplete="current-password" id="current-password" label="Senha atual" name="currentPassword" /><PasswordField autoComplete="new-password" id="new-password" label="Nova senha" minLength={10} name="newPassword" /><PasswordField autoComplete="new-password" id="new-password-confirmation" label="Confirme a nova senha" minLength={10} name="confirmation" />{error && <div className="auth-error" role="alert">{error}</div>}{success && <div className="auth-success" role="status"><Check size={16} /> {success}</div>}<button className="button-ghost" disabled={pending} type="submit">{pending ? <><LoaderCircle className="animate-spin" size={16} /> Atualizando...</> : "Atualizar senha"}</button></form></section>;
}
