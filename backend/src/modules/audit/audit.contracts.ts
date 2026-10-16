import { z } from "zod";
import { paginatedResponseSchema, paginationQuerySchema } from "../../shared/pagination.js";
import { roles } from "../auth/auth.types.js";

/**
 * Audited administrative actions. New admin modules append to this list; the database column is
 * free text (format-checked) so adding an action never needs a migration.
 */
export const auditActions = [
  "coupon.create",
  "coupon.update",
  "campaign.create",
  "campaign.update",
  "order.transition",
  "order.shipment_create",
  "order.shipment_sync",
  "user.roles_update",
  "user.status_update",
] as const;
export type AuditAction = (typeof auditActions)[number];

export const auditResourceTypes = ["coupon", "campaign", "order", "user"] as const;
export type AuditResourceType = (typeof auditResourceTypes)[number];

export const auditLogQuerySchema = paginationQuerySchema
  .extend({
    action: z.enum(auditActions).optional(),
    resourceType: z.enum(auditResourceTypes).optional(),
    resourceId: z.string().trim().min(1).max(100).optional().describe("Combine com `resourceType` para o histórico de um registro."),
    actorUserId: z.uuid().optional(),
    from: z.iso.datetime().optional().describe("Início (inclusivo), ISO 8601."),
    to: z.iso.datetime().optional().describe("Fim (exclusivo), ISO 8601."),
  })
  .refine((query) => !query.from || !query.to || Date.parse(query.from) < Date.parse(query.to), { message: "`from` deve ser anterior a `to`.", path: ["from"] });

export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;

export const auditLogEntrySchema = z
  .object({
    id: z.uuid(),
    occurredAt: z.iso.datetime(),
    actor: z.object({
      userId: z.uuid().nullable().describe("null somente para ações do sistema."),
      name: z.string().nullable().describe("Nome atual da conta; null se ela não existir mais."),
      roles: z.array(z.enum(roles)).describe("Papéis no momento da ação."),
    }),
    action: z.enum(auditActions),
    resource: z.object({ type: z.enum(auditResourceTypes), id: z.string() }),
    changes: z
      .record(z.string(), z.object({ from: z.unknown(), to: z.unknown() }))
      .nullable()
      .describe("Campos alterados (`de` → `para`). Valores sensíveis aparecem como `[redacted]`."),
    metadata: z.record(z.string(), z.unknown()).nullable().describe("Contexto adicional (ex.: observação da transição)."),
    requestId: z.string().nullable().describe("Correlaciona com os logs do servidor."),
  })
  .meta({ id: "AuditLogEntry" });

export const auditLogListSchema = paginatedResponseSchema(auditLogEntrySchema).meta({ id: "AuditLogList" });

export type AuditLogEntry = z.infer<typeof auditLogEntrySchema>;
