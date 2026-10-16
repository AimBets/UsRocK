// Gerado por npm run openapi:generate. Não edite manualmente.
export interface components {
  schemas: {
    Availability: "in_stock" | "low_stock" | "out_of_stock";
    Money: {
      "amountMinor": number;
      "currencyCode": "BRL";
    };
    MoneyInput: {
      "amountMinor": number;
      "currencyCode": "BRL";
    };
    Media: {
      "url": string;
      "alt": string;
      "width": number | null;
      "height": number | null;
    };
    CategoryRef: {
      "id": string;
      "slug": string;
      "name": string;
    };
    CollectionRef: {
      "id": string;
      "slug": string;
      "title": string;
    };
    ProductVariant: {
      "id": string;
      "sku": string;
      "size": string;
      "color": string | null;
      "price": components["schemas"]["Money"];
      "compareAtPrice": components["schemas"]["Money"] | null;
      "availability": components["schemas"]["Availability"];
    };
    ProductSummary: {
      "id": string;
      "slug": string;
      "name": string;
      "label": string | null;
      "tone": "black" | "graphite" | "bone" | null;
      "isDemo": boolean;
      "category": components["schemas"]["CategoryRef"] | null;
      "collections": Array<components["schemas"]["CollectionRef"]>;
      "priceRange": {
      "min": components["schemas"]["Money"];
      "max": components["schemas"]["Money"];
    };
      "availability": components["schemas"]["Availability"];
      "variants": Array<components["schemas"]["ProductVariant"]>;
      "primaryMedia": components["schemas"]["Media"] | null;
    };
    ProductDetail: {
      "id": string;
      "slug": string;
      "name": string;
      "label": string | null;
      "tone": "black" | "graphite" | "bone" | null;
      "isDemo": boolean;
      "category": components["schemas"]["CategoryRef"] | null;
      "collections": Array<components["schemas"]["CollectionRef"]>;
      "priceRange": {
      "min": components["schemas"]["Money"];
      "max": components["schemas"]["Money"];
    };
      "availability": components["schemas"]["Availability"];
      "variants": Array<components["schemas"]["ProductVariant"]>;
      "description": string;
      "media": Array<components["schemas"]["Media"]>;
      "seo": {
      "title": string;
      "description": string | null;
    };
      "publishedAt": string;
    };
    Collection: {
      "id": string;
      "slug": string;
      "title": string;
      "description": string | null;
      "heroMedia": {
      "url": string;
      "alt": string;
    } | null;
    };
    Category: {
      "id": string;
      "slug": string;
      "name": string;
      "description": string | null;
      "parentId": string | null;
    };
    PageInfo: {
      "limit": number;
      "hasNextPage": boolean;
      "nextCursor": string | null;
    };
    ErrorDetail: {
      "path": string;
      "message": string;
      "code": string;
    };
    ErrorResponse: {
      "error": {
      "code": "BAD_REQUEST" | "VALIDATION_ERROR" | "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "METHOD_NOT_ALLOWED" | "CONFLICT" | "PRECONDITION_FAILED" | "PAYLOAD_TOO_LARGE" | "UNSUPPORTED_MEDIA_TYPE" | "RATE_LIMITED" | "INTERNAL_ERROR" | "SERVICE_UNAVAILABLE";
      "message": string;
      "requestId": string;
      "details"?: Array<components["schemas"]["ErrorDetail"]>;
    };
    };
    CurrentUser: {
      "id": string;
      "email": string;
      "name": string;
      "roles": Array<"customer" | "operator" | "content_editor" | "admin">;
      "permissions": Array<"catalog:manage" | "inventory:manage" | "orders:manage" | "customers:read" | "campaigns:manage" | "landing_pages:edit" | "landing_pages:publish" | "media:upload" | "users:manage" | "audit:read">;
      "emailVerified": boolean;
      "createdAt": string;
    };
    UserResponse: {
      "user": components["schemas"]["CurrentUser"];
    };
    AcceptedResponse: {
      "message": string;
    };
    Cart: {
      "id": string | null;
      "owner": "guest" | "customer";
      "items": Array<components["schemas"]["CartItem"]>;
      "itemCount": number;
      "coupon": components["schemas"]["CartCoupon"] | null;
      "totals": {
      "subtotal": components["schemas"]["Money"];
      "discount": components["schemas"]["Money"];
      "shipping": null;
      "total": components["schemas"]["Money"];
    };
      "hasIssues": boolean;
      "updatedAt": string | null;
    };
    CartItem: {
      "id": string;
      "quantity": number;
      "maxQuantity": number;
      "product": {
      "id": string;
      "slug": string;
      "name": string;
      "isDemo": boolean;
      "image": {
      "url": string;
      "alt": string;
    } | null;
    };
      "variant": {
      "id": string;
      "sku": string;
      "size": string;
      "color": string | null;
      "availability": components["schemas"]["Availability"];
    };
      "unitPrice": components["schemas"]["Money"];
      "compareAtUnitPrice": components["schemas"]["Money"] | null;
      "previousUnitPrice": components["schemas"]["Money"] | null;
      "lineTotal": components["schemas"]["Money"];
      "issues": Array<components["schemas"]["CartItemIssue"]>;
    };
    CartCoupon: {
      "code": string;
      "description": string;
      "status": "applied" | "not_applicable";
      "issue": components["schemas"]["CouponIssue"] | null;
      "discount": components["schemas"]["Money"];
      "minimumSubtotal": components["schemas"]["Money"] | null;
    };
    CartItemIssue: "unavailable" | "out_of_stock" | "insufficient_stock" | "price_changed";
    CouponIssue: "coupon_invalid" | "coupon_expired" | "coupon_usage_exhausted" | "coupon_requires_account" | "coupon_minimum_not_met" | "coupon_not_applicable";
    CartImportResponse: {
      "cart": components["schemas"]["Cart"];
      "skipped": Array<{
      "variantId": string;
      "reason": "unavailable" | "cart_full";
    }>;
    };
    Favorite: {
      "product": components["schemas"]["ProductSummary"];
      "addedAt": string;
    };
    FavoriteList: {
      "data": Array<components["schemas"]["Favorite"]>;
    };
    Campaign: {
      "id": string;
      "slug": string;
      "placement": "announcement_bar" | "home_hero" | "home_panel";
      "title": string;
      "subtitle": string | null;
      "cta": {
      "label": string;
      "href": string;
    } | null;
      "media": {
      "url": string;
      "alt": string;
    } | null;
      "collection": components["schemas"]["CollectionRef"] | null;
      "couponCode": string | null;
      "startsAt": string;
      "endsAt": string | null;
      "isDemo": boolean;
    };
    ActiveCampaigns: {
      "data": Array<components["schemas"]["Campaign"]>;
    };
    NewsletterConfirmed: {
      "status": "confirmed";
    };
    NewsletterUnsubscribed: {
      "status": "unsubscribed";
    };
    Address: {
      "id": string;
      "label": string | null;
      "recipientName": string;
      "recipientDocumentMasked": string;
      "recipientPhoneMasked": string;
      "postalCode": string;
      "street": string;
      "number": string;
      "complement": string | null;
      "district": string;
      "city": string;
      "state": string;
      "isDefault": boolean;
      "createdAt": string;
      "updatedAt": string;
    };
    AddressList: {
      "data": Array<components["schemas"]["Address"]>;
    };
    ShippingOption: {
      "serviceId": string;
      "name": string;
      "carrier": string;
      "price": components["schemas"]["Money"];
      "deliveryDays": {
      "min": number;
      "max": number;
    };
    };
    ShippingQuote: {
      "id": string;
      "provider": string;
      "isSimulated": boolean;
      "postalCode": string;
      "expiresAt": string;
      "options": Array<components["schemas"]["ShippingOption"]>;
    };
    CheckoutSummary: {
      "items": Array<{
      "variantId": string;
      "productName": string;
      "size": string;
      "quantity": number;
      "unitPrice": components["schemas"]["Money"];
      "lineTotal": components["schemas"]["Money"];
    }>;
      "coupon": {
      "code": string;
      "discount": components["schemas"]["Money"];
    } | null;
      "shipping": {
      "serviceId": string;
      "name": string;
      "carrier": string;
      "price": components["schemas"]["Money"];
      "deliveryDays": {
      "min": number;
      "max": number;
    };
    };
      "totals": {
      "subtotal": components["schemas"]["Money"];
      "discount": components["schemas"]["Money"];
      "shipping": components["schemas"]["Money"];
      "total": components["schemas"]["Money"];
    };
      "reservationMinutes": number;
      "isDemo": boolean;
    };
    CheckoutResult: {
      "order": components["schemas"]["Order"];
      "payment": components["schemas"]["PaymentSession"] | null;
    };
    PaymentSession: {
      "provider": "mercado_pago";
      "environment": "sandbox" | "production";
      "checkoutUrl": string;
      "expiresAt": string;
    };
    OrderStatus: "pending_payment" | "paid" | "in_fulfillment" | "shipped" | "delivered" | "cancelled" | "expired" | "refunded";
    OrderItem: {
      "id": string;
      "productId": string;
      "productSlug": string;
      "productName": string;
      "variantId": string;
      "sku": string;
      "size": string;
      "color": string | null;
      "image": {
      "url": string;
      "alt": string;
    } | null;
      "unitPrice": components["schemas"]["Money"];
      "compareAtUnitPrice": components["schemas"]["Money"] | null;
      "quantity": number;
      "lineTotal": components["schemas"]["Money"];
      "isDemo": boolean;
    };
    OrderShippingAddress: {
      "recipientName": string;
      "recipientDocumentMasked": string;
      "recipientPhoneMasked": string;
      "postalCode": string;
      "street": string;
      "number": string;
      "complement": string | null;
      "district": string;
      "city": string;
      "state": string;
    };
    OrderTracking: {
      "status": string;
      "code": string | null;
      "carrier": string;
    };
    OrderPayment: {
      "provider": string;
      "environment": "sandbox" | "production";
      "status": string;
      "statusDetail": string | null;
      "updatedAt": string;
    };
    Order: {
      "id": string;
      "number": string;
      "status": components["schemas"]["OrderStatus"];
      "statusLabel": string;
      "isDemo": boolean;
      "items": Array<components["schemas"]["OrderItem"]>;
      "coupon": {
      "code": string;
      "discount": components["schemas"]["Money"];
    } | null;
      "shipping": {
      "provider": string;
      "serviceId": string;
      "name": string;
      "carrier": string;
      "price": components["schemas"]["Money"];
      "deliveryDays": {
      "min": number;
      "max": number;
    };
      "address": components["schemas"]["OrderShippingAddress"];
      "tracking": components["schemas"]["OrderTracking"] | null;
    };
      "totals": {
      "subtotal": components["schemas"]["Money"];
      "discount": components["schemas"]["Money"];
      "shipping": components["schemas"]["Money"];
      "total": components["schemas"]["Money"];
    };
      "payment": components["schemas"]["OrderPayment"] | null;
      "reservationExpiresAt": string;
      "canPay": boolean;
      "canCancel": boolean;
      "history": Array<{
      "status": components["schemas"]["OrderStatus"];
      "at": string;
    }>;
      "createdAt": string;
      "paidAt": string | null;
      "cancelledAt": string | null;
    };
    OrderSummary: {
      "id": string;
      "number": string;
      "status": components["schemas"]["OrderStatus"];
      "statusLabel": string;
      "itemCount": number;
      "total": components["schemas"]["Money"];
      "isDemo": boolean;
      "createdAt": string;
    };
    OrderList: {
      "data": Array<components["schemas"]["OrderSummary"]>;
      "pageInfo": components["schemas"]["PageInfo"];
    };
  };
}

