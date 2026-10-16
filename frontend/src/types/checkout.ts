import type { Money } from "@/types/catalog";

// Espelho tipado dos schemas E5 em `claude/e5-checkout`.
// Migrar estes aliases para `openapi.d.ts` assim que o backend E5 entrar na base desta branch.

export interface Address {
  id: string;
  label: string | null;
  recipientName: string;
  recipientDocumentMasked: string;
  recipientPhoneMasked: string;
  postalCode: string;
  street: string;
  number: string;
  complement: string | null;
  district: string;
  city: string;
  state: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AddressInput {
  label?: string | null;
  recipientName: string;
  recipientDocument: string;
  recipientPhone: string;
  postalCode: string;
  street: string;
  number: string;
  complement?: string | null;
  district: string;
  city: string;
  state: string;
  isDefault?: boolean;
}

export interface ShippingOption {
  serviceId: string;
  name: string;
  carrier: string;
  price: Money;
  deliveryDays: { min: number; max: number };
}

export interface ShippingQuote {
  id: string;
  provider: string;
  isSimulated: boolean;
  postalCode: string;
  expiresAt: string;
  options: ShippingOption[];
}

export interface CheckoutInput {
  addressId: string;
  quoteId: string;
  serviceId: string;
  expectedTotal?: Money;
}

export interface CheckoutSummary {
  items: Array<{ variantId: string; productName: string; size: string; quantity: number; unitPrice: Money; lineTotal: Money }>;
  coupon: { code: string; discount: Money } | null;
  shipping: ShippingOption;
  totals: { subtotal: Money; discount: Money; shipping: Money; total: Money };
  reservationMinutes: number;
  isDemo: boolean;
}

export interface PaymentSession {
  provider: "mercado_pago";
  environment: "sandbox" | "production";
  checkoutUrl: string;
  expiresAt: string;
}

export type OrderStatus = "pending_payment" | "paid" | "in_fulfillment" | "shipped" | "delivered" | "cancelled" | "expired" | "refunded";

export interface OrderItem {
  id: string;
  productId: string;
  productSlug: string;
  productName: string;
  variantId: string;
  sku: string;
  size: string;
  color: string | null;
  image: { url: string; alt: string } | null;
  unitPrice: Money;
  compareAtUnitPrice: Money | null;
  quantity: number;
  lineTotal: Money;
  isDemo: boolean;
}

export interface Order {
  id: string;
  number: string;
  status: OrderStatus;
  statusLabel: string;
  isDemo: boolean;
  items: OrderItem[];
  coupon: { code: string; discount: Money } | null;
  shipping: ShippingOption & {
    provider: string;
    address: Omit<Address, "id" | "label" | "isDefault" | "createdAt" | "updatedAt">;
    tracking: { status: string; code: string | null; carrier: string } | null;
  };
  totals: CheckoutSummary["totals"];
  payment: { provider: string; environment: "sandbox" | "production"; status: string; statusDetail: string | null; updatedAt: string } | null;
  reservationExpiresAt: string;
  canPay: boolean;
  canCancel: boolean;
  history: Array<{ status: OrderStatus; at: string }>;
  createdAt: string;
  paidAt: string | null;
  cancelledAt: string | null;
}

export interface CheckoutResult { order: Order; payment: PaymentSession | null }
export interface OrderSummary { id: string; number: string; status: OrderStatus; statusLabel: string; itemCount: number; total: Money; isDemo: boolean; createdAt: string }
export interface OrderList { data: OrderSummary[]; pageInfo: { limit: number; hasNextPage: boolean; nextCursor: string | null } }

