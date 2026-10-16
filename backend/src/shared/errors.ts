import { z } from "zod";

/** Stable, machine-readable error codes. The frontend should branch on `code`, never on `message`. */
export const errorCodes = [
  "BAD_REQUEST",
  "VALIDATION_ERROR",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "METHOD_NOT_ALLOWED",
  "CONFLICT",
  "PRECONDITION_FAILED",
  "PAYLOAD_TOO_LARGE",
  "UNSUPPORTED_MEDIA_TYPE",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
  "SERVICE_UNAVAILABLE",
] as const;

export type ErrorCode = (typeof errorCodes)[number];

export const errorDetailSchema = z
  .object({
    path: z.string().describe("Local do campo, ex.: `body.items.0.quantity`."),
    message: z.string(),
    code: z.string().describe("Código do problema de validação (ex.: `too_small`, `invalid_type`)."),
  })
  .meta({ id: "ErrorDetail" });

export const errorResponseSchema = z
  .object({
    error: z.object({
      code: z.enum(errorCodes),
      message: z.string().describe("Mensagem segura para exibição; não contém dados internos."),
      requestId: z.string().describe("Mesmo valor do cabeçalho `X-Request-Id`; informe ao suporte."),
      details: z.array(errorDetailSchema).optional(),
    }),
  })
  .meta({ id: "ErrorResponse" });

export type ErrorDetail = z.infer<typeof errorDetailSchema>;
export type ErrorResponse = z.infer<typeof errorResponseSchema>;

export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: ErrorDetail[],
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const errors = {
  badRequest: (message = "Requisição inválida.") => new AppError(400, "BAD_REQUEST", message),
  validation: (details: ErrorDetail[], message = "Dados inválidos.") =>
    new AppError(400, "VALIDATION_ERROR", message, details),
  unauthenticated: (message = "Autenticação necessária.") => new AppError(401, "UNAUTHENTICATED", message),
  forbidden: (message = "Acesso não permitido.") => new AppError(403, "FORBIDDEN", message),
  notFound: (message = "Recurso não encontrado.") => new AppError(404, "NOT_FOUND", message),
  /** `details` carries a stable business reason (e.g. `insufficient_stock`) for the UI to branch on. */
  conflict: (message = "Conflito com o estado atual do recurso.", details?: ErrorDetail[]) =>
    new AppError(409, "CONFLICT", message, details),
  preconditionFailed: (message = "O recurso foi alterado por outra requisição.") =>
    new AppError(412, "PRECONDITION_FAILED", message),
  rateLimited: (message = "Muitas requisições. Tente novamente em instantes.") =>
    new AppError(429, "RATE_LIMITED", message),
  /** External dependency (payment, freight) unavailable; `details` names which one. */
  serviceUnavailable: (message = "Serviço temporariamente indisponível.", details?: ErrorDetail[]) =>
    new AppError(503, "SERVICE_UNAVAILABLE", message, details),
};

/** Safe default message per code, used when an error originates outside our own code. */
export const defaultMessages: Record<ErrorCode, string> = {
  BAD_REQUEST: "Requisição inválida.",
  VALIDATION_ERROR: "Dados inválidos.",
  UNAUTHENTICATED: "Autenticação necessária.",
  FORBIDDEN: "Acesso não permitido.",
  NOT_FOUND: "Recurso não encontrado.",
  METHOD_NOT_ALLOWED: "Método não permitido.",
  CONFLICT: "Conflito com o estado atual do recurso.",
  PRECONDITION_FAILED: "O recurso foi alterado por outra requisição.",
  PAYLOAD_TOO_LARGE: "Conteúdo da requisição excede o limite permitido.",
  UNSUPPORTED_MEDIA_TYPE: "Tipo de conteúdo não suportado. Use application/json.",
  RATE_LIMITED: "Muitas requisições. Tente novamente em instantes.",
  INTERNAL_ERROR: "Erro interno. Tente novamente mais tarde.",
  SERVICE_UNAVAILABLE: "Serviço temporariamente indisponível.",
};

export function codeForStatus(statusCode: number): ErrorCode {
  switch (statusCode) {
    case 400: return "BAD_REQUEST";
    case 401: return "UNAUTHENTICATED";
    case 403: return "FORBIDDEN";
    case 404: return "NOT_FOUND";
    case 405: return "METHOD_NOT_ALLOWED";
    case 409: return "CONFLICT";
    case 412: return "PRECONDITION_FAILED";
    case 413: return "PAYLOAD_TOO_LARGE";
    case 415: return "UNSUPPORTED_MEDIA_TYPE";
    case 429: return "RATE_LIMITED";
    case 503: return "SERVICE_UNAVAILABLE";
    default: return statusCode >= 500 ? "INTERNAL_ERROR" : "BAD_REQUEST";
  }
}
