"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { ApiError } from "@/lib/api/client";
import { addCartItem, addFavorite, getCart, getFavorites, importCart, importFavorites, removeCartItem, removeFavorite, updateCartItem } from "@/lib/api/commerce";
import { COMMERCE_STORAGE_KEY, createCartMigrationTargets, initialCommerceState, parseStoredCommerce, remainingCartImport, type CommerceState } from "@/lib/commerce-state";
import type { Cart, CommerceProductSnapshot, FavoriteItem } from "@/types/commerce";
import { toCommerceSnapshot } from "@/types/commerce";

const EMPTY_CART: Cart = {
  id: null, owner: "guest", items: [], itemCount: 0, coupon: null,
  totals: {
    subtotal: { amountMinor: 0, currencyCode: "BRL" },
    discount: { amountMinor: 0, currencyCode: "BRL" },
    shipping: null,
    total: { amountMinor: 0, currencyCode: "BRL" },
  },
  hasIssues: false, updatedAt: null,
};
const CART_MIGRATION_KEY = "usrock-cart-migration-v2";

interface StorefrontContextValue {
  cart: Cart;
  cartLines: Cart["items"];
  cartCount: number;
  favorites: FavoriteItem[];
  favoriteIds: Set<string>;
  hydrated: boolean;
  commerceError: string | null;
  migrationNotice: string | null;
  busy: boolean;
  cartOpen: boolean;
  setCartOpen: (open: boolean) => void;
  refreshCommerce: () => Promise<void>;
  addToCart: (product: CommerceProductSnapshot, variantId: string) => Promise<void>;
  setQuantity: (lineId: string, quantity: number) => Promise<void>;
  removeFromCart: (lineId: string) => Promise<void>;
  toggleFavorite: (product: CommerceProductSnapshot) => Promise<void>;
  replaceCart: (cart: Cart) => void;
}

const StorefrontContext = createContext<StorefrontContextValue | null>(null);

function displayError(error: unknown) {
  if (!(error instanceof ApiError)) return "Não foi possível atualizar a loja agora.";
  const detail = error.details?.[0]?.code;
  const messages: Record<string, string> = {
    insufficient_stock: "A quantidade solicitada excede o estoque disponível.",
    out_of_stock: "Este tamanho acabou de ficar sem estoque.",
    max_quantity_exceeded: "A quantidade máxima disponível foi atingida.",
    cart_full: "A sacola atingiu o limite de itens.",
    unavailable: "Este item não está mais disponível.",
    favorites_full: "Sua lista de favoritos atingiu o limite.",
  };
  if (detail && messages[detail]) return messages[detail];
  if (error.code === "UNAUTHENTICATED") return "Sua sessão expirou. Entre novamente para sincronizar sua conta.";
  if (error.code === "SERVICE_UNAVAILABLE") return "Não foi possível falar com a loja. Seus dados locais foram preservados; tente novamente.";
  return error.message;
}

function writePending(state: CommerceState) {
  if (state.cartLines.length || state.favorites.length) window.localStorage.setItem(COMMERCE_STORAGE_KEY, JSON.stringify(state));
  else window.localStorage.removeItem(COMMERCE_STORAGE_KEY);
}

function favoriteItems(list: Awaited<ReturnType<typeof getFavorites>>): FavoriteItem[] {
  return list.data.map((item) => ({ product: toCommerceSnapshot(item.product), addedAt: item.addedAt }));
}

