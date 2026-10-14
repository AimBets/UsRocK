import { z } from "zod";

const booleanString = z
  .enum(["true", "false", "1", "0"])
  .transform((value) => value === "true" || value === "1");

const postgresUrl = z.url({ protocol: /^postgres(ql)?$/, error: "deve ser uma URL postgres:// válida" });

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
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== "production") return;
    for (const origin of env.CORS_ORIGINS) {
      if (!origin.startsWith("https://")) {
        ctx.addIssue({ code: "custom", path: ["CORS_ORIGINS"], message: "em produção, apenas origens https são aceitas" });
      }
    }
    if (env.LOG_LEVEL === "trace" || env.LOG_LEVEL === "debug") {
      ctx.addIssue({ code: "custom", path: ["LOG_LEVEL"], message: "debug/trace não são permitidos em produção" });
    }
  })
  .transform(({ API_DOCS_ENABLED, ...env }) => ({
    ...env,
    API_DOCS_ENABLED: API_DOCS_ENABLED ?? env.NODE_ENV !== "production",
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
