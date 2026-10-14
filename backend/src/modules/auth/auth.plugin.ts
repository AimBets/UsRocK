import type { FastifyInstance, preHandlerAsyncHookHandler } from "fastify";
import fp from "fastify-plugin";
import { errors } from "../../shared/errors.js";
import { hasPermission, type Permission, type Principal, type SessionResolver } from "./auth.types.js";

declare module "fastify" {
  interface FastifyRequest {
    /** Authenticated actor, or null for anonymous requests. Set before route handlers run. */
    principal: Principal | null;
  }
}

export interface AuthPluginOptions {
  sessionResolver: SessionResolver;
}

export const authPlugin = fp<AuthPluginOptions>(
  (app: FastifyInstance, { sessionResolver }) => {
    app.decorateRequest("principal", null);
    app.addHook("onRequest", async (request) => {
      request.principal = await sessionResolver.resolve(request);
    });
  },
  { name: "usrock-auth" },
);

/** Route guard: any authenticated user. */
export const requireAuth: preHandlerAsyncHookHandler = async (request) => {
  if (!request.principal) throw errors.unauthenticated();
};

/** Route guard: authenticated user holding `permission` through one of their roles. */
export function requirePermission(permission: Permission): preHandlerAsyncHookHandler {
  return async (request) => {
    if (!request.principal) throw errors.unauthenticated();
    if (!hasPermission(request.principal.roles, permission)) throw errors.forbidden();
  };
}
