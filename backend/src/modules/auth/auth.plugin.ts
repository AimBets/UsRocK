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
    if (!hasPermission(request.principal.roles, permission)) {
      // Signed-in users probing privileged routes are worth noticing; the id is not personal data.
      request.log.warn({ actorId: request.principal.userId, permission, route: request.routeOptions.url }, "permission denied");
      throw errors.forbidden();
    }
  };
}

/**
 * Standard protection for an admin plugin scope: the permission check runs before body/query
 * validation (anonymous callers get 401, never a 400 that reveals the schema) and responses are
 * never cached. Call it at the top of an encapsulated plugin so it covers only that plugin.
 */
export function protectAdminScope(app: Pick<FastifyInstance, "addHook">, permission: Permission): void {
  app.addHook("preValidation", requirePermission(permission));
  app.addHook("onSend", async (_request, reply) => {
    reply.header("cache-control", "no-store");
  });
}
