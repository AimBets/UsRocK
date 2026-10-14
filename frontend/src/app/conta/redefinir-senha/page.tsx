import type { Metadata } from "next";
import { AccountShell } from "@/components/auth/account-shell";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata: Metadata = { title: "Redefinir senha — UsRock", description: "Defina uma nova senha para sua conta UsRock.", referrer: "no-referrer", robots: { index: false, follow: false } };

const one = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  return <AccountShell eyebrow="Link de uso único" title="Ajuste a frequência." intro="Defina uma senha nova. Quando concluído, todas as sessões existentes serão encerradas." note={<p>Esta página não envia o endereço de origem e não registra o token em analytics ou logs do frontend.</p>}><ResetPasswordForm token={one(params.token)} /></AccountShell>;
}
