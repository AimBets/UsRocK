import Link from "next/link";

export default function ProductNotFound() {
  return <main className="grid min-h-screen place-items-center bg-obsidian p-6 text-center text-white"><div><p className="eyebrow">404 / catálogo</p><h1 className="mt-4 font-display text-6xl uppercase">Produto não encontrado.</h1><p className="mt-4 text-stone-400">O item pode ter sido removido ou ainda não está publicado.</p><Link className="button-primary mt-7" href="/catalogo">Voltar ao catálogo</Link></div></main>;
}