export interface authRequests {
  register: {
      "email": string;
      "password": string;
      "name": string;
      "acceptTerms": true;
      "marketingEmailOptIn"?: boolean;
    };
  login: {
      "email": string;
      "password": string;
    };
  forgotPassword: {
      "email": string;
    };
  resetPassword: {
      "token": string;
      "password": string;
    };
  changePassword: {
      "currentPassword": string;
      "newPassword": string;
    };
}

export interface commerceRequests {
  addCartItem: {
      "variantId": string;
      "quantity"?: number;
    };
  updateCartItem: {
      "quantity": number;
    };
  importCart: {
      "items": Array<{
      "variantId": string;
      "quantity": number;
    }>;
    };
  applyCoupon: {
      "code": string;
    };
  importFavorites: {
      "productIds": Array<string>;
    };
  subscribeNewsletter: {
      "email": string;
      "consent": true;
      "source"?: "footer" | "home" | "landing_page" | "account";
    };
  confirmNewsletter: {
      "token": string;
    };
  unsubscribeNewsletter: {
      "token": string;
    };
}

export interface checkoutRequests {
  createAddress: {
      "label"?: string | null;
      "recipientName": string;
      "recipientDocument": string;
      "recipientPhone": string;
      "postalCode": string;
      "street": string;
      "number": string;
      "complement"?: string | null;
      "district": string;
      "city": string;
      "state": string;
      "isDefault"?: boolean;
    };
  updateAddress: {
      "label"?: string | null;
      "recipientName"?: string;
      "recipientDocument"?: string;
      "recipientPhone"?: string;
      "postalCode"?: string;
      "street"?: string;
      "number"?: string;
      "complement"?: string | null;
      "district"?: string;
      "city"?: string;
      "state"?: string;
      "isDefault"?: boolean;
    };
  quoteShipping: {
      "postalCode": string;
    };
  previewCheckout: {
      "addressId": string;
      "quoteId": string;
      "serviceId": string;
    };
  placeCheckout: {
      "addressId": string;
      "quoteId": string;
      "serviceId": string;
      "expectedTotal"?: components["schemas"]["MoneyInput"];
    };
}
