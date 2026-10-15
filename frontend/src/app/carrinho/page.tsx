import type { Metadata } from "next";
import { AnnouncementBar } from "@/components/storefront/announcement-bar";
import { Footer } from "@/components/storefront/footer";
import { Header } from "@/components/storefront/header";
import { CartPage } from "@/components/commerce/cart-page";

export const metadata: Metadata = { title: "Sacola — UsRock", description: "Revise os produtos selecionados na UsRock." };

export default function ShoppingCartPage() {
  return <div><AnnouncementBar /><Header /><main id="conteudo" className="commerce-page"><div className="shell"><p className="eyebrow">Seleção atual</p><div className="commerce-page-heading"><h1>Sua sacola.</h1><p>Uma revisão clara antes do checkout. Preços, descontos, disponibilidade e totais são confirmados pelo servidor da UsRock.</p></div><CartPage /></div></main><Footer /></div>;
}
