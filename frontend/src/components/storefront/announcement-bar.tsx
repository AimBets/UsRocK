import { Info, Sparkles } from "lucide-react";

export function AnnouncementBar() {
  return (
    <div className="border-b border-white/10 bg-ink text-[0.68rem] font-semibold uppercase tracking-[0.17em] text-stone-200">
      <div className="shell flex min-h-9 items-center justify-center gap-8 text-center md:justify-between">
        <span className="hidden items-center gap-2 md:flex">
          <Sparkles aria-hidden="true" size={14} /> Coleção autoral
        </span>
        <p><Info aria-hidden="true" className="mr-2 inline-block align-[-2px] text-copper" size={14} />Experiência demonstrativa · condições comerciais em validação</p>
        <span className="hidden items-center gap-2 md:flex">
          <Sparkles aria-hidden="true" size={14} /> Drop 001 · edição conceito
        </span>
      </div>
    </div>
  );
}
