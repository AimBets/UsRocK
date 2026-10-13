import { AtSign, Music2, Play } from "lucide-react";
import { NewsletterForm } from "./newsletter-form";

const groups = [
  { title: "UsRock", links: ["Manifesto", "Materiais", "Editorial", "Contato"] },
  { title: "Atendimento", links: ["Trocas e devoluções", "Envios", "Guia de tamanhos", "Perguntas frequentes"] },
  { title: "Legal", links: ["Privacidade", "Termos de uso", "Cookies"] },
];

export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-black text-stone-300">
      <div className="shell grid gap-12 py-16 lg:grid-cols-[1.15fr_1fr] lg:py-24">
        <div className="max-w-md">
          <a className="brand-mark text-3xl" href="#top" aria-label="UsRock — voltar ao início">US<span>R</span>OCK</a>
          <h2 className="mt-10 font-display text-4xl uppercase leading-none text-white md:text-5xl">Receba o próximo drop antes do palco abrir.</h2>
          <NewsletterForm />
        </div>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
          {groups.map((group) => (
            <div key={group.title}>
              <h3 className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-copper">{group.title}</h3>
              <ul className="mt-5 space-y-3 text-sm">
                {group.links.map((link) => <li key={link}><a className="transition hover:text-white" href="#footer-note">{link}</a></li>)}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="shell flex flex-col gap-5 py-6 text-xs text-stone-600 sm:flex-row sm:items-center sm:justify-between">
          <p id="footer-note">© 2026 UsRock. Loja demonstrativa em desenvolvimento.</p>
          <div className="flex items-center gap-4" aria-label="Redes sociais — links demonstrativos">
            <a href="#footer-note" aria-label="Instagram"><AtSign size={17} /></a>
            <a href="#footer-note" aria-label="YouTube"><Play size={18} /></a>
            <a href="#footer-note" aria-label="TikTok"><Music2 size={17} /></a>
          </div>
        </div>
      </div>
    </footer>
  );
}
