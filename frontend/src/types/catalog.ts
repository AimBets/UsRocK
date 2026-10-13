export type ProductAvailability = "in_stock" | "out_of_stock" | "unknown";

export interface Money {
  amount: number;
  currencyCode: string;
}

export interface ProductVariant {
  id: string;
  size: string;
  availability: ProductAvailability;
}

export interface Product {
  id: string;
  name: string;
  collection: string;
  price: Money;
  compareAtPrice?: Money;
  image: string;
  imageAlt: string;
  variants: ProductVariant[];
  availability: ProductAvailability;
  label?: string;
  tone: "black" | "graphite" | "bone";
  dataStatus: "demo" | "live";
}

export interface NavigationItem {
  label: string;
  href: string;
  featured?: boolean;
}
