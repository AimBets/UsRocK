import type { Address, AddressInput, AddressList, AddressUpdateInput, CheckoutInput, CheckoutPreviewInput, CheckoutResult, CheckoutSummary, Order, OrderList, PaymentSession, ShippingQuote } from "@/types/checkout";
import { apiRequest } from "./client";

const json = (method: string, body?: object, headers?: HeadersInit): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json", ...headers },
  body: JSON.stringify(body ?? {}),
});

export const listAddresses = () => apiRequest<AddressList>("/api/v1/me/addresses");
export const createAddress = (input: AddressInput) => apiRequest<Address>("/api/v1/me/addresses", json("POST", input));
export const updateAddress = (id: string, input: AddressUpdateInput) => apiRequest<Address>(`/api/v1/me/addresses/${id}`, json("PATCH", input));
export const deleteAddress = (id: string) => apiRequest<void>(`/api/v1/me/addresses/${id}`, { method: "DELETE" });

export const quoteShipping = (postalCode: string) => apiRequest<ShippingQuote>("/api/v1/shipping/quotes", json("POST", { postalCode }));
export const previewCheckout = (input: CheckoutPreviewInput) => apiRequest<CheckoutSummary>("/api/v1/checkouts/preview", json("POST", input));
export const placeCheckout = (input: CheckoutInput, idempotencyKey: string) => apiRequest<CheckoutResult>("/api/v1/checkouts", json("POST", input, { "Idempotency-Key": idempotencyKey }));

export const listOrders = (cursor?: string) => apiRequest<OrderList>(`/api/v1/orders?limit=12${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
export const getOrder = (id: string) => apiRequest<Order>(`/api/v1/orders/${id}`);
export const startOrderPayment = (id: string) => apiRequest<PaymentSession>(`/api/v1/orders/${id}/payment`, json("POST"));
export const syncOrderPayment = (id: string) => apiRequest<Order>(`/api/v1/orders/${id}/payment/sync`, json("POST"));
export const cancelOrder = (id: string) => apiRequest<Order>(`/api/v1/orders/${id}/cancel`, json("POST"));

