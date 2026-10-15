import type { Metadata } from "next";
import { NewsletterAction } from "@/components/commerce/newsletter-action";

export const metadata: Metadata = { title: "Confirmar newsletter — UsRock", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function ConfirmNewsletterPage({ searchParams }: { searchParams: Promise<{ token?: string | string[] }> }) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";
  return <main className="auth-page" id="conteudo"><div className="shell auth-grid"><section className="auth-card"><NewsletterAction action="confirm" token={token} /></section></div></main>;
}
