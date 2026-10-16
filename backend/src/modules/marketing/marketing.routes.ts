import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { Db } from "../../db/client.js";
import { errorResponseSchema } from "../../shared/errors.js";
import { auditActorFrom, diffChanges, recordAudit } from "../audit/audit.service.js";
import { protectAdminScope } from "../auth/auth.plugin.js";
import {
  activeCampaignsQuerySchema,
  activeCampaignsResponseSchema,
  adminCampaignListSchema,
  adminCampaignSchema,
  adminCouponListSchema,
  adminCouponSchema,
  adminListQuerySchema,
  createCampaignBodySchema,
  createCouponBodySchema,
  idParamsSchema,
  updateCampaignBodySchema,
  updateCouponBodySchema,
} from "./marketing.contracts.js";
import {
  createCampaign,
  createCoupon,
  findActiveCampaigns,
  listCampaigns,
  listCoupons,
  toAdminCampaign,
  toAdminCoupon,
  updateCampaign,
  updateCoupon,
} from "./marketing.service.js";

export interface MarketingRoutesOptions {
  db: Db;
}

const sessionSecurity = [{ sessionCookie: [] }];
const adminErrors = { 401: errorResponseSchema, 403: errorResponseSchema };

/** Public campaign feed. */
export const campaignRoutes: FastifyPluginAsyncZod<MarketingRoutesOptions> = async (app, { db }) => {
  app.get(
    "/campaigns/active",
    {
      schema: {
        tags: ["marketing"],
        summary: "Campanhas publicadas e vigentes, por prioridade",
        description: `Até 20 itens. Vigência avaliada no servidor; cache público de até 60 s.`,
        querystring: activeCampaignsQuerySchema,
        response: { 200: activeCampaignsResponseSchema },
      },
    },
    async (request, reply) => {
      reply.header("cache-control", "public, max-age=60, stale-while-revalidate=60");
      return { data: await findActiveCampaigns(db, request.query.placement) };
    },
  );
};

/**
 * Administration of coupons and campaigns (permission `campaigns:manage`). Every change is written
 * to the audit trail in the same transaction (E6) and logged with the actor id.
 */
export const marketingAdminRoutes: FastifyPluginAsyncZod<MarketingRoutesOptions> = async (app, { db }) => {
  protectAdminScope(app, "campaigns:manage");

  app.get(
    "/admin/coupons",
    {
      schema: {
        tags: ["admin"],
        summary: "Lista cupons (mais recentes primeiro)",
        security: sessionSecurity,
        querystring: adminListQuerySchema,
        response: { 200: adminCouponListSchema, ...adminErrors },
      },
    },
    async (request) => listCoupons(db, request.query.limit, request.query.cursor),
  );

  app.post(
    "/admin/coupons",
    {
      schema: {
        tags: ["admin"],
        summary: "Cria cupom",
        security: sessionSecurity,
        body: createCouponBodySchema,
        response: { 201: adminCouponSchema, ...adminErrors, 409: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const row = await db.transaction(async (tx) => {
        const created = await createCoupon(tx, request.body);
        await recordAudit(tx, auditActorFrom(request), {
          action: "coupon.create",
          resourceType: "coupon",
          resourceId: created.id,
          changes: diffChanges(null, created),
        });
        return created;
      });
      request.log.info({ actorId: request.principal!.userId, couponId: row.id, action: "coupon.create" }, "admin change");
      return reply.status(201).send(toAdminCoupon(row));
    },
  );

  app.patch(
    "/admin/coupons/:id",
    {
      schema: {
        tags: ["admin"],
        summary: "Atualiza cupom (desative com `isActive: false`; não há exclusão)",
        security: sessionSecurity,
        params: idParamsSchema,
        body: updateCouponBodySchema,
        response: { 200: adminCouponSchema, ...adminErrors, 404: errorResponseSchema, 409: errorResponseSchema },
      },
    },
    async (request) => {
      const row = await db.transaction(async (tx) => {
        const { before, after } = await updateCoupon(tx, request.params.id, request.body);
        const changes = diffChanges(before, after);
        if (changes) await recordAudit(tx, auditActorFrom(request), { action: "coupon.update", resourceType: "coupon", resourceId: after.id, changes });
        return after;
      });
      request.log.info(
        { actorId: request.principal!.userId, couponId: row.id, action: "coupon.update", fields: Object.keys(request.body) },
        "admin change",
      );
      return toAdminCoupon(row);
    },
  );

  app.get(
    "/admin/campaigns",
    {
      schema: {
        tags: ["admin"],
        summary: "Lista campanhas (mais recentes primeiro)",
        security: sessionSecurity,
        querystring: adminListQuerySchema,
        response: { 200: adminCampaignListSchema, ...adminErrors },
      },
    },
    async (request) => listCampaigns(db, request.query.limit, request.query.cursor),
  );

  app.post(
    "/admin/campaigns",
    {
      schema: {
        tags: ["admin"],
        summary: "Cria campanha (rascunho por padrão)",
        security: sessionSecurity,
        body: createCampaignBodySchema,
        response: { 201: adminCampaignSchema, ...adminErrors, 409: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const row = await db.transaction(async (tx) => {
        const created = await createCampaign(tx, request.body);
        await recordAudit(tx, auditActorFrom(request), {
          action: "campaign.create",
          resourceType: "campaign",
          resourceId: created.id,
          changes: diffChanges(null, created),
        });
        return created;
      });
      request.log.info({ actorId: request.principal!.userId, campaignId: row.id, action: "campaign.create" }, "admin change");
      return reply.status(201).send(toAdminCampaign(row));
    },
  );

  app.patch(
    "/admin/campaigns/:id",
    {
      schema: {
        tags: ["admin"],
        summary: "Atualiza campanha (publique com `status: published`; arquive com `archived`)",
        security: sessionSecurity,
        params: idParamsSchema,
        body: updateCampaignBodySchema,
        response: { 200: adminCampaignSchema, ...adminErrors, 404: errorResponseSchema, 409: errorResponseSchema },
      },
    },
    async (request) => {
      const row = await db.transaction(async (tx) => {
        const { before, after } = await updateCampaign(tx, request.params.id, request.body);
        const changes = diffChanges(before, after);
        if (changes) await recordAudit(tx, auditActorFrom(request), { action: "campaign.update", resourceType: "campaign", resourceId: after.id, changes });
        return after;
      });
      request.log.info(
        { actorId: request.principal!.userId, campaignId: row.id, action: "campaign.update", fields: Object.keys(request.body) },
        "admin change",
      );
      return toAdminCampaign(row);
    },
  );
};
