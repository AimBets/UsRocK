import type { AcceptedResponse } from "@/types/auth";
import type {
  ActiveCampaigns,
  ApplyCouponRequest,
  Cart,
  CartImportRequest,
  CartImportResponse,
  FavoriteList,
  ImportFavoritesRequest,
  NewsletterActionRequest,
  NewsletterConfirmed,
  NewsletterSubscribeRequest,
  NewsletterUnsubscribed,
} from "@/types/commerce";
import { apiRequest } from "./client";

const json = (method: string, body?: object): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body ?? {}),
});

export const getCart = () => apiRequest<Cart>("/api/v1/cart");
export const addCartItem = (variantId: string, quantity = 1) => apiRequest<Cart>("/api/v1/cart/items", json("POST", { variantId, quantity }));
export const updateCartItem = (itemId: string, quantity: number) => apiRequest<Cart>(`/api/v1/cart/items/${itemId}`, json("PATCH", { quantity }));
export const removeCartItem = (itemId: string) => apiRequest<Cart>(`/api/v1/cart/items/${itemId}`, { method: "DELETE" });
export const importCart = (input: CartImportRequest) => apiRequest<CartImportResponse>("/api/v1/cart/import", json("POST", input));
export const applyCoupon = (input: ApplyCouponRequest) => apiRequest<Cart>("/api/v1/cart/coupon", json("PUT", input));
export const removeCoupon = () => apiRequest<Cart>("/api/v1/cart/coupon", { method: "DELETE" });

export const getFavorites = () => apiRequest<FavoriteList>("/api/v1/me/favorites");
export const addFavorite = (productId: string) => apiRequest<void>(`/api/v1/me/favorites/${productId}`, json("PUT"));
export const removeFavorite = (productId: string) => apiRequest<void>(`/api/v1/me/favorites/${productId}`, { method: "DELETE" });
export const importFavorites = (input: ImportFavoritesRequest) => apiRequest<FavoriteList>("/api/v1/me/favorites/import", json("POST", input));

export const getActiveCampaigns = (placement?: "announcement_bar" | "home_hero" | "home_panel") =>
  apiRequest<ActiveCampaigns>(`/api/v1/campaigns/active${placement ? `?placement=${placement}` : ""}`, { cache: "force-cache", next: { revalidate: 60 } });

export const subscribeNewsletter = (input: NewsletterSubscribeRequest) => apiRequest<AcceptedResponse>("/api/v1/newsletter/subscriptions", json("POST", input));
export const confirmNewsletter = (input: NewsletterActionRequest) => apiRequest<NewsletterConfirmed>("/api/v1/newsletter/confirm", json("POST", input));
export const unsubscribeNewsletter = (input: NewsletterActionRequest) => apiRequest<NewsletterUnsubscribed>("/api/v1/newsletter/unsubscribe", json("POST", input));
