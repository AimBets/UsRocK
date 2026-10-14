// Gerado por npm run openapi:generate. Não edite manualmente.
export interface components {
  schemas: {
    Availability: "in_stock" | "low_stock" | "out_of_stock";
    Money: {
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
