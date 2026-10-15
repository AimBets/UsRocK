import type { Metadata } from "next";
import { AnnouncementBar } from "@/components/storefront/announcement-bar";
import { Footer } from "@/components/storefront/footer";
import { Header } from "@/components/storefront/header";
import { FavoritesPage } from "@/components/commerce/favorites-page";

export const metadata: Metadata = { title: "Favoritos — UsRock", description: "Sua seleção de favoritos da UsRock." };

export default function FavoriteProductsPage() {
  return <div><AnnouncementBar /><Header /><main id="conteudo" className="commerce-page"><div className="shell"><p className="eyebrow">Seu acervo</p><div className="commerce-page-heading"><h1>Favoritos.</h1><p>Guarde peças neste navegador e, ao entrar, sincronize sua seleção com a conta UsRock.</p></div><FavoritesPage /></div></main><Footer /></div>;
}
