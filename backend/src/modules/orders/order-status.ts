import type { OrderStatus } from "./orders.schema.js";

/**
 * Order state machine. Payment-driven moves (`pending_payment → paid`) come only from the payment
 * provider API; fulfilment moves come from operators or the shipping provider.
 *
 * pending_payment → paid | cancelled | expired
 * expired         → paid (late approval, only if stock can be held again)
 * paid            → in_fulfillment | shipped | cancelled | refunded
 * in_fulfillment  → shipped | cancelled | refunded
 * shipped         → delivered | refunded
 * delivered       → refunded
 */
const transitions: Record<OrderStatus, readonly OrderStatus[]> = {
  pending_payment: ["paid", "cancelled", "expired"],
  expired: ["paid"],
  paid: ["in_fulfillment", "shipped", "cancelled", "refunded"],
  in_fulfillment: ["shipped", "cancelled", "refunded"],
  shipped: ["delivered", "refunded"],
  delivered: ["refunded"],
  cancelled: [],
  refunded: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return transitions[from].includes(to);
}

export function allowedTransitions(from: OrderStatus): readonly OrderStatus[] {
  return transitions[from];
}

/** Moves an operator may request through the admin API. Payment states are provider-driven. */
export const operatorTargets = ["in_fulfillment", "shipped", "delivered", "cancelled"] as const satisfies readonly OrderStatus[];

/** Customer-facing label (pt-BR) used in e-mails. */
export const orderStatusLabel: Record<OrderStatus, string> = {
  pending_payment: "Aguardando pagamento",
  paid: "Pagamento aprovado",
  in_fulfillment: "Em separação",
  shipped: "Enviado",
  delivered: "Entregue",
  cancelled: "Cancelado",
  expired: "Expirado (pagamento não concluído)",
  refunded: "Reembolsado",
};

/** Provider payment statuses (Mercado Pago) grouped by effect on the order. */
export type PaymentOutcome = "approved" | "pending" | "failed" | "reversed" | "unknown";

export function paymentOutcome(providerStatus: string): PaymentOutcome {
  switch (providerStatus) {
    case "approved":
      return "approved";
    case "pending":
    case "in_process":
    case "authorized":
    case "in_mediation":
      return "pending";
    case "rejected":
    case "cancelled":
      return "failed";
    case "refunded":
    case "charged_back":
      return "reversed";
    default:
      return "unknown";
  }
}
