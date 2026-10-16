import type { Metadata } from "next";
import { AnnouncementBar } from "@/components/storefront/announcement-bar";
import { Footer } from "@/components/storefront/footer";
import { Header } from "@/components/storefront/header";
import { OrderDetail } from "@/components/orders/order-detail";
import { requireServerCurrentUser } from "@/lib/api/auth-server";

export const metadata: Metadata = { title: "Detalhe do pedido — UsRock", robots: { index: false, follow: false } };
export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; await requireServerCurrentUser(`/conta/pedidos/${id}`); return <div><AnnouncementBar /><Header /><main className="commerce-page" id="conteudo"><div className="shell"><OrderDetail orderId={id} /></div></main><Footer /></div>; }

