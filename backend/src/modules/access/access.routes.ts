import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { Db } from "../../db/client.js";
import { errorResponseSchema } from "../../shared/errors.js";
import { auditActorFrom } from "../audit/audit.service.js";
import { protectAdminScope } from "../auth/auth.plugin.js";
import { permissions, rolePermissions, roles } from "../auth/auth.types.js";
import {
  adminUserListQuerySchema,
  adminUserListSchema,
  adminUserSchema,
  permissionInfo,
  roleCatalogSchema,
  roleInfo,
  updateRolesBodySchema,
  updateStatusBodySchema,
  userIdParamsSchema,
} from "./access.contracts.js";
import { listAdminUsers, updateUserRoles, updateUserStatus } from "./access.service.js";

export interface AccessRoutesOptions {
  db: Db;
}

const sessionSecurity = [{ sessionCookie: [] }];
const adminErrors = { 401: errorResponseSchema, 403: errorResponseSchema };
const changeErrors = { ...adminErrors, 404: errorResponseSchema, 409: errorResponseSchema };

/** Team access management (permission `users:manage`). Every change is written to the audit trail. */
export const accessAdminRoutes: FastifyPluginAsyncZod<AccessRoutesOptions> = async (app, { db }) => {
  protectAdminScope(app, "users:manage");

  app.get(
    "/admin/roles",
    {
      schema: {
        tags: ["admin-access"],
        summary: "Papéis disponíveis e as permissões de cada um",
        security: sessionSecurity,
        response: { 200: roleCatalogSchema, ...adminErrors },
      },
    },
    async () => ({
      roles: roles.map((role) => ({ role, ...roleInfo[role], permissions: [...rolePermissions[role]] })),
      permissions: permissions.map((permission) => ({ permission, description: permissionInfo[permission] })),
    }),
  );

  app.get(
    "/admin/users",
    {
      schema: {
        tags: ["admin-access"],
        summary: "Lista a equipe ou localiza uma conta pelo e-mail exato",
        description: "Sem `email`: somente contas com papel administrativo. Com `email`: qualquer conta (para conceder acesso).",
        security: sessionSecurity,
        querystring: adminUserListQuerySchema,
        response: { 200: adminUserListSchema, ...adminErrors },
      },
    },
    async (request) => listAdminUsers(db, request.query),
  );

  app.put(
    "/admin/users/:id/roles",
    {
      schema: {
        tags: ["admin-access"],
        summary: "Define os papéis de uma conta",
        description:
          "Recusas (`409`, em `details[0].code`): `cannot_modify_self`, `last_admin`. `403` quando o operador não possui " +
          "todas as permissões envolvidas. Sem alteração efetiva, nada é registrado.",
        security: sessionSecurity,
        params: userIdParamsSchema,
        body: updateRolesBodySchema,
        response: { 200: adminUserSchema, ...changeErrors },
      },
    },
    async (request) => updateUserRoles(db, auditActorFrom(request), request.params.id, request.body.roles),
  );

  app.patch(
    "/admin/users/:id/status",
    {
      schema: {
        tags: ["admin-access"],
        summary: "Ativa ou bloqueia uma conta",
        description: "Bloquear encerra todas as sessões da conta. Recusas: `cannot_modify_self`, `last_admin`.",
        security: sessionSecurity,
        params: userIdParamsSchema,
        body: updateStatusBodySchema,
        response: { 200: adminUserSchema, ...changeErrors },
      },
    },
    async (request) => updateUserStatus(db, auditActorFrom(request), request.params.id, request.body.status),
  );
};
