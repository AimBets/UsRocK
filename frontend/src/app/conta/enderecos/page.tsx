import type { Metadata } from "next";
import { AccountShell } from "@/components/auth/account-shell";
import { AddressBook } from "@/components/checkout/address-book";
import { requireServerCurrentUser } from "@/lib/api/auth-server";

export const metadata: Metadata = { title: "Meus endereços — UsRock", robots: { index: false, follow: false } };
export default async function AddressesPage() { await requireServerCurrentUser("/conta/enderecos"); return <AccountShell eyebrow="Área do cliente / Entrega" title="Seus destinos." intro="Salve e organize os endereços usados no checkout. CPF e telefone permanecem mascarados nas respostas da API." note="Pedidos concluídos mantêm uma cópia imutável do endereço utilizado."><AddressBook /></AccountShell>; }

