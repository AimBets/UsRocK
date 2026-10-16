import type { Metadata } from "next";
import Link from "next/link";
import { CheckoutFlow } from "@/components/checkout/checkout-flow";
import { requireServerCurrentUser } from "@/lib/api/auth-server";

export const metadata: Metadata = { title: "Checkout — UsRock", description: "Entrega, revisão e pagamento seguro do seu pedido UsRock.", robots: { index: false, follow: false } };

export default async function CheckoutPage() {
  const user = await requireServerCurrentUser("/checkout");
  return <main className="checkout-page" id="conteudo"><header className="checkout-header"><Link className="brand-mark" href="/">Us<span>Rock</span></Link><span>Checkout seguro</span></header><div className="shell checkout-shell"><div className="checkout-title"><p className="eyebrow">Finalizar compra</p><h1>Seu pedido, sem ruído.</h1><p>Confirme entrega e valores com a fonte oficial da UsRock antes de seguir para o Mercado Pago.</p></div><CheckoutFlow customerName={user.name} /></div></main>;
}

