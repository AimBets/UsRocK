import type { FastifyReply, FastifyRequest } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { Env } from "../../config/env.js";
import type { Db } from "../../db/client.js";
import { errorResponseSchema, errors } from "../../shared/errors.js";
import { tokenSchema } from "../accounts/security.js";
import {
  addCartItemBodySchema,
  applyCouponBodySchema,
  cartImportResponseSchema,
  cartItemParamsSchema,
  cartSchema,
  importCartBodySchema,
  updateCartItemBodySchema,
} from "./cart.contracts.js";
import {
  addItem,
  applyCoupon,
  buildCartView,
  couponIssueMessage,
  findCart,
  findCartById,
  getOrCreateCart,
  importItems,
  mergeGuestCart,
  removeCoupon,
  removeItem,
  updateItemQuantity,
  type CartOwner,
  type CartSettings,
} from "./cart.service.js";

export const CART_COOKIE_NAME = "usrock_cart";

export interface CartRoutesOptions {
  db: Db;
  env: Env;
}

const COUPON_WINDOW = 15 * 60_000;
const COUPON_ATTEMPTS_PER_WINDOW = 20;

/**
 * Resolves the cart for a request (guest cookie or account), shared by the cart, shipping and
 * checkout routes. After sign-in, the first call merges the guest cart into the account cart.
 */
export function createCartResolver(db: Db, env: Env) {
  const settings: CartSettings = { guestTtlDays: env.CART_GUEST_TTL_DAYS };
  const cookieOptions = { httpOnly: true, secure: env.SESSION_COOKIE_SECURE, sameSite: "lax", path: "/" } as const;

  function setGuestCookie(reply: FastifyReply, token: string) {
    reply.setCookie(CART_COOKIE_NAME, token, { ...cookieOptions, maxAge: settings.guestTtlDays * 86_400 });
  }

  function clearGuestCookie(reply: FastifyReply) {
    reply.clearCookie(CART_COOKIE_NAME, cookieOptions);
  }

  /**
   * Identifies the cart owner. After sign-in, the first cart request merges the guest cart
   * (still referenced by its cookie) into the account cart and drops the guest cookie.
   */
  async function resolveOwner(request: FastifyRequest, reply: FastifyReply) {
    const parsed = tokenSchema.safeParse(request.cookies[CART_COOKIE_NAME]);
    const guestToken = parsed.success ? parsed.data : null;
    if (request.principal) {
      if (request.cookies[CART_COOKIE_NAME] !== undefined) {
        if (guestToken) await mergeGuestCart(db, guestToken, request.principal.userId);
        clearGuestCookie(reply);
      }
      return { owner: { kind: "customer", userId: request.principal.userId } as CartOwner, authenticated: true };
    }
    return { owner: { kind: "guest", token: guestToken } as const, authenticated: false };
  }

  /** Existing cart only (reads, item changes, coupon). */
  async function existingCart(request: FastifyRequest, reply: FastifyReply) {
    const { owner, authenticated } = await resolveOwner(request, reply);
    const cart = owner.kind === "customer" || owner.token ? await findCart(db, owner as CartOwner) : undefined;
    if (!cart && owner.kind === "guest" && request.cookies[CART_COOKIE_NAME] !== undefined) clearGuestCookie(reply);
    if (cart && owner.kind === "guest" && owner.token) setGuestCookie(reply, owner.token);
    return { cart, authenticated };
  }

  /** Cart for adding items: created on first use; a new guest cart sets its cookie. */
  async function writableCart(request: FastifyRequest, reply: FastifyReply) {
    const { owner, authenticated } = await resolveOwner(request, reply);
    const { cart, newGuestToken } = await getOrCreateCart(db, owner, settings);
    const token = newGuestToken ?? (owner.kind === "guest" ? owner.token : null);
    if (token) setGuestCookie(reply, token);
    return { cart, authenticated };
  }

  return { settings, existingCart, writableCart };
}