export function StorefrontProvider({ children }: { children: React.ReactNode }) {
  const { status: authStatus } = useAuth();
  const pending = useRef<CommerceState>(initialCommerceState);
  const [cart, setCart] = useState<Cart>(EMPTY_CART);
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [commerceError, setCommerceError] = useState<string | null>(null);
  const [migrationNotice, setMigrationNotice] = useState<string | null>(null);
  const [busyCount, setBusyCount] = useState(0);
  const [cartOpen, setCartOpen] = useState(false);

  const run = useCallback(async <T,>(request: () => Promise<T>) => {
    setBusyCount((value) => value + 1);
    setCommerceError(null);
    try {
      return await request();
    } catch (error) {
      setCommerceError(displayError(error));
      throw error;
    } finally {
      setBusyCount((value) => Math.max(0, value - 1));
    }
  }, []);

  const syncCart = useCallback(async () => {
    const localLines = pending.current.cartLines;
    if (localLines.length) {
      const current = await run(getCart);
      const storedTargets = window.localStorage.getItem(CART_MIGRATION_KEY);
      let targets: Record<string, number>;
      let hasValidJournal = false;
      try {
        targets = storedTargets ? JSON.parse(storedTargets) as Record<string, number> : {};
        hasValidJournal = Boolean(storedTargets) && Object.values(targets).every((value) => Number.isInteger(value) && value > 0);
      } catch {
        targets = {};
      }
      if (!hasValidJournal) {
        targets = createCartMigrationTargets(localLines, current.items);
        window.localStorage.setItem(CART_MIGRATION_KEY, JSON.stringify(targets));
      }
      const items = remainingCartImport(targets, current.items);
      const result = items.length ? await run(() => importCart({ items })) : { cart: current, skipped: [] };
      setCart(result.cart);
      pending.current = { ...pending.current, cartLines: [] };
      writePending(pending.current);
      window.localStorage.removeItem(CART_MIGRATION_KEY);
      if (result.skipped.length) setMigrationNotice(`${result.skipped.length} ${result.skipped.length === 1 ? "item local não pôde" : "itens locais não puderam"} ser importado por indisponibilidade ou limite da sacola.`);
      return;
    }
    setCart(await run(getCart));
  }, [run]);

  const syncFavorites = useCallback(async () => {
    if (authStatus !== "authenticated") {
      setFavorites(pending.current.favorites);
      return;
    }
    const localIds = pending.current.favorites.map((item) => item.product.id);
    const list = localIds.length ? await run(() => importFavorites({ productIds: localIds })) : await run(getFavorites);
    setFavorites(favoriteItems(list));
    if (localIds.length) {
      pending.current = { ...pending.current, favorites: [] };
      writePending(pending.current);
    }
  }, [authStatus, run]);

  const refreshCommerce = useCallback(async () => {
    await Promise.allSettled([syncCart(), syncFavorites()]);
  }, [syncCart, syncFavorites]);

  useEffect(() => {
    try {
      pending.current = parseStoredCommerce(window.localStorage.getItem(COMMERCE_STORAGE_KEY));
      setFavorites(pending.current.favorites);
    } catch {
      setCommerceError("Não foi possível ler os dados salvos neste navegador.");
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated || authStatus === "loading") return;
    void refreshCommerce();
  }, [authStatus, hydrated, refreshCommerce]);

  const value = useMemo<StorefrontContextValue>(() => ({
    cart, cartLines: cart.items, cartCount: cart.itemCount, favorites,
    favoriteIds: new Set(favorites.map((item) => item.product.id)),
    hydrated, commerceError, migrationNotice, busy: busyCount > 0,
    cartOpen, setCartOpen, refreshCommerce, replaceCart: setCart,
    addToCart: async (_product, variantId) => {
      setCart(await run(() => addCartItem(variantId)));
      setCartOpen(true);
    },
    setQuantity: async (lineId, quantity) => {
      if (quantity >= 1) setCart(await run(() => updateCartItem(lineId, quantity)));
    },
    removeFromCart: async (lineId) => setCart(await run(() => removeCartItem(lineId))),
    toggleFavorite: async (product) => {
      const exists = favorites.some((item) => item.product.id === product.id);
      if (authStatus === "authenticated") {
        await run(() => exists ? removeFavorite(product.id) : addFavorite(product.id));
        await syncFavorites();
        return;
      }
      const next = exists ? favorites.filter((item) => item.product.id !== product.id) : [...favorites, { product, addedAt: new Date().toISOString() }];
      setFavorites(next);
      pending.current = { ...pending.current, favorites: next };
      try { writePending(pending.current); } catch { setCommerceError("Não foi possível salvar os favoritos neste navegador."); }
    },
  }), [authStatus, busyCount, cart, cartOpen, commerceError, favorites, hydrated, migrationNotice, refreshCommerce, run, syncFavorites]);

  return <StorefrontContext.Provider value={value}>{children}</StorefrontContext.Provider>;
}

export function useStorefront() {
  const context = useContext(StorefrontContext);
  if (!context) throw new Error("useStorefront must be used inside StorefrontProvider");
  return context;
}
