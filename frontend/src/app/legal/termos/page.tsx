import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, FileWarning } from "lucide-react";
import { AnnouncementBar } from "@/components/storefront/announcement-bar";
import { Footer } from "@/components/storefront/footer";
import { Header } from "@/components/storefront/header";

export const metadata: Metadata = { title: "Termos de Uso — rascunho | UsRock", robots: { index: false, follow: false } };

export default function TermsPage() {
  return <div><AnnouncementBar /><Header /><main className="legal-page" id="conteudo"><article className="shell"><Link className="text-link text-stone-400" href="/cadastro"><ArrowLeft size={15} /> Voltar ao cadastro</Link><p className="eyebrow mt-10">Documento pendente</p><h1>Termos de Uso</h1><div className="legal-warning"><FileWarning size={24} /><div><strong>Texto jurídico ainda não aprovado.</strong><p>Esta página existe para deixar o estado do documento explícito. Ela não substitui os Termos de Uso definitivos.</p></div></div><p>A versão registrada pelo backend no ambiente atual é um rascunho técnico. Conteúdo, vigência, direitos, deveres e condições comerciais serão publicados somente após revisão jurídica e aprovação da operação UsRock.</p></article></main><Footer /></div>;
}
