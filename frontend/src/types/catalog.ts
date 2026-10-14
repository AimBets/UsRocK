import type { components } from "@/types/openapi";

export type Money = components["schemas"]["Money"];
export type ProductAvailability = components["schemas"]["Availability"];
export type ProductVariant = components["schemas"]["ProductVariant"];
export type Product = components["schemas"]["ProductSummary"];
export type ProductDetail = components["schemas"]["ProductDetail"];
export type Collection = components["schemas"]["Collection"];
export type Category = components["schemas"]["Category"];
export type PageInfo = components["schemas"]["PageInfo"];
export type ApiErrorResponse = components["schemas"]["ErrorResponse"];

export interface NavigationItem {
  label: string;
  href: string;
  featured?: boolean;
}
