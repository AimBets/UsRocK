import type { Order, OrderStatus } from "@/types/checkout";

interface ApiLikeError extends Error {
  status: number;
  code: string;
  details?: Array<{ code?: string }>;
}

function isApiError(error: unknown): error is ApiLikeError {
  return error instanceof Error && typeof (error as Partial<ApiLikeError>).status === "number" && typeof (error as Partial<ApiLikeError>).code === "string";
}

export function digits(value: string, limit?: number) {
  const result = value.replace(/\D/g, "");
  return limit ? result.slice(0, limit) : result;
}

export function newIdempotencyKey() {
  return globalThis.crypto.randomUUID();
}

export function checkoutError(error: unknown) {
  if (!isApiError(error)) return "Não foi possível concluir esta etapa. Tente novamente.";
  const code = error.details?.[0]?.code;
  const messages: Record<string, string> = {
    cart_empty: "Sua sacola está vazia.",
    cart_has_issues: "A sacola mudou e precisa ser revisada antes de continuar.",
    insufficient_stock: "Um item acabou de ficar sem estoque suficiente. Revise a sacola.",
    shipping_rejected: "Não encontramos uma modalidade de entrega para este CEP.",
    shipping_unavailable: "A cotação de frete está indisponível no momento.",
    shipping_quote_expired: "A cotação expirou ou a sacola mudou. Cote o frete novamente.",
    shipping_quote_mismatch: "A cotação pertence a outro CEP. Cote o frete novamente.",
    shipping_option_invalid: "A modalidade escolhida não está mais disponível.",
    total_changed: "O total foi atualizado pelo servidor. Revise os valores antes de confirmar novamente.",
    coupon_usage_exhausted: "Este cupom atingiu o limite de uso para sua conta.",
    coupon_expired: "O cupom expirou. Remova-o da sacola para continuar.",
    idempotency_key_reused: "Esta tentativa já foi usada com outros dados. Inicie uma nova confirmação.",
    idempotency_in_progress: "Esta confirmação ainda está sendo processada. Aguarde alguns instantes e tente novamente.",
    payment_unavailable: "O pagamento está temporariamente indisponível. O pedido continua reservado e pode ser pago depois.",
    order_not_payable: "Este pedido não aceita uma nova tentativa de pagamento.",
    order_not_cancellable: "Este pedido não pode mais ser cancelado.",
  };
  if (code && messages[code]) return messages[code];
  if (error.status === 401) return "Sua sessão expirou. Entre novamente para continuar.";
  if (error.status === 429) return "Muitas tentativas em pouco tempo. Aguarde e tente novamente.";
  return error.message;
}

export const orderTone: Record<OrderStatus, "warning" | "success" | "info" | "danger" | "muted"> = {
  pending_payment: "warning",
  paid: "success",
  in_fulfillment: "info",
  shipped: "info",
  delivered: "success",
  cancelled: "danger",
  expired: "muted",
  refunded: "muted",
};

export function paymentHeadline(order: Order) {
  if (order.status === "paid" || order.status === "in_fulfillment" || order.status === "shipped" || order.status === "delivered") return "Pagamento confirmado";
  if (order.status === "expired") return "Reserva expirada";
  if (order.status === "cancelled") return "Pedido cancelado";
  if (order.status === "refunded") return "Pagamento reembolsado";
  if (order.payment?.status === "rejected") return "Pagamento recusado";
  return "Aguardando pagamento";
}
