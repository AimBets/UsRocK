import { z } from "zod";
import { paginatedResponseSchema, paginationQuerySchema } from "../../shared/pagination.js";
import { emailSchema } from "../accounts/accounts.contracts.js";
import { permissions, roles, type Permission, type Role } from "../auth/auth.types.js";

export const userStatuses = ["active", "disabled"] as const;

/** Roles that grant access to the admin panel (everything except `customer`). */
export const staffRoles = roles.filter((role): role is Exclude<Role, "customer"> => role !== "customer");

export const roleInfo: Record<Role, { label: string; description: string }> = {
  customer: { label: "Cliente", description: "Compra na loja e gerencia somente os próprios dados." },
  operator: { label: "Operação", description: "Catálogo, estoque, pedidos, clientes (leitura), cupons e campanhas." },
  content_editor: { label: "Conteúdo", description: "Edita landing pages e envia mídia; não publica." },
  admin: { label: "Administração", description: "Acesso total, inclusive equipe, permissões e auditoria." },
};

export const permissionInfo: Record<Permission, string> = {
  "catalog:manage": "Produtos, variantes, categorias, coleções, preços e imagens.",
  "inventory:manage": "Ajustes e histórico de estoque.",
  "orders:manage": "Pedidos, expedição, cancelamentos e histórico.",
  "customers:read": "Consulta de clientes e seus pedidos.",
  "campaigns:manage": "Cupons, campanhas, banners e newsletter.",
  "landing_pages:edit": "Criação e edição de landing pages.",
  "landing_pages:publish": "Publicação e agendamento de landing pages.",
  "media:upload": "Envio de imagens e arquivos.",
  "users:manage": "Equipe, papéis e bloqueio de contas.",
  "audit:read": "Consulta da trilha de auditoria.",
};

export const roleCatalogSchema = z
  .object({
    roles: z.array(
      z.object({
        role: z.enum(roles),
        label: z.string(),
        description: z.string(),
        permissions: z.array(z.enum(permissions)),
      }),
    ),
    permissions: z.array(z.object({ permission: z.enum(permissions), description: z.string() })),
  })
  .meta({ id: "RoleCatalog" });

export const adminUserSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    email: z.string(),
    roles: z.array(z.enum(roles)),
    permissions: z.array(z.enum(permissions)).describe("Permissões efetivas derivadas dos papéis."),
    status: z.enum(userStatuses),
    lastLoginAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: "AdminUser" });

export const adminUserListSchema = paginatedResponseSchema(adminUserSchema).meta({ id: "AdminUserList" });

export const adminUserListQuerySchema = paginationQuerySchema.extend({
  email: emailSchema
    .optional()
    .describe("E-mail exato. Com este filtro a busca inclui clientes (para conceder acesso); sem ele, lista apenas a equipe."),
  role: z.enum(roles).optional(),
  status: z.enum(userStatuses).optional(),
});

export const userIdParamsSchema = z.object({ id: z.uuid() });

export const updateRolesBodySchema = z.object({
  roles: z
    .array(z.enum(roles))
    .min(1)
    .max(roles.length)
    .transform((list) => roles.filter((role) => list.includes(role)))
    .describe("Conjunto completo de papéis (substitui o atual). Repetições são ignoradas."),
});

export const updateStatusBodySchema = z.object({
  status: z.enum(userStatuses).describe("`disabled` bloqueia o login e encerra todas as sessões da conta."),
});

export type AdminUser = z.infer<typeof adminUserSchema>;
export type AdminUserListQuery = z.infer<typeof adminUserListQuerySchema>;
