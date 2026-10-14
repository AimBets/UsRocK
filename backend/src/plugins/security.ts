import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import type { Env } from "../config/env.js";
import { errors } from "../shared/errors.js";

const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export interface SecurityOptions {
  env: Env;
}

/**
 * HTTP hardening shared by every route: security headers, CORS allowlist, global rate limit
 * and an Origin check for state-changing requests (CSRF defence in depth, see API_CONTRACTS).
 */
export const securityPlugin = fp<SecurityOptions>(
  async (app: FastifyInstance, { env }) => {
    const allowedOrigins = new Set(env.CORS_ORIGINS);

    await app.register(helmet, {
      // The API serves JSON only; the strict CSP is relaxed solely for the dev Swagger UI (see openapi plugin).
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      crossOriginResourcePolicy: { policy: "same-site" },
      hsts: env.NODE_ENV === "production" ? { maxAge: 31_536_000, includeSubDomains: true } : false,
    });

    await app.register(cors, {
      origin: (origin, callback) => callback(null, origin === undefined || allowedOrigins.has(origin)),
      credentials: true,
      methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Idempotency-Key", "If-Match", "X-Request-Id"],
      exposedHeaders: ["X-Request-Id", "ETag", "Retry-After"],
      maxAge: 600,
    });

    await app.register(rateLimit, {
      global: true,
      max: env.RATE_LIMIT_MAX,
      timeWindow: env.RATE_LIMIT_WINDOW_MS,
      // In-memory store: correct for a single instance. A shared store is required before scaling out.
      errorResponseBuilder: () => errors.rateLimited(),
    });

    // Browsers always send Origin on cross-site unsafe requests. Rejecting unknown origins blocks
    // CSRF via simple forms (e.g. text/plain) once cookie sessions exist. Server-to-server callers
    // such as payment webhooks send no Origin and are authenticated by signature instead.
    app.addHook("onRequest", async (request) => {
      if (!unsafeMethods.has(request.method)) return;
      const origin = request.headers.origin;
      if (origin !== undefined && !allowedOrigins.has(origin)) {
        throw errors.forbidden("Origem da requisição não autorizada.");
      }
    });
  },
  { name: "usrock-security" },
);
