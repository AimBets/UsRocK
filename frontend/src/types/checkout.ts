import type { checkoutRequests, components } from "@/types/openapi";

export type Address = components["schemas"]["Address"];
export type AddressList = components["schemas"]["AddressList"];
export type AddressInput = checkoutRequests["createAddress"];
export type AddressUpdateInput = checkoutRequests["updateAddress"];
export type ShippingOption = components["schemas"]["ShippingOption"];
export type ShippingQuote = components["schemas"]["ShippingQuote"];
export type CheckoutPreviewInput = checkoutRequests["previewCheckout"];
export type CheckoutInput = checkoutRequests["placeCheckout"];
export type CheckoutSummary = components["schemas"]["CheckoutSummary"];
export type CheckoutResult = components["schemas"]["CheckoutResult"];
export type PaymentSession = components["schemas"]["PaymentSession"];
export type OrderStatus = components["schemas"]["OrderStatus"];
export type OrderItem = components["schemas"]["OrderItem"];
export type Order = components["schemas"]["Order"];
export type OrderSummary = components["schemas"]["OrderSummary"];
export type OrderList = components["schemas"]["OrderList"];