export const cartRoutes: FastifyPluginAsyncZod<CartRoutesOptions> = async (app, { db, env }) => {
  const { settings, existingCart, writableCart } = createCartResolver(db, env);

  // Carts are personal and change constantly: never cache them.
  app.addHook("onSend", async (_request, reply) => {
    reply.header("cache-control", "no-store");
  });

  async function respond(cartId: string, authenticated: boolean) {
    return buildCartView(db, await findCartById(db, cartId), { authenticated });
  }

  const notFoundCart = () => errors.notFound("Item não encontrado na sacola.");

  app.get(
    "/cart",
    {
      schema: {
        tags: ["cart"],
        summary: "Sacola atual (visitante ou cliente) com preços, estoque, cupom e totais do servidor",
        description:
          "Sem sacola, retorna uma sacola vazia (`id: null`) sem criar registro. Com sessão ativa e cookie de sacola de visitante, " +
          "a sacola do visitante é mesclada à da conta nesta chamada.",
        response: { 200: cartSchema },
      },
    },
    async (request, reply) => {
      const { cart, authenticated } = await existingCart(request, reply);
      return buildCartView(db, cart, { authenticated });
    },
  );

  app.post(
    "/cart/items",
    {
      schema: {
        tags: ["cart"],
        summary: "Adiciona uma variante (soma à quantidade existente)",
        description: "Cria a sacola na primeira adição; para visitantes define o cookie `usrock_cart` (httpOnly).",
        body: addCartItemBodySchema,
        response: { 200: cartSchema, 404: errorResponseSchema, 409: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const { cart, authenticated } = await writableCart(request, reply);
      await addItem(db, cart.id, request.body, settings);
      return respond(cart.id, authenticated);
    },
  );

  app.post(
    "/cart/import",
    {
      schema: {
        tags: ["cart"],
        summary: "Importa a sacola local (prévia do navegador) para a sacola do servidor",
        description: "Variantes inexistentes ou fora de venda são ignoradas e listadas em `skipped`.",
        body: importCartBodySchema,
        response: { 200: cartImportResponseSchema },
      },
    },
    async (request, reply) => {
      const { cart, authenticated } = await writableCart(request, reply);
      const skipped = await importItems(db, cart.id, request.body.items, settings);
      return { cart: await respond(cart.id, authenticated), skipped };
    },
  );

  app.patch(
    "/cart/items/:itemId",
    {
      schema: {
        tags: ["cart"],
        summary: "Define a quantidade de um item",
        params: cartItemParamsSchema,
        body: updateCartItemBodySchema,
        response: { 200: cartSchema, 404: errorResponseSchema, 409: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const { cart, authenticated } = await existingCart(request, reply);
      if (!cart) throw notFoundCart();
      await updateItemQuantity(db, cart.id, request.params.itemId, request.body.quantity, settings);
      return respond(cart.id, authenticated);
    },
  );

  app.delete(
    "/cart/items/:itemId",
    {
      schema: {
        tags: ["cart"],
        summary: "Remove um item",
        params: cartItemParamsSchema,
        response: { 200: cartSchema, 404: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const { cart, authenticated } = await existingCart(request, reply);
      if (!cart) throw notFoundCart();
      await removeItem(db, cart.id, request.params.itemId, settings);
      return respond(cart.id, authenticated);
    },
  );

  app.put(
    "/cart/coupon",
    {
      config: { rateLimit: { max: COUPON_ATTEMPTS_PER_WINDOW, timeWindow: COUPON_WINDOW } },
      schema: {
        tags: ["cart"],
        summary: "Aplica um cupom (substitui o anterior)",
        description:
          "Recusa com `400 VALIDATION_ERROR` e `details[0].code` em `body.code`: `coupon_invalid`, `coupon_expired`, " +
          "`coupon_usage_exhausted`, `coupon_requires_account`, `coupon_minimum_not_met`, `coupon_not_applicable`. " +
          `Limite: ${COUPON_ATTEMPTS_PER_WINDOW} tentativas por 15 min por IP.`,
        body: applyCouponBodySchema,
        response: { 200: cartSchema },
      },
    },
    async (request, reply) => {
      const { cart, authenticated } = await existingCart(request, reply);
      if (!cart) {
        const message = couponIssueMessage("coupon_not_applicable");
        throw errors.validation([{ path: "body.code", message, code: "coupon_not_applicable" }], message);
      }
      await applyCoupon(db, cart.id, request.body.code, { authenticated }, settings);
      return respond(cart.id, authenticated);
    },
  );

  app.delete(
    "/cart/coupon",
    {
      schema: {
        tags: ["cart"],
        summary: "Remove o cupom da sacola (idempotente)",
        response: { 200: cartSchema },
      },
    },
    async (request, reply) => {
      const { cart, authenticated } = await existingCart(request, reply);
      if (!cart) return buildCartView(db, undefined, { authenticated });
      await removeCoupon(db, cart.id, settings);
      return respond(cart.id, authenticated);
    },
  );
};
