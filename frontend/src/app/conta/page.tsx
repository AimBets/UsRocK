import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, CalendarDays, LockKeyhole, Mail, MapPin, PackageCheck, ShieldCheck, UserRound } from "lucide-react";
import { AnnouncementBar } from "@/components/storefront/announcement-bar";
import { Footer } from "@/components/storefront/footer";
import { Header } from "@/components/storefront/header";
import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { LogoutButton } from "@/components/auth/logout-button";
import { requireServerCurrentUser } from "@/lib/api/auth-server";

export const metadata: Metadata = { title: "Minha conta — UsRock", description: "Dados e segurança da sua conta UsRock.", robots: { index: false, follow: false } };

export default async function AccountPage() {
  const user = await requireServerCurrentUser();
  const createdAt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeZone: "America/Sao_Paulo" }).format(new Date(user.createdAt));

  return <div><AnnouncementBar /><Header /><main className="account-dashboard" id="conteudo"><div className="shell py-12 md:py-20"><div className="account-dashboard-heading"><div><p className="eyebrow">Área do cliente</p><h1>Minha conta.</h1><p>Dados confirmados pela sua sessão ativa no backend.</p></div><LogoutButton /></div><nav aria-label="Atalhos da conta" className="account-shortcuts"><Link href="/conta/pedidos"><PackageCheck size={19} /><span><strong>Meus pedidos</strong><small>Pagamento, envio e histórico</small></span></Link><Link href="/conta/enderecos"><MapPin size={19} /><span><strong>Endereços</strong><small>Destinos salvos para entrega</small></span></Link></nav><div className="mt-10 grid gap-5 lg:grid-cols-[1.05fr_.95fr]"><div className="grid gap-5"><section className="account-card"><div className="account-card-title"><UserRound size={19} /><div><p>Identidade</p><h2>{user.name}</h2></div></div><dl className="account-data"><div><dt><Mail size={14} /> E-mail</dt><dd>{user.email}</dd></div><div><dt><CalendarDays size={14} /> Cliente desde</dt><dd>{createdAt}</dd></div><div><dt><BadgeCheck size={14} /> Verificação</dt><dd>{user.emailVerified ? "E-mail verificado" : "Verificação de e-mail ainda não disponível"}</dd></div></dl></section><section className="account-card"><div className="account-card-title"><ShieldCheck size={19} /><div><p>Acesso</p><h2>Papéis e permissões</h2></div></div><div className="mt-6"><p className="account-label">Papéis retornados</p><div className="account-badges">{user.roles.map((role) => <code key={role}>{role}</code>)}</div></div><div className="mt-6"><p className="account-label">Permissões administrativas efetivas</p>{user.permissions.length ? <div className="account-permissions">{user.permissions.map((permission) => <code key={permission}>{permission}</code>)}</div> : <p className="mt-2 text-sm leading-6 text-stone-400">Nenhuma permissão administrativa. Contas de cliente acessam somente seus próprios recursos.</p>}</div></section><section className="account-card account-card-muted"><LockKeyhole size={19} /><div><h2>Dados protegidos</h2><p>Endereços pertencem à sua sessão; CPF e telefone são sempre mascarados nas respostas da API.</p></div></section></div><ChangePasswordForm /></div></div></main><Footer /></div>;
}
