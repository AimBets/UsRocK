"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Heart, Menu, Search, ShoppingBag, UserRound, X } from "lucide-react";
import { navigation } from "@/data/storefront";
import { useAuth } from "@/components/auth/auth-provider";
import { useStorefront } from "./storefront-provider";
import { CartDrawer } from "@/components/commerce/cart-drawer";

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const { cartCount, favoriteIds, cartOpen, setCartOpen } = useStorefront();
  const { status: authStatus, user } = useAuth();

  useEffect(() => {
    document.body.style.overflow = menuOpen || searchOpen || cartOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [cartOpen, menuOpen, searchOpen]);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-white/10 bg-obsidian/92 text-white backdrop-blur-xl">
        <div className="shell flex h-[4.75rem] items-center justify-between gap-4">
          <button
            className="icon-button mobile-menu-trigger"
            type="button"
            aria-label="Abrir menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <Menu size={22} />
          </button>

          <Link className="brand-mark" href="/" aria-label="UsRock — início">
            US<span>R</span>OCK
          </Link>

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
            <Link className="icon-button relative" href="/conta" aria-label={authStatus === "authenticated" ? `Minha conta — ${user?.name}` : "Entrar ou criar conta"}>
              <UserRound size={20} />
              {authStatus === "authenticated" && <span className="auth-indicator" aria-hidden="true" />}
            </Link>
            <Link className="icon-button header-favorite-button relative" href="/favoritos" aria-label={`${favoriteIds.size} favoritos`}>
              <Heart size={20} />
              {favoriteIds.size > 0 && <span className="counter">{favoriteIds.size}</span>}
            </Link>
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
          <p className="mt-auto text-xs leading-6 text-stone-500">Catálogo conectado à API da UsRock.</p>
        </aside>
      </div>

      <CartDrawer />

      <div className={`search-overlay ${searchOpen ? "is-open" : ""}`} aria-hidden={!searchOpen} inert={!searchOpen} role="dialog" aria-modal="true" aria-label="Busca de produtos">
        <div className="shell relative pt-24">
          <button className="icon-button absolute right-5 top-5" type="button" onClick={() => setSearchOpen(false)} aria-label="Fechar busca"><X size={24} /></button>
          <span className="eyebrow">Encontre sua próxima peça</span>
          <form action="/catalogo" className="mt-8 border-b border-stone-600" method="get">
            <label className="sr-only" htmlFor="site-search">Buscar produtos</label>
            <div className="flex items-center gap-4">
              <Search className="text-copper" size={30} />
              <input
                autoFocus={searchOpen}
                className="w-full bg-transparent py-5 font-display text-3xl uppercase text-white outline-none placeholder:text-stone-700 md:text-6xl"
                id="site-search"
                name="q"
                placeholder="BUSCAR POR..."
              />
            </div>
          </form>
          <p className="mt-5 min-h-6 text-sm text-stone-400">A busca consulta nome e descrição no catálogo real.</p>
        </div>
      </div>
    </>
  );
}
