import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { Db } from "../../db/client.js";
import { errorResponseSchema } from "../../shared/errors.js";
import { protectAdminScope } from "../auth/auth.plugin.js";
import { auditLogListSchema, auditLogQuerySchema } from "./audit.contracts.js";
import { listAuditLogs } from "./audit.service.js";

export interface AuditRoutesOptions {
  db: Db;
}

/** Read-only access to the audit trail (permission `audit:read`). There is no write route. */
export const auditAdminRoutes: FastifyPluginAsyncZod<AuditRoutesOptions> = async (app, { db }) => {
  protectAdminScope(app, "audit:read");

  app.get(
    "/admin/audit-logs",
    {
      schema: {
        tags: ["admin-access"],
        summary: "Trilha de auditoria das operações administrativas (mais recentes primeiro)",
        security: [{ sessionCookie: [] }],
        querystring: auditLogQuerySchema,
        response: { 200: auditLogListSchema, 401: errorResponseSchema, 403: errorResponseSchema },
      },
    },
    async (request) => listAuditLogs(db, request.query),
  );
};
