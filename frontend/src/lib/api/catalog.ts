import type { Category, Collection, PageInfo, Product, ProductDetail } from "@/types/catalog";
import { apiRequest } from "./client";

export type ProductSort = "newest" | "price_asc" | "price_desc" | "name_asc";
export interface ProductFilters {
  q?: string;
  category?: string;
  collection?: string;
  size?: string;
  priceMin?: number;
  priceMax?: number;
  inStock?: boolean;
  sort?: ProductSort;
  limit?: number;
  cursor?: string;
}

function queryString(input: object) {
  const query = new URLSearchParams();
  Object.entries(input as Record<string, string | number | boolean | undefined>).forEach(([key, value]) => {
    if (value !== undefined && value !== "") query.set(key, String(value));
  });
  const serialized = query.toString();
  return serialized ? `?${serialized}` : "";
}

export function getProducts(filters: ProductFilters = {}) {
  return apiRequest<{ data: Product[]; pageInfo: PageInfo }>(`/api/v1/products${queryString(filters)}`);
}

export function getProduct(slug: string) {
  return apiRequest<ProductDetail>(`/api/v1/products/${encodeURIComponent(slug)}`);
}

export function getCollections(limit = 24) {
  return apiRequest<{ data: Collection[]; pageInfo: PageInfo }>(`/api/v1/collections?limit=${limit}`);
}

export function getCategories() {
  return apiRequest<{ data: Category[] }>("/api/v1/categories");
}
