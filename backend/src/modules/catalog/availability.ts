export const availabilityStates = ["in_stock", "low_stock", "out_of_stock"] as const;
export type Availability = (typeof availabilityStates)[number];

export interface StockSnapshot {
  onHand: number;
  reserved: number;
  lowStockThreshold: number;
}

/**
 * Public availability for a variant. Exact quantities are never exposed to the storefront.
 * A variant without an inventory row has never been stocked and is reported as out of stock.
 */
export function variantAvailability(stock: StockSnapshot | null | undefined): Availability {
  if (!stock) return "out_of_stock";
  const available = stock.onHand - stock.reserved;
  if (available <= 0) return "out_of_stock";
  return available <= stock.lowStockThreshold ? "low_stock" : "in_stock";
}

const rank: Record<Availability, number> = { out_of_stock: 0, low_stock: 1, in_stock: 2 };

/** A product is as available as its best variant. */
export function productAvailability(variants: readonly Availability[]): Availability {
  return variants.reduce<Availability>((best, current) => (rank[current] > rank[best] ? current : best), "out_of_stock");
}
