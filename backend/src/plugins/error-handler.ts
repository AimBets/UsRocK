import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { hasZodFastifySchemaValidationErrors, isResponseSerializationError } from "fastify-type-provider-zod";
import { AppError, codeForStatus, defaultMessages, type ErrorCode, type ErrorDetail, type ErrorResponse } from "../shared/errors.js";

function send(reply: FastifyReply, request: FastifyRequest, statusCode: number, code: ErrorCode, message: string, details?: ErrorDetail[]) {
  const body: ErrorResponse = { error: { code, message, requestId: request.id, ...(details?.length ? { details } : {}) } };
  return reply.status(statusCode).type("application/json; charset=utf-8").send(body);
}

/** Converts `/items/0/quantity` + `body` into `body.items.0.quantity`. */
function fieldPath(context: string | undefined, instancePath: string): string {
  const segments = instancePath.split("/").filter(Boolean);
  return [context ?? "request", ...segments].join(".");
}

/**
 * Single error format for the whole API: `{ error: { code, message, requestId, details? } }`.
 * Internal messages, stack traces and driver errors are never returned to the client.
 */
export const errorHandlerPlugin = fp(
  (app: FastifyInstance) => {
    app.setErrorHandler((error: FastifyError, request, reply) => {
      if (hasZodFastifySchemaValidationErrors(error)) {
        const details = error.validation.map((issue) => ({
          path: fieldPath(error.validationContext, issue.instancePath),
          message: issue.message ?? "Valor inválido.",
          code: typeof issue.keyword === "string" ? issue.keyword : "invalid",
        }));
        return send(reply, request, 400, "VALIDATION_ERROR", defaultMessages.VALIDATION_ERROR, details);
      }

      if (error instanceof AppError) {
        if (error.statusCode >= 500) request.log.error({ err: error }, "application error");
        return send(reply, request, error.statusCode, error.code, error.message, error.details);
      }

      if (isResponseSerializationError(error)) {
        request.log.error({ err: error }, "response did not match its declared schema");
        return send(reply, request, 500, "INTERNAL_ERROR", defaultMessages.INTERNAL_ERROR);
      }

      const statusCode = typeof error.statusCode === "number" && error.statusCode >= 400 ? error.statusCode : 500;
      const code = codeForStatus(statusCode);
      if (statusCode >= 500) {
        request.log.error({ err: error }, "unhandled error");
      } else {
        request.log.info({ errCode: error.code, statusCode }, "request rejected");
      }
      return send(reply, request, statusCode, code, defaultMessages[code]);
    });

    app.setNotFoundHandler((request, reply) =>
      send(reply, request, 404, "NOT_FOUND", "Rota não encontrada."),
    );
  },
  { name: "usrock-error-handler" },
);
