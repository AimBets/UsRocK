import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { Db } from "../../db/client.js";
import { errorResponseSchema } from "../../shared/errors.js";
import { requirePermission } from "../auth/auth.plugin.js";
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
 * Minimal administration of coupons and campaigns (permission `campaigns:manage`). Every change
 * is logged with the actor id; the persistent audit trail arrives with the admin APIs (E6).
 */
export const marketingAdminRoutes: FastifyPluginAsyncZod<MarketingRoutesOptions> = async (app, { db }) => {
  app.addHook("preHandler", requirePermission("campaigns:manage"));
  app.addHook("onSend", async (_request, reply) => {
    reply.header("cache-control", "no-store");
  });

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
      const row = await createCoupon(db, request.body);
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
      const row = await updateCoupon(db, request.params.id, request.body);
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
      const row = await createCampaign(db, request.body);
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
      const row = await updateCampaign(db, request.params.id, request.body);
      request.log.info(
        { actorId: request.principal!.userId, campaignId: row.id, action: "campaign.update", fields: Object.keys(request.body) },
        "admin change",
      );
      return toAdminCampaign(row);
    },
  );
};
