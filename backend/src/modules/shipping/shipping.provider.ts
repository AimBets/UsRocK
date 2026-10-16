/**
 * Carrier-platform abstraction. Prices are integer centavos; the checkout only ever uses prices
 * returned by a provider and stored server-side in `shipping_quotes`.
 */

export interface PackageItem {
  quantity: number;
  weightGrams: number;
  heightCm: number;
  widthCm: number;
  lengthCm: number;
}

export interface QuoteRequest {
  destinationPostalCode: string;
  items: PackageItem[];
  /** Merchandise value, used as declared value. */
  declaredValueMinor: number;
}

export interface ShippingOption {
  serviceId: string;
  name: string;
  carrier: string;
  priceMinor: number;
  deliveryDaysMin: number;
  deliveryDaysMax: number;
}

export interface LabelParty {
  name: string;
  document?: string;
  phone?: string;
  email?: string;
  postalCode: string;
  street: string;
  number: string;
  complement: string | null;
  district: string;
  city: string;
  state: string;
}

export interface LabelRequest {
  serviceId: string;
  from: LabelParty;
  to: LabelParty;
  volume: { weightGrams: number; heightCm: number; widthCm: number; lengthCm: number };
  products: { name: string; quantity: number; unitValueMinor: number }[];
  declaredValueMinor: number;
  /** Our order number, sent as a tag for reconciliation in the provider panel. */
  reference: string;
}

export interface LabelInfo {
  providerOrderId: string;
  status: string;
  trackingCode: string | null;
  labelUrl: string | null;
  priceMinor: number | null;
}

export interface LabelOperations {
  /** Creates the label in the provider cart (status `pending`). Does NOT pay for it. */
  createLabel(request: LabelRequest): Promise<LabelInfo>;
  getLabel(providerOrderId: string): Promise<LabelInfo>;
  cancelLabel(providerOrderId: string, reason: string): Promise<void>;
}

export interface ShippingProvider {
  /** Identifier stored with quotes, orders and shipments (`superfrete`, `fixture`). */
  readonly name: string;
  quote(request: QuoteRequest): Promise<ShippingOption[]>;
  /** Present only when the provider supports labels. */
  readonly labels?: LabelOperations;
}

export type ShippingErrorKind = "unavailable" | "rejected" | "not_configured";

export class ShippingProviderError extends Error {
  constructor(
    readonly kind: ShippingErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ShippingProviderError";
  }
}

/** Sum of the per-item packages: total weight, and a stacked box (largest footprint, summed height). */
export function consolidatePackage(items: readonly PackageItem[]) {
  let weightGrams = 0;
  let heightCm = 0;
  let widthCm = 0;
  let lengthCm = 0;
  for (const item of items) {
    weightGrams += item.weightGrams * item.quantity;
    heightCm += item.heightCm * item.quantity;
    widthCm = Math.max(widthCm, item.widthCm);
    lengthCm = Math.max(lengthCm, item.lengthCm);
  }
  return { weightGrams, heightCm, widthCm, lengthCm };
}
