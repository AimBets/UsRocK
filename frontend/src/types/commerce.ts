import type { Money, Product, ProductDetail, ProductVariant } from "@/types/catalog";

export interface CommerceProductSnapshot {
  id: string;
  slug: string;
  name: string;
  isDemo: boolean;
  image: { url: string; alt: string } | null;
  variants: ProductVariant[];
}

export interface CartLine {
  id: string;
  product: CommerceProductSnapshot;
  variant: ProductVariant;
  quantity: number;
}

export interface FavoriteItem {
  product: CommerceProductSnapshot;
  addedAt: string;
}

export interface LocalCartTotals {
  subtotal: Money | null;
  itemCount: number;
}

export type CommerceSource = "browser_preview" | "backend";

export function toCommerceSnapshot(product: Product | ProductDetail): CommerceProductSnapshot {
  const detail = product as ProductDetail;
  const image = "primaryMedia" in product ? product.primaryMedia : detail.media[0] ?? null;
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    isDemo: product.isDemo,
    image: image ? { url: image.url, alt: image.alt } : null,
    variants: product.variants,
  };
}
