import type { FastifyRequest } from "fastify";

/** Opaque, httpOnly session cookie. Issued by the accounts module (E3). */
export const SESSION_COOKIE_NAME = "usrock_session";

export const roles = ["customer", "operator", "content_editor", "admin"] as const;
export type Role = (typeof roles)[number];

/**
 * Administrative permissions. Customers act only on their own resources (cart, orders,
 * profile), which is enforced by ownership checks in each module, not by this list.
 */
export const permissions = [
  "catalog:manage",
  "inventory:manage",
  "orders:manage",
  "customers:read",
  "campaigns:manage",
  "landing_pages:edit",
  "landing_pages:publish",
  "media:upload",
  "users:manage",
  "audit:read",
] as const;
export type Permission = (typeof permissions)[number];

export const rolePermissions: Record<Role, readonly Permission[]> = {
  customer: [],
  operator: ["catalog:manage", "inventory:manage", "orders:manage", "customers:read", "campaigns:manage", "media:upload"],
  content_editor: ["landing_pages:edit", "media:upload"],
  admin: permissions,
};

export function hasPermission(principalRoles: readonly Role[], permission: Permission): boolean {
  return principalRoles.some((role) => rolePermissions[role].includes(permission));
}

/** The authenticated actor for the current request. */
export interface Principal {
  userId: string;
  sessionId: string;
  roles: readonly Role[];
}

/**
 * Resolves the session cookie into a Principal. The accounts module provides the implementation
 * backed by hashed session tokens in PostgreSQL (see accounts/sessions.ts).
 */
export interface SessionResolver {
  resolve(request: FastifyRequest): Promise<Principal | null>;
}
