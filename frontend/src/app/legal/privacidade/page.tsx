import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, FileWarning } from "lucide-react";
import { AnnouncementBar } from "@/components/storefront/announcement-bar";
import { Footer } from "@/components/storefront/footer";
import { Header } from "@/components/storefront/header";

export const metadata: Metadata = { title: "Política de Privacidade — rascunho | UsRock", robots: { index: false, follow: false } };

export default function PrivacyPage() {
  return <div><AnnouncementBar /><Header /><main className="legal-page" id="conteudo"><article className="shell"><Link className="text-link text-stone-400" href="/cadastro"><ArrowLeft size={15} /> Voltar ao cadastro</Link><p className="eyebrow mt-10">Documento pendente</p><h1>Política de Privacidade</h1><div className="legal-warning"><FileWarning size={24} /><div><strong>Texto jurídico ainda não aprovado.</strong><p>Esta página não representa a política definitiva nem cria afirmações sobre retenção, compartilhamento ou bases legais ainda não aprovadas.</p></div></div><p>O cadastro registra os consentimentos técnicos previstos no backend, incluindo a escolha opcional de marketing. A política integral será publicada depois da revisão jurídica e da definição dos processos operacionais de privacidade da UsRock.</p></article></main><Footer /></div>;
}
