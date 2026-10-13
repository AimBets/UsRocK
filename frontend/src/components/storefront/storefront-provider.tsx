"use client";

import { createContext, useContext, useMemo, useState } from "react";

interface StorefrontContextValue {
  cartCount: number;
  favoriteIds: Set<string>;
  addToCart: () => void;
  toggleFavorite: (id: string) => void;
}

const StorefrontContext = createContext<StorefrontContextValue | null>(null);

export function StorefrontProvider({ children }: { children: React.ReactNode }) {
  const [cartCount, setCartCount] = useState(0);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());

  const value = useMemo<StorefrontContextValue>(
    () => ({
      cartCount,
      favoriteIds,
      addToCart: () => setCartCount((count) => count + 1),
      toggleFavorite: (id) =>
        setFavoriteIds((current) => {
          const next = new Set(current);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        }),
    }),
    [cartCount, favoriteIds],
  );

  return <StorefrontContext.Provider value={value}>{children}</StorefrontContext.Provider>;
}

export function useStorefront() {
  const context = useContext(StorefrontContext);
  if (!context) throw new Error("useStorefront must be used inside StorefrontProvider");
  return context;
}
