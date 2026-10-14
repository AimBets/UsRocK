import type { Metadata } from "next";
import { AccountShell } from "@/components/auth/account-shell";
import { RegisterForm } from "@/components/auth/register-form";

export const metadata: Metadata = { title: "Criar conta — UsRock", description: "Crie sua conta de cliente UsRock." };

export default function RegisterPage() {
  return <AccountShell eyebrow="Novo acesso" title="Entre para a casa." intro="Uma conta para reunir sua jornada na UsRock, preparada para pedidos, favoritos e experiências futuras." note={<p>Termos de Uso e Política de Privacidade ainda aguardam aprovação jurídica. O cadastro registra a versão de rascunho informada pelo backend.</p>}><RegisterForm /></AccountShell>;
}
