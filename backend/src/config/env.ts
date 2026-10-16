import { z } from "zod";

const booleanString = z
  .enum(["true", "false", "1", "0"])
  .transform((value) => value === "true" || value === "1");

const postgresUrl = z.url({ protocol: /^postgres(ql)?$/, error: "deve ser uma URL postgres:// válida" });

const httpUrl = z.url({ protocol: /^https?$/, error: "deve ser uma URL http(s) válida" }).transform((url) => url.replace(/\/+$/, ""));

const postalCode = z
  .string()
  .transform((value) => value.replace(/\D/g, ""))
  .pipe(z.string().regex(/^\d{8}$/, "CEP deve ter 8 dígitos"));

const optionalText = (max: number) => z.string().trim().min(1).max(max).optional();

const originList = z
  .string()
  .default("")
  .transform((value) => value.split(",").map((origin) => origin.trim()).filter(Boolean))
  .pipe(z.array(z.url({ protocol: /^https?$/, error: "cada origem deve ser uma URL http(s) válida" })))
  .transform((origins) => origins.map((origin) => new URL(origin).origin));

export const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    HOST: z.string().min(1).default("127.0.0.1"),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3333),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
    APP_VERSION: z.string().min(1).max(64).default("development"),
    DATABASE_URL: postgresUrl,
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
    CORS_ORIGINS: originList,
    TRUST_PROXY: booleanString.default(false),
    RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(300),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1_000).default(60_000),
    API_DOCS_ENABLED: booleanString.optional(),
    /** Public storefront origin, used to build links in emails (e.g. password reset). */
    APP_PUBLIC_URL: z.url({ protocol: /^https?$/ }).default("http://localhost:3000").transform((url) => new URL(url).origin),
    SESSION_COOKIE_SECURE: booleanString.optional(),
    SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
    SESSION_IDLE_DAYS: z.coerce.number().int().min(1).max(90).default(14),
    /** Requests per 15 minutes per IP on sensitive auth routes (login, register, password reset). */
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(10),
    /** Version identifier of the terms/privacy texts the user accepts at sign-up. */
    LEGAL_POLICY_VERSION: z.string().min(1).max(64).default("rascunho-2026-10"),
    /** Guest carts expire after this many days without changes (sliding). */
    CART_GUEST_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
    SMTP_HOST: z.string().min(1).default("127.0.0.1"),
    SMTP_PORT: z.coerce.number().int().min(1).max(65_535).default(1025),
    SMTP_SECURE: booleanString.default(false),
    SMTP_USER: z.string().min(1).optional(),
    SMTP_PASSWORD: z.string().min(1).optional(),
    MAIL_FROM: z.string().min(3).max(200).default("UsRock <nao-responda@usrock.local>"),

    // --- Checkout (E5) ---
    /** Minutes a pending order holds its stock before it expires and the stock is released. */
    CHECKOUT_RESERVATION_MINUTES: z.coerce.number().int().min(10).max(1_440).default(30),
    /** In-process background jobs (reservation expiry, email outbox). Default: on, except in tests. */
    JOBS_ENABLED: booleanString.optional(),
    JOBS_INTERVAL_SECONDS: z.coerce.number().int().min(5).max(3_600).default(60),

    // --- Mercado Pago (Checkout Pro) ---
    /** disabled: no payment provider; sandbox: test credentials; production: real charges (production only). */
    MERCADO_PAGO_MODE: z.enum(["disabled", "sandbox", "production"]).default("disabled"),
    MERCADO_PAGO_ACCESS_TOKEN: z.string().min(10).optional(),
    MERCADO_PAGO_WEBHOOK_SECRET: z.string().min(10).optional(),
    MERCADO_PAGO_API_URL: httpUrl.default("https://api.mercadopago.com"),
    /** Public https URL of POST /api/v1/webhooks/mercadopago. Without it, the URL configured in the MP panel is used. */
    MERCADO_PAGO_NOTIFICATION_URL: z.url({ protocol: /^https$/ }).optional(),
    MERCADO_PAGO_STATEMENT_DESCRIPTOR: z.string().regex(/^[A-Za-z0-9 ]{1,13}$/).default("USROCK"),

    // --- Frete (SuperFrete) ---
    /** disabled: no quotes; fixture: fixed local table for development (never production); superfrete: real API. */
    SHIPPING_PROVIDER: z.enum(["disabled", "fixture", "superfrete"]).default("disabled"),
    SUPERFRETE_ENV: z.enum(["sandbox", "production"]).default("sandbox"),
    SUPERFRETE_API_TOKEN: z.string().min(10).optional(),
    /** Overrides the base URL derived from SUPERFRETE_ENV (tests point it at a local fake). */
    SUPERFRETE_API_URL: httpUrl.optional(),
    /** Contact e-mail required by SuperFrete in the User-Agent header. */
    SUPERFRETE_CONTACT_EMAIL: z.email().optional(),
    SUPERFRETE_WEBHOOK_SECRET: z.string().min(10).optional(),
    /** SuperFrete service ids offered at checkout: 1 PAC, 2 SEDEX, 17 Mini Envios, 3 Jadlog, 31 Loggi. */
    SUPERFRETE_SERVICES: z
      .string()
      .default("1,2,17")
      .transform((value) => value.split(",").map((item) => item.trim()).filter(Boolean))
      .pipe(z.array(z.string().regex(/^\d{1,3}$/)).min(1)),
    SHIPPING_ORIGIN_POSTAL_CODE: postalCode.optional(),
    SHIPPING_QUOTE_TTL_MINUTES: z.coerce.number().int().min(5).max(240).default(30),
    /** Freight quotes per 15 minutes per IP (each one calls the carrier API). */
    SHIPPING_QUOTE_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(30),
    /** Fallback package per item when a variant has no shipping dimensions (folded t-shirt). */
    SHIPPING_DEFAULT_WEIGHT_GRAMS: z.coerce.number().int().min(1).max(30_000).default(300),
    SHIPPING_DEFAULT_HEIGHT_CM: z.coerce.number().int().min(1).max(100).default(4),
    SHIPPING_DEFAULT_WIDTH_CM: z.coerce.number().int().min(1).max(100).default(20),
    SHIPPING_DEFAULT_LENGTH_CM: z.coerce.number().int().min(1).max(100).default(28),
    /** Sender printed on labels (required only to create labels). */
    SHIPPING_SENDER_NAME: optionalText(120),
    SHIPPING_SENDER_STREET: optionalText(200),
    SHIPPING_SENDER_NUMBER: optionalText(20),
    SHIPPING_SENDER_COMPLEMENT: optionalText(100),
    SHIPPING_SENDER_DISTRICT: optionalText(100),
    SHIPPING_SENDER_CITY: optionalText(100),
    SHIPPING_SENDER_STATE: z.string().regex(/^[A-Z]{2}$/).optional(),
    SHIPPING_SENDER_DOCUMENT: z.string().regex(/^\d{11}$|^\d{14}$/).optional(),

    // --- WhatsApp (estrutura apenas; nenhum disparo nesta fase) ---
    WHATSAPP_MODE: z.enum(["disabled"]).default("disabled"),
  })
  .superRefine((env, ctx) => {
    if (env.MERCADO_PAGO_MODE !== "disabled") {
      for (const key of ["MERCADO_PAGO_ACCESS_TOKEN", "MERCADO_PAGO_WEBHOOK_SECRET"] as const) {
        if (!env[key]) ctx.addIssue({ code: "custom", path: [key], message: "obrigatória quando MERCADO_PAGO_MODE não é disabled" });
      }
    }
    if (env.MERCADO_PAGO_MODE === "production" && env.NODE_ENV !== "production") {
      ctx.addIssue({ code: "custom", path: ["MERCADO_PAGO_MODE"], message: "production só é permitido com NODE_ENV=production" });
    }
    if (env.SHIPPING_PROVIDER === "superfrete") {
      for (const key of ["SUPERFRETE_API_TOKEN", "SUPERFRETE_CONTACT_EMAIL", "SHIPPING_ORIGIN_POSTAL_CODE"] as const) {
        if (!env[key]) ctx.addIssue({ code: "custom", path: [key], message: "obrigatória quando SHIPPING_PROVIDER=superfrete" });
      }
    }
    if (env.SUPERFRETE_ENV === "production" && env.NODE_ENV !== "production") {
      ctx.addIssue({ code: "custom", path: ["SUPERFRETE_ENV"], message: "production só é permitido com NODE_ENV=production" });
    }
  })
  .superRefine((env, ctx) => {
    if ((env.SMTP_USER === undefined) !== (env.SMTP_PASSWORD === undefined)) {
      ctx.addIssue({ code: "custom", path: ["SMTP_PASSWORD"], message: "SMTP_USER e SMTP_PASSWORD devem ser definidos juntos" });
    }
    if (env.SESSION_IDLE_DAYS > env.SESSION_TTL_DAYS) {
      ctx.addIssue({ code: "custom", path: ["SESSION_IDLE_DAYS"], message: "não pode exceder SESSION_TTL_DAYS" });
    }
    if (env.NODE_ENV !== "production") return;
    if (!env.APP_PUBLIC_URL.startsWith("https://")) {
      ctx.addIssue({ code: "custom", path: ["APP_PUBLIC_URL"], message: "em produção, deve usar https" });
    }
    if (env.SESSION_COOKIE_SECURE === false) {
      ctx.addIssue({ code: "custom", path: ["SESSION_COOKIE_SECURE"], message: "não pode ser false em produção" });
    }
    for (const origin of env.CORS_ORIGINS) {
      if (!origin.startsWith("https://")) {
        ctx.addIssue({ code: "custom", path: ["CORS_ORIGINS"], message: "em produção, apenas origens https são aceitas" });
      }
    }
    if (env.LOG_LEVEL === "trace" || env.LOG_LEVEL === "debug") {
      ctx.addIssue({ code: "custom", path: ["LOG_LEVEL"], message: "debug/trace não são permitidos em produção" });
    }
    if (env.SHIPPING_PROVIDER === "fixture") {
      ctx.addIssue({ code: "custom", path: ["SHIPPING_PROVIDER"], message: "fixture é apenas para desenvolvimento" });
    }
  })
  .transform(({ API_DOCS_ENABLED, SESSION_COOKIE_SECURE, JOBS_ENABLED, ...env }) => ({
    ...env,
    API_DOCS_ENABLED: API_DOCS_ENABLED ?? env.NODE_ENV !== "production",
    SESSION_COOKIE_SECURE: SESSION_COOKIE_SECURE ?? env.NODE_ENV === "production",
    JOBS_ENABLED: JOBS_ENABLED ?? env.NODE_ENV !== "test",
  }));

export type Env = z.infer<typeof envSchema>;

export class EnvValidationError extends Error {
  constructor(readonly issues: { variable: string; message: string }[]) {
    super(
      `Configuração de ambiente inválida:\n${issues.map((issue) => `  - ${issue.variable}: ${issue.message}`).join("\n")}`,
    );
    this.name = "EnvValidationError";
  }
}

/**
 * Validates configuration. Error messages name the variable but never echo its value,
 * so secrets cannot leak into logs when a deployment is misconfigured.
 */
export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = envSchema.safeParse(source);
  if (result.success) return result.data;

  throw new EnvValidationError(
    result.error.issues.map((issue) => {
      const variable = issue.path.map(String).join(".") || "(raiz)";
      const missing = issue.path.length === 1 && (source[variable] === undefined || source[variable] === "");
      return { variable, message: missing ? "obrigatória" : issue.message };
    }),
  );
}
