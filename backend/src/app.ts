import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import Fastify, { LogController } from "fastify";
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from "fastify-type-provider-zod";
import type { Env } from "./config/env.js";
import { buildLoggerOptions, type LogDestination } from "./config/logger.js";
import { authPlugin } from "./modules/auth/auth.plugin.js";
import { anonymousSessionResolver, type SessionResolver } from "./modules/auth/auth.types.js";
import { healthRoutes, type HealthCheck } from "./modules/health/health.routes.js";
import { errorHandlerPlugin } from "./plugins/error-handler.js";
import { openApiPlugin } from "./plugins/openapi.js";
import { securityPlugin } from "./plugins/security.js";
import { errorResponseSchema } from "./shared/errors.js";

export const API_PREFIX = "/api/v1";
export const REQUEST_ID_HEADER = "x-request-id";

const BODY_LIMIT_BYTES = 1024 * 1024;
const incomingRequestId = /^[A-Za-z0-9._:-]{8,128}$/;

export interface AppDependencies {
  env: Env;
  /** Dependency probes exposed by GET /api/v1/health (e.g. the database ping). */
  healthChecks?: HealthCheck[];
  sessionResolver?: SessionResolver;
  /** Overrides the log destination (tests capture log lines through it). */
  logStream?: LogDestination;
}

/**
 * Reuses a well-formed X-Request-Id from the caller (e.g. the Next.js server) so a request
 * can be traced across services; anything else is replaced to prevent log injection.
 */
function generateRequestId(request: IncomingMessage): string {
  const header = request.headers[REQUEST_ID_HEADER];
  return typeof header === "string" && incomingRequestId.test(header) ? header : randomUUID();
}

export async function buildApp({ env, healthChecks = [], sessionResolver = anonymousSessionResolver, logStream }: AppDependencies) {
  const app = Fastify({
    logger: buildLoggerOptions(env, logStream),
    genReqId: generateRequestId,
    logController: new LogController({ requestIdLogLabel: "requestId" }),
    trustProxy: env.TRUST_PROXY,
    bodyLimit: BODY_LIMIT_BYTES,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // JSON-only API: without a text/plain parser, cross-site "simple" form posts get 415.
  app.removeContentTypeParser("text/plain");

  app.addHook("onRequest", async (request, reply) => {
    reply.header(REQUEST_ID_HEADER, request.id);
  });

  // Every documented route advertises the shared error envelope for failures it can always produce.
  app.addHook("onRoute", (route) => {
    const schema = route.schema;
    if (!schema?.response || schema.hide) return;
    const hasInput = Boolean(schema.body ?? schema.querystring ?? schema.params);
    schema.response = {
      ...(hasInput ? { 400: errorResponseSchema } : {}),
      429: errorResponseSchema,
      500: errorResponseSchema,
      ...(schema.response as Record<number, unknown>),
    };
  });

  await app.register(errorHandlerPlugin);
  await app.register(securityPlugin, { env });
  await app.register(openApiPlugin, { env });
  await app.register(authPlugin, { sessionResolver });

  await app.register(
    async (api) => {
      await api.register(healthRoutes, { checks: healthChecks, version: env.APP_VERSION });
      // Business modules (catalog, cart, orders, ...) are registered here in later phases.
    },
    { prefix: API_PREFIX },
  );

  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
