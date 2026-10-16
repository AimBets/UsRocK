import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { AnnouncementBar } from "@/components/storefront/announcement-bar";
import { Footer } from "@/components/storefront/footer";
import { Header } from "@/components/storefront/header";
import { OrderDetail } from "@/components/orders/order-detail";
import { requireServerCurrentUser } from "@/lib/api/auth-server";

export const metadata: Metadata = { title: "Retorno do pagamento — UsRock", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function PaymentReturnPage({ searchParams }: { searchParams: Promise<{ pedido?: string }> }) {
  const params = await searchParams;
  await requireServerCurrentUser(`/checkout/retorno?pedido=${encodeURIComponent(params.pedido ?? "")}`);
  if (!params.pedido) redirect("/conta/pedidos");
  return <div><AnnouncementBar /><Header /><main className="commerce-page" id="conteudo"><div className="shell"><div className="return-message"><RefreshCw size={18} /><div><p className="eyebrow">Retorno do Mercado Pago</p><p>Estamos consultando o estado diretamente no backend. Nenhum parâmetro de sucesso do navegador é usado como aprovação.</p></div></div><OrderDetail orderId={params.pedido} syncOnLoad /></div></main><Footer /></div>;
}

