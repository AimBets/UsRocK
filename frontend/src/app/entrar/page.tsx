import type { Metadata } from "next";
import { AccountShell } from "@/components/auth/account-shell";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = { title: "Entrar — UsRock", description: "Acesse sua conta UsRock." };

const one = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  return <AccountShell eyebrow="Sua conta" title="De volta ao volume." intro="Acompanhe sua identidade UsRock com uma sessão protegida e mantida pelo servidor." note={<p>Suas credenciais são enviadas somente à API da UsRock. O navegador não tem acesso ao cookie de sessão.</p>}><LoginForm next={one(params.next)} passwordReset={one(params.redefinida) === "1"} /></AccountShell>;
}
