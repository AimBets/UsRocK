import type { Money, Product, ProductDetail, ProductVariant } from "@/types/catalog";
import type { commerceRequests, components } from "./openapi";

export type Cart = components["schemas"]["Cart"];
export type CartLine = components["schemas"]["CartItem"];
export type CartCoupon = components["schemas"]["CartCoupon"];
export type CartItemIssue = components["schemas"]["CartItemIssue"];
export type CouponIssue = components["schemas"]["CouponIssue"];
export type CartImportResponse = components["schemas"]["CartImportResponse"];
export type Favorite = components["schemas"]["Favorite"];
export type FavoriteList = components["schemas"]["FavoriteList"];
export type Campaign = components["schemas"]["Campaign"];
export type ActiveCampaigns = components["schemas"]["ActiveCampaigns"];
export type NewsletterConfirmed = components["schemas"]["NewsletterConfirmed"];
export type NewsletterUnsubscribed = components["schemas"]["NewsletterUnsubscribed"];
export type CartImportRequest = commerceRequests["importCart"];
export type ApplyCouponRequest = commerceRequests["applyCoupon"];
export type ImportFavoritesRequest = commerceRequests["importFavorites"];
export type NewsletterSubscribeRequest = commerceRequests["subscribeNewsletter"];
export type NewsletterActionRequest = commerceRequests["confirmNewsletter"];

export interface CommerceProductSnapshot {
  id: string;
  slug: string;
  name: string;
  isDemo: boolean;
  image: { url: string; alt: string } | null;
  variants: ProductVariant[];
}

export interface LocalCartLine {
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
