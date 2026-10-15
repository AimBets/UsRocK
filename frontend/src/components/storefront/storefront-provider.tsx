"use client";

import { createContext, useContext, useEffect, useMemo, useReducer, useState } from "react";
import { calculateLocalCartTotals, commerceReducer, COMMERCE_STORAGE_KEY, initialCommerceState, parseStoredCommerce } from "@/lib/commerce-state";
import type { CartLine, CommerceProductSnapshot, FavoriteItem, LocalCartTotals } from "@/types/commerce";

interface StorefrontContextValue {
  cartLines: CartLine[];
  cartCount: number;
  cartTotals: LocalCartTotals;
  favorites: FavoriteItem[];
  favoriteIds: Set<string>;
  hydrated: boolean;
  storageError: boolean;
  cartOpen: boolean;
  setCartOpen: (open: boolean) => void;
  addToCart: (product: CommerceProductSnapshot, variantId: string) => void;
  setQuantity: (lineId: string, quantity: number) => void;
  removeFromCart: (lineId: string) => void;
  toggleFavorite: (product: CommerceProductSnapshot) => void;
}

const StorefrontContext = createContext<StorefrontContextValue | null>(null);

export function StorefrontProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(commerceReducer, initialCommerceState);
  const [meta, updateMeta] = useReducer((current: { hydrated: boolean; storageError: boolean }, update: Partial<{ hydrated: boolean; storageError: boolean }>) => ({ ...current, ...update }), { hydrated: false, storageError: false });
  const [cartOpen, setCartOpen] = useState(false);

  useEffect(() => {
    try {
      dispatch({ type: "hydrate", state: parseStoredCommerce(window.localStorage.getItem(COMMERCE_STORAGE_KEY)) });
    } catch {
      updateMeta({ storageError: true });
    } finally {
      updateMeta({ hydrated: true });
    }
  }, []);

  useEffect(() => {
    if (!meta.hydrated) return;
    try {
      window.localStorage.setItem(COMMERCE_STORAGE_KEY, JSON.stringify(state));
    } catch {
      updateMeta({ storageError: true });
    }
  }, [meta.hydrated, state]);

  const value = useMemo<StorefrontContextValue>(() => {
    const cartTotals = calculateLocalCartTotals(state.cartLines);
    return {
      cartLines: state.cartLines,
      cartCount: cartTotals.itemCount,
      cartTotals,
      favorites: state.favorites,
      favoriteIds: new Set(state.favorites.map((item) => item.product.id)),
      hydrated: meta.hydrated,
      storageError: meta.storageError,
      cartOpen,
      setCartOpen,
      addToCart: (product, variantId) => {
        dispatch({ type: "add", product, variantId });
        setCartOpen(true);
      },
      setQuantity: (lineId, quantity) => dispatch({ type: "quantity", lineId, quantity }),
      removeFromCart: (lineId) => dispatch({ type: "remove", lineId }),
      toggleFavorite: (product) => dispatch({ type: "toggleFavorite", product }),
    };
  }, [cartOpen, meta, state]);

  return <StorefrontContext.Provider value={value}>{children}</StorefrontContext.Provider>;
}

export function useStorefront() {
  const context = useContext(StorefrontContext);
  if (!context) throw new Error("useStorefront must be used inside StorefrontProvider");
  return context;
}
