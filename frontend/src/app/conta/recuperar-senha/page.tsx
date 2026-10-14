import type { Metadata } from "next";
import { AccountShell } from "@/components/auth/account-shell";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata: Metadata = { title: "Recuperar senha — UsRock", description: "Solicite um link seguro para redefinir sua senha." };

export default function ForgotPasswordPage() {
  return <AccountShell eyebrow="Acesso seguro" title="Retome o sinal." intro="Informe seu e-mail. Por privacidade, a confirmação não revela se há uma conta cadastrada." note={<p>O link é entregue pelo serviço transacional configurado no backend. Em desenvolvimento, ele fica restrito ao Mailpit local.</p>}><ForgotPasswordForm /></AccountShell>;
}
