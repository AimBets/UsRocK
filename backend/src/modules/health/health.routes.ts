import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

export interface HealthCheck {
  name: string;
  check(): Promise<void>;
}

export interface HealthRoutesOptions {
  checks: HealthCheck[];
  version: string;
  /** Per-check timeout; a dependency that hangs is reported as down instead of hanging the probe. */
  timeoutMs?: number;
}

const checkResultSchema = z.object({
  status: z.enum(["up", "down"]),
  latencyMs: z.number().int().min(0),
});

export const healthResponseSchema = z
  .object({
    status: z.enum(["ok", "degraded"]),
    version: z.string(),
    uptimeSeconds: z.number().int().min(0),
    timestamp: z.iso.datetime(),
    checks: z.record(z.string(), checkResultSchema),
  })
  .meta({ id: "HealthResponse" });

const liveResponseSchema = z.object({ status: z.literal("ok") }).meta({ id: "LivenessResponse" });

async function runCheck(check: HealthCheck, timeoutMs: number) {
  const started = performance.now();
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      check.check(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${check.name} health check timed out`)), timeoutMs);
      }),
    ]);
    return { status: "up" as const, latencyMs: Math.round(performance.now() - started), error: undefined };
  } catch (error) {
    return { status: "down" as const, latencyMs: Math.round(performance.now() - started), error };
  } finally {
    clearTimeout(timer);
  }
}

export const healthRoutes: FastifyPluginAsyncZod<HealthRoutesOptions> = async (app, { checks, version, timeoutMs = 2_000 }) => {
  app.get(
    "/health",
    {
      schema: {
        tags: ["system"],
        summary: "Prontidão do serviço e das dependências",
        description:
          "Retorna 200 quando todas as dependências respondem e 503 quando alguma está indisponível. " +
          "Detalhes internos de falha são registrados apenas nos logs.",
        response: { 200: healthResponseSchema, 503: healthResponseSchema },
      },
    },
    async (request, reply) => {
      const results = await Promise.all(checks.map(async (check) => [check, await runCheck(check, timeoutMs)] as const));

      const checksBody: Record<string, z.infer<typeof checkResultSchema>> = {};
      for (const [check, result] of results) {
        checksBody[check.name] = { status: result.status, latencyMs: result.latencyMs };
        if (result.status === "down") {
          request.log.warn({ check: check.name, err: result.error }, "health check failed");
        }
      }

      const healthy = results.every(([, result]) => result.status === "up");
      reply.header("cache-control", "no-store");
      return reply.status(healthy ? 200 : 503).send({
        status: healthy ? "ok" : "degraded",
        version,
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
        checks: checksBody,
      });
    },
  );

  app.get(
    "/health/live",
    {
      schema: {
        tags: ["system"],
        summary: "Processo ativo (sem verificar dependências)",
        response: { 200: liveResponseSchema },
      },
    },
    async (_request, reply) => {
      reply.header("cache-control", "no-store");
      return { status: "ok" as const };
    },
  );
};
