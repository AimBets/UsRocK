import type { ProductVariant } from "@/types/catalog";
import type { CartLine, CommerceProductSnapshot, FavoriteItem, LocalCartTotals } from "@/types/commerce";

export const COMMERCE_STORAGE_KEY = "usrock-commerce-preview-v1";
export const MAX_PREVIEW_QUANTITY = 10;

export interface CommerceState {
  cartLines: CartLine[];
  favorites: FavoriteItem[];
}

export type CommerceAction =
  | { type: "hydrate"; state: CommerceState }
  | { type: "add"; product: CommerceProductSnapshot; variantId: string }
  | { type: "quantity"; lineId: string; quantity: number }
  | { type: "remove"; lineId: string }
  | { type: "toggleFavorite"; product: CommerceProductSnapshot };

export const initialCommerceState: CommerceState = { cartLines: [], favorites: [] };

export function commerceReducer(state: CommerceState, action: CommerceAction): CommerceState {
  if (action.type === "hydrate") return action.state;
  if (action.type === "add") {
    const variant = action.product.variants.find((item) => item.id === action.variantId);
    if (!variant || variant.availability === "out_of_stock") return state;
    const lineId = `${action.product.id}:${variant.id}`;
    const existing = state.cartLines.find((line) => line.id === lineId);
    const cartLines = existing
      ? state.cartLines.map((line) => line.id === lineId ? { ...line, quantity: Math.min(MAX_PREVIEW_QUANTITY, line.quantity + 1), variant } : line)
      : [...state.cartLines, { id: lineId, product: action.product, variant, quantity: 1 }];
    return { ...state, cartLines };
  }
  if (action.type === "quantity") {
    if (action.quantity < 1) return { ...state, cartLines: state.cartLines.filter((line) => line.id !== action.lineId) };
    return { ...state, cartLines: state.cartLines.map((line) => line.id === action.lineId ? { ...line, quantity: Math.min(MAX_PREVIEW_QUANTITY, action.quantity) } : line) };
  }
  if (action.type === "remove") return { ...state, cartLines: state.cartLines.filter((line) => line.id !== action.lineId) };
  const exists = state.favorites.some((item) => item.product.id === action.product.id);
  return {
    ...state,
    favorites: exists
      ? state.favorites.filter((item) => item.product.id !== action.product.id)
      : [...state.favorites, { product: action.product, addedAt: new Date().toISOString() }],
  };
}

export function calculateLocalCartTotals(lines: CartLine[]): LocalCartTotals {
  if (!lines.length) return { subtotal: null, itemCount: 0 };
  const currencyCode = lines[0].variant.price.currencyCode;
  const compatible = lines.every((line) => line.variant.price.currencyCode === currencyCode);
  return {
    itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
    subtotal: compatible ? {
      amountMinor: lines.reduce((sum, line) => sum + line.variant.price.amountMinor * line.quantity, 0),
      currencyCode,
    } : null,
  };
}

export function parseStoredCommerce(value: string | null): CommerceState {
  if (!value) return initialCommerceState;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!isRecord(parsed)) return initialCommerceState;
    return {
      cartLines: Array.isArray(parsed.cartLines) ? parsed.cartLines.flatMap(parseCartLine) : [],
      favorites: Array.isArray(parsed.favorites) ? parsed.favorites.flatMap(parseFavorite) : [],
    };
  } catch {
    return initialCommerceState;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function parseMoney(value: unknown) {
  if (!isRecord(value) || typeof value.amountMinor !== "number" || !Number.isSafeInteger(value.amountMinor) || value.amountMinor < 0 || value.currencyCode !== "BRL") return null;
  return { amountMinor: value.amountMinor, currencyCode: "BRL" as const };
}

function parseVariant(value: unknown): ProductVariant | null {
  if (!isRecord(value) || !isString(value.id) || !isString(value.sku) || !isString(value.size)) return null;
  const availability = value.availability;
  if (availability !== "in_stock" && availability !== "low_stock" && availability !== "out_of_stock") return null;
  const price = parseMoney(value.price);
  const compareAtPrice = value.compareAtPrice == null ? null : parseMoney(value.compareAtPrice);
  if (!price || (value.compareAtPrice != null && !compareAtPrice)) return null;
  return {
    id: value.id,
    sku: value.sku,
    size: value.size,
    color: typeof value.color === "string" ? value.color : null,
    price,
    compareAtPrice,
    availability,
  };
}

function parseProduct(value: unknown): CommerceProductSnapshot | null {
  if (!isRecord(value) || !isString(value.id) || !isString(value.slug) || !isString(value.name) || typeof value.isDemo !== "boolean" || !Array.isArray(value.variants)) return null;
  const variants = value.variants.flatMap((variant) => {
    const parsed = parseVariant(variant);
    return parsed ? [parsed] : [];
  });
  if (!variants.length) return null;
  const image = value.image == null
    ? null
    : isRecord(value.image) && isString(value.image.url) && typeof value.image.alt === "string"
      ? { url: value.image.url, alt: value.image.alt }
      : null;
  return { id: value.id, slug: value.slug, name: value.name, isDemo: value.isDemo, image, variants };
}

function parseCartLine(value: unknown): CartLine[] {
  if (!isRecord(value)) return [];
  const product = parseProduct(value.product);
  const quantity = typeof value.quantity === "number" && Number.isFinite(value.quantity) ? Math.floor(value.quantity) : 0;
  const storedVariant = value.variant;
  if (!product || !isRecord(storedVariant) || !isString(storedVariant.id) || quantity < 1) return [];
  const variant = product.variants.find((item) => item.id === storedVariant.id);
  if (!variant || variant.availability === "out_of_stock") return [];
  return [{ id: `${product.id}:${variant.id}`, product, variant, quantity: Math.min(MAX_PREVIEW_QUANTITY, quantity) }];
}

function parseFavorite(value: unknown): FavoriteItem[] {
  if (!isRecord(value)) return [];
  const product = parseProduct(value.product);
  if (!product) return [];
  return [{ product, addedAt: typeof value.addedAt === "string" ? value.addedAt : new Date(0).toISOString() }];
}
