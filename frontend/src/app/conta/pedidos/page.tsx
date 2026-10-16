import type { Metadata } from "next";
import { AnnouncementBar } from "@/components/storefront/announcement-bar";
import { Footer } from "@/components/storefront/footer";
import { Header } from "@/components/storefront/header";
import { OrdersList } from "@/components/orders/orders-list";
import { requireServerCurrentUser } from "@/lib/api/auth-server";

export const metadata: Metadata = { title: "Meus pedidos — UsRock", robots: { index: false, follow: false } };
export default async function OrdersPage() { await requireServerCurrentUser("/conta/pedidos"); return <div><AnnouncementBar /><Header /><main className="commerce-page" id="conteudo"><div className="shell"><p className="eyebrow">Área do cliente</p><div className="commerce-page-heading"><h1>Meus pedidos.</h1><p>Acompanhe pagamento, separação, envio e entrega usando somente estados confirmados pelo servidor.</p></div><OrdersList /></div></main><Footer /></div>; }

