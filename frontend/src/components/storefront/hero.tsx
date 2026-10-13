import Image from "next/image";
import { ArrowDownRight, ArrowRight } from "lucide-react";

export function Hero() {
  return (
    <section className="hero-section" aria-labelledby="hero-title">
      <Image
        alt="Dois modelos fictícios usando camisetas pretas em um cenário original de bastidores"
        className="object-cover object-[68%_center]"
        fill
        priority
        sizes="100vw"
        src="/images/hero-usrock.png"
      />
      <div className="hero-veil" />
      <div className="shell relative z-10 flex min-h-[calc(100svh-7rem)] items-end pb-12 pt-24 md:items-center md:pb-16">
        <div className="max-w-3xl">
          <div className="mb-6 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.24em] text-copper">
            <span className="h-px w-10 bg-copper" /> Coleção inaugural · conceito
          </div>
          <h1 className="font-display text-[clamp(4rem,11vw,9.5rem)] leading-[0.76] tracking-[-0.055em] text-white" id="hero-title">
            VISTA O<br /><span className="text-outline">SEU SOM.</span>
          </h1>
          <p className="mt-7 max-w-lg text-base leading-7 text-stone-300 md:text-lg">
            Camisetas autorais para quem carrega o palco, o peso e a atitude para além da música.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <a className="button-primary" href="#novidades">Explorar lançamentos <ArrowRight size={17} /></a>
            <a className="button-ghost" href="#manifesto">Conhecer a UsRock <ArrowDownRight size={17} /></a>
          </div>
          <p className="mt-5 text-[0.65rem] uppercase tracking-[0.18em] text-stone-500">Produtos e condições desta página são demonstrativos</p>
        </div>
      </div>
      <div className="absolute bottom-5 right-5 z-10 hidden items-center gap-3 text-[0.65rem] uppercase tracking-[0.2em] text-stone-400 lg:flex">
        Role para descobrir <span className="grid size-9 place-items-center rounded-full border border-white/20"><ArrowDownRight size={14} /></span>
      </div>
    </section>
  );
}
