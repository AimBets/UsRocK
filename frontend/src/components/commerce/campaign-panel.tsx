import Link from "next/link";
import { ArrowRight, CalendarClock } from "lucide-react";

export function CampaignPanel() {
  return (
    <section className="campaign-panel" aria-labelledby="campaign-title">
      <div className="campaign-panel-grid" aria-hidden="true" />
      <div className="shell campaign-panel-content">
        <div><p className="eyebrow text-black">Campanhas configuráveis</p><h2 id="campaign-title">Drops com hora,<br />contexto e atitude.</h2></div>
        <div className="campaign-panel-note"><CalendarClock size={24} /><p>O espaço está pronto para campanhas, coleções e contadores. Conteúdo, vigência e destino serão exibidos somente quando confirmados pela API E4.</p><Link href="/catalogo">Explorar catálogo atual <ArrowRight size={15} /></Link></div>
      </div>
    </section>
  );
}
