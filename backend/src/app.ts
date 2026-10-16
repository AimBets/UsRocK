import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import cookie from "@fastify/cookie";
import Fastify, { LogController } from "fastify";
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from "fastify-type-provider-zod";
import type { Env } from "./config/env.js";
import { buildLoggerOptions, type LogDestination } from "./config/logger.js";
import type { Database } from "./db/client.js";
import { startJobScheduler } from "./jobs/jobs.js";
import { accessAdminRoutes } from "./modules/access/access.routes.js";
import { accountsRoutes } from "./modules/accounts/accounts.routes.js";
import { addressesRoutes } from "./modules/addresses/addresses.routes.js";
import { createDbSessionResolver } from "./modules/accounts/sessions.js";
import { auditAdminRoutes } from "./modules/audit/audit.routes.js";
import { authPlugin } from "./modules/auth/auth.plugin.js";
import type { SessionResolver } from "./modules/auth/auth.types.js";
import { cartRoutes } from "./modules/cart/cart.routes.js";
import { catalogRoutes } from "./modules/catalog/catalog.routes.js";
import { checkoutRoutes } from "./modules/checkout/checkout.routes.js";
import { favoritesRoutes } from "./modules/favorites/favorites.routes.js";
import { healthRoutes, type HealthCheck } from "./modules/health/health.routes.js";
import { createSmtpMailer, type Mailer } from "./modules/mail/mailer.js";
import { campaignRoutes, marketingAdminRoutes } from "./modules/marketing/marketing.routes.js";
import { newsletterRoutes } from "./modules/newsletter/newsletter.routes.js";
import { disabledWhatsAppSender, type WhatsAppSender } from "./modules/notifications/whatsapp.js";
import { ordersAdminRoutes } from "./modules/orders/orders.admin.routes.js";
import { createMercadoPagoGateway, type PaymentGateway } from "./modules/payments/mercadopago.client.js";
import { webhookRoutes } from "./modules/payments/webhooks.routes.js";
import type { ShippingProvider } from "./modules/shipping/shipping.provider.js";
import { createShippingProviderFromEnv, shippingSettingsFrom } from "./modules/shipping/shipping.service.js";
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
  /** Connection pool; opened lazily on first query. The caller owns its lifecycle. */
  database: Database;
  /** Dependency probes for GET /api/v1/health. Default: database ping. */
  healthChecks?: HealthCheck[];
  /** Default: sessions stored in PostgreSQL. */
  sessionResolver?: SessionResolver;
  /** Default: SMTP (Mailpit in development). */
  mailer?: Mailer;
  /** Overrides the log destination (tests capture log lines through it). */
  logStream?: LogDestination;
  /** Default: from MERCADO_PAGO_MODE (null when disabled). */
  paymentGateway?: PaymentGateway | null;
  /** Default: from SHIPPING_PROVIDER (null when disabled). */
  shippingProvider?: ShippingProvider | null;
  /** Default: disabled channel (no WhatsApp message is sent in this phase). */
  whatsapp?: WhatsAppSender;
}

function paymentGatewayFromEnv(env: Env): PaymentGateway | null {
  if (env.MERCADO_PAGO_MODE === "disabled") return null;
  return createMercadoPagoGateway({
    apiUrl: env.MERCADO_PAGO_API_URL,
    accessToken: env.MERCADO_PAGO_ACCESS_TOKEN!,
    environment: env.MERCADO_PAGO_MODE,
    ...(env.MERCADO_PAGO_NOTIFICATION_URL ? { notificationUrl: env.MERCADO_PAGO_NOTIFICATION_URL } : {}),
    statementDescriptor: env.MERCADO_PAGO_STATEMENT_DESCRIPTOR,
  });
}

/**
 * Reuses a well-formed X-Request-Id from the caller (e.g. the Next.js server) so a request
 * can be traced across services; anything else is replaced to prevent log injection.
 */
function generateRequestId(request: IncomingMessage): string {
  const header = request.headers[REQUEST_ID_HEADER];
  return typeof header === "string" && incomingRequestId.test(header) ? header : randomUUID();
}

export async function buildApp({ env, database, healthChecks, sessionResolver, mailer, logStream, ...deps }: AppDependencies) {
  const checks = healthChecks ?? [{ name: "database", check: () => database.ping() }];
  const mail = mailer ?? createSmtpMailer(env);
  const gateway = deps.paymentGateway === undefined ? paymentGatewayFromEnv(env) : deps.paymentGateway;
  const shippingProvider = deps.shippingProvider === undefined ? createShippingProviderFromEnv(env) : deps.shippingProvider;
  const shippingSettings = shippingSettingsFrom(env);
  const whatsapp = deps.whatsapp ?? disabledWhatsAppSender;
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
  await app.register(cookie);
  await app.register(authPlugin, { sessionResolver: sessionResolver ?? createDbSessionResolver(database.db, env) });

  await app.register(
    async (api) => {
      await api.register(healthRoutes, { checks, version: env.APP_VERSION });
      await api.register(catalogRoutes, { db: database.db });
      await api.register(accountsRoutes, { db: database.db, env, mailer: mail });
      await api.register(cartRoutes, { db: database.db, env });
      await api.register(favoritesRoutes, { db: database.db });
      await api.register(campaignRoutes, { db: database.db });
      await api.register(newsletterRoutes, { db: database.db, env, mailer: mail });
      await api.register(marketingAdminRoutes, { db: database.db });
      await api.register(addressesRoutes, { db: database.db });
      await api.register(checkoutRoutes, { db: database.db, env, gateway, shippingProvider, shippingSettings });
      await api.register(webhookRoutes, { db: database.db, env, gateway, shippingProvider });
      await api.register(ordersAdminRoutes, { db: database.db, env, shippingProvider, shippingSettings });
      await api.register(accessAdminRoutes, { db: database.db });
      await api.register(auditAdminRoutes, { db: database.db });
    },
    { prefix: API_PREFIX },
  );

  if (env.JOBS_ENABLED) {
    let stop: (() => void) | undefined;
    app.addHook("onReady", async () => {
      stop = startJobScheduler(
        { db: database.db, gateway, mailer: mail, whatsapp, log: app.log, appPublicUrl: env.APP_PUBLIC_URL },
        env.JOBS_INTERVAL_SECONDS,
      );
    });
    app.addHook("onClose", async () => stop?.());
  }

  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
