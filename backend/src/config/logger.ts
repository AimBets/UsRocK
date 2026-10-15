import type { FastifyServerOptions } from "fastify";
import type { Env } from "./env.js";

/** Minimal pino destination; used by tests to capture log lines. */
export interface LogDestination {
  write(line: string): void;
}

export const REDACTED = "[REDACTED]";

/** Keys that may carry credentials or personal data (LGPD) and must never reach the logs. */
const sensitiveKeys = [
  "password",
  "passwordHash",
  "newPassword",
  "currentPassword",
  "token",
  "accessToken",
  "refreshToken",
  "sessionToken",
  "secret",
  "apiKey",
  "authorization",
  "cookie",
  "email",
  "phone",
  "cpf",
  "document",
  "birthDate",
  "address",
  "shippingAddress",
  "postalCode",
  "recipientName",
  "recipientDocument",
  "recipientPhone",
  "street",
  "cardNumber",
  "securityCode",
  "cvv",
];

export const redactPaths = [
  "req.headers.authorization",
  "req.headers.cookie",
  'req.headers["x-api-key"]',
  'res.headers["set-cookie"]',
  ...sensitiveKeys,
  ...sensitiveKeys.map((key) => `*.${key}`),
  ...sensitiveKeys.map((key) => `*.*.${key}`),
];

/** Query strings can carry emails, tokens or CEPs; only the path is logged. */
function pathOnly(url: string): string {
  const index = url.indexOf("?");
  return index === -1 ? url : url.slice(0, index);
}

export function buildLoggerOptions(env: Env, stream?: LogDestination): FastifyServerOptions["logger"] {
  const pretty = env.NODE_ENV === "development" && !stream;
  return {
    level: env.LOG_LEVEL,
    redact: { paths: redactPaths, censor: REDACTED },
    base: { service: "usrock-backend", env: env.NODE_ENV, version: env.APP_VERSION },
    serializers: {
      // IP address and user agent are deliberately not logged (personal data). Request bodies are never logged.
      req: (request: { method: string; url: string }) => ({ method: request.method, path: pathOnly(request.url) }),
      res: (reply: { statusCode: number }) => ({ statusCode: reply.statusCode }),
    },
    ...(stream ? { stream } : {}),
    ...(pretty ? { transport: { target: "pino-pretty", options: { translateTime: "SYS:HH:MM:ss", ignore: "pid,hostname,service,env,version" } } } : {}),
  };
}
