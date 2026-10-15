import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CalendarClock } from "lucide-react";
import type { Campaign } from "@/types/commerce";

export function CampaignPanel({ campaign }: { campaign: Campaign | null }) {
  if (!campaign) return null;
  const endLabel = campaign.endsAt ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(campaign.endsAt)) : null;
  return (
    <section className="campaign-panel" aria-labelledby="campaign-title">
      <div className="campaign-panel-grid" aria-hidden="true" />
      {campaign.media && <Image alt={campaign.media.alt} className="campaign-panel-media" fill sizes="100vw" src={campaign.media.url} unoptimized={campaign.media.url.startsWith("http")} />}
      <div className="shell campaign-panel-content">
        <div><p className="eyebrow text-black">{campaign.isDemo ? "Campanha demonstrativa" : "Campanha UsRock"}</p><h2 id="campaign-title">{campaign.title}</h2></div>
        <div className="campaign-panel-note"><CalendarClock size={24} /><p>{campaign.subtitle ?? "Conheça a seleção desta campanha."}</p>{endLabel && <p className="campaign-period">Válida até {endLabel}.</p>}{campaign.couponCode && <p className="campaign-coupon">Cupom divulgado: <strong>{campaign.couponCode}</strong></p>}{campaign.cta ? <Link href={campaign.cta.href}>{campaign.cta.label} <ArrowRight size={15} /></Link> : campaign.collection ? <Link href={`/catalogo?collection=${campaign.collection.slug}`}>Ver produtos associados <ArrowRight size={15} /></Link> : null}</div>
      </div>
    </section>
  );
}
