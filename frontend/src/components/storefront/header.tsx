"use client";

import { FormEvent, useEffect, useState } from "react";
import { Heart, Menu, Search, ShoppingBag, UserRound, X } from "lucide-react";
import { navigation } from "@/data/storefront";
import { useStorefront } from "./storefront-provider";

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchMessage, setSearchMessage] = useState("");
  const { cartCount, favoriteIds } = useStorefront();

  useEffect(() => {
    document.body.style.overflow = menuOpen || searchOpen || cartOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [cartOpen, menuOpen, searchOpen]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearchMessage(
      query.trim()
        ? `Busca demonstrativa por “${query.trim()}”. A API de catálogo ainda será integrada.`
        : "Digite um termo para testar a interface de busca.",
    );
  }

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-white/10 bg-obsidian/92 text-white backdrop-blur-xl">
        <div className="shell flex h-[4.75rem] items-center justify-between gap-4">
          <button
            className="icon-button lg:hidden"
            type="button"
            aria-label="Abrir menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <Menu size={22} />
          </button>

          <a className="brand-mark" href="#top" aria-label="UsRock — início">
            US<span>R</span>OCK
          </a>

          <nav className="hidden items-center gap-7 lg:flex" aria-label="Navegação principal">
            {navigation.map((item) => (
              <a
                key={item.label}
                className={`nav-link ${item.featured ? "text-copper" : ""}`}
                href={item.href}
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-1">
            <button className="icon-button" type="button" aria-label="Buscar" onClick={() => setSearchOpen(true)}>
              <Search size={20} />
            </button>
            <button className="icon-button hidden sm:grid" type="button" aria-label="Minha conta — em breve">
              <UserRound size={20} />
            </button>
            <button className="icon-button relative hidden sm:grid" type="button" aria-label={`${favoriteIds.size} favoritos`}>
              <Heart size={20} />
              {favoriteIds.size > 0 && <span className="counter">{favoriteIds.size}</span>}
            </button>
            <button
              className="icon-button relative"
              type="button"
              aria-label={`Abrir sacola com ${cartCount} itens`}
              onClick={() => setCartOpen(true)}
            >
              <ShoppingBag size={20} />
              {cartCount > 0 && <span className="counter">{cartCount}</span>}
            </button>
          </div>
        </div>
      </header>

      <div className={`drawer-overlay ${menuOpen ? "is-open" : ""}`} onClick={() => setMenuOpen(false)} aria-hidden={!menuOpen}>
        <aside className="drawer drawer-left" onClick={(event) => event.stopPropagation()} aria-label="Menu móvel" role="dialog" aria-modal="true" inert={!menuOpen}>
          <div className="drawer-heading">
            <span className="eyebrow">Navegação</span>
            <button className="icon-button" type="button" onClick={() => setMenuOpen(false)} aria-label="Fechar menu">
              <X size={22} />
            </button>
          </div>
          <nav className="mt-8 flex flex-col" aria-label="Navegação móvel">
            {navigation.map((item, index) => (
              <a className="mobile-nav-link" key={item.label} href={item.href} onClick={() => setMenuOpen(false)}>
                <span>0{index + 1}</span>{item.label}
              </a>
            ))}
          </nav>
          <p className="mt-auto text-xs leading-6 text-stone-500">Coleção demonstrativa · integração de catálogo pendente</p>
        </aside>
      </div>

      <div className={`drawer-overlay ${cartOpen ? "is-open" : ""}`} onClick={() => setCartOpen(false)} aria-hidden={!cartOpen}>
        <aside className="drawer drawer-right" onClick={(event) => event.stopPropagation()} aria-label="Sacola" role="dialog" aria-modal="true" inert={!cartOpen}>
          <div className="drawer-heading">
            <div><span className="eyebrow">Sacola</span><p className="mt-1 text-sm text-stone-400">Estado local demonstrativo</p></div>
            <button className="icon-button" type="button" onClick={() => setCartOpen(false)} aria-label="Fechar sacola"><X size={22} /></button>
          </div>
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <ShoppingBag className="mb-5 text-copper" size={42} strokeWidth={1.25} />
            <p className="font-display text-3xl uppercase">{cartCount ? `${cartCount} ${cartCount === 1 ? "item" : "itens"}` : "Sua sacola está vazia"}</p>
            <p className="mt-3 max-w-xs text-sm leading-6 text-stone-400">Itens adicionados nesta fase não são persistidos nem enviados a um checkout real.</p>
          </div>
        </aside>
      </div>

      <div className={`search-overlay ${searchOpen ? "is-open" : ""}`} aria-hidden={!searchOpen} inert={!searchOpen} role="dialog" aria-modal="true" aria-label="Busca de produtos">
        <div className="shell relative pt-24">
          <button className="icon-button absolute right-5 top-5" type="button" onClick={() => setSearchOpen(false)} aria-label="Fechar busca"><X size={24} /></button>
          <span className="eyebrow">Encontre sua próxima peça</span>
          <form className="mt-8 border-b border-stone-600" onSubmit={submitSearch}>
            <label className="sr-only" htmlFor="site-search">Buscar produtos</label>
            <div className="flex items-center gap-4">
              <Search className="text-copper" size={30} />
              <input
                autoFocus={searchOpen}
                className="w-full bg-transparent py-5 font-display text-3xl uppercase text-white outline-none placeholder:text-stone-700 md:text-6xl"
                id="site-search"
                onChange={(event) => { setQuery(event.target.value); setSearchMessage(""); }}
                placeholder="BUSCAR POR..."
                value={query}
              />
            </div>
          </form>
          <p className="mt-5 min-h-6 text-sm text-stone-400" aria-live="polite">{searchMessage || "Sugestões: oversized, festival, heavy metal"}</p>
        </div>
      </div>
    </>
  );
}
