import { and, asc, count, eq, gt } from "drizzle-orm";
import type { Db, DbExecutor, DbTransaction } from "../../db/client.js";
import { errors } from "../../shared/errors.js";
import { brl, formatBrl } from "../../shared/money.js";
import { generateToken, hashToken } from "../accounts/security.js";
import { variantAvailability } from "../catalog/availability.js";
import { inventoryLevels, products, productVariants } from "../catalog/catalog.schema.js";
import { coupons } from "../marketing/marketing.schema.js";
import type { CartItemView, CartView } from "./cart.contracts.js";
import { couponStateIssue, mergedQuantity, priceCart, type CouponIssue, type PricingLine } from "./cart.pricing.js";
import { cartItems, carts, MAX_CART_LINES, MAX_ITEM_QUANTITY } from "./cart.schema.js";

const DAY_MS = 86_400_000;

type CartRow = typeof carts.$inferSelect;
type CouponRow = typeof coupons.$inferSelect;

export type CartOwner = { kind: "customer"; userId: string } | { kind: "guest"; token: string };

export interface CartSettings {
  guestTtlDays: number;
}

const guestExpiry = (settings: CartSettings) => new Date(Date.now() + settings.guestTtlDays * DAY_MS);

// --- Lookup and creation ---------------------------------------------------------------------

export async function findCart(db: DbExecutor, owner: CartOwner): Promise<CartRow | undefined> {
  const where =
    owner.kind === "customer"
      ? eq(carts.userId, owner.userId)
      : and(eq(carts.guestTokenHash, hashToken(owner.token)), gt(carts.expiresAt, new Date()));
  const [row] = await db.select().from(carts).where(where).limit(1);
  return row;
}

export async function findCartById(db: DbExecutor, cartId: string): Promise<CartRow | undefined> {
  const [row] = await db.select().from(carts).where(eq(carts.id, cartId)).limit(1);
  return row;
}

async function ensureCustomerCart(db: DbExecutor, userId: string): Promise<CartRow> {
  await db.insert(carts).values({ userId }).onConflictDoNothing({ target: carts.userId });
  const [row] = await db.select().from(carts).where(eq(carts.userId, userId)).limit(1);
  if (!row) throw new Error("customer cart upsert returned no row");
  return row;
}

/** Returns the owner's cart, creating it when needed. A new guest cart comes with its cookie token. */
export async function getOrCreateCart(
  db: Db,
  owner: CartOwner | { kind: "guest"; token: null },
  settings: CartSettings,
): Promise<{ cart: CartRow; newGuestToken?: string }> {
  if (owner.kind === "customer") return { cart: await ensureCustomerCart(db, owner.userId) };
  if (owner.token) {
    const existing = await findCart(db, owner);
    if (existing) return { cart: existing };
  }
  const { token, tokenHash } = generateToken();
  const [cart] = await db.insert(carts).values({ guestTokenHash: tokenHash, expiresAt: guestExpiry(settings) }).returning();
  if (!cart) throw new Error("guest cart insert returned no row");
  return { cart, newGuestToken: token };
}

/** Serialises concurrent changes to the same cart. */
export async function lockCart(tx: DbTransaction, cartId: string): Promise<CartRow> {
  const [row] = await tx.select().from(carts).where(eq(carts.id, cartId)).for("update");
  if (!row) throw errors.notFound("Sacola não encontrada.");
  return row;
}

async function touchCart(tx: DbTransaction, cart: CartRow, settings: CartSettings, set: Partial<Pick<CartRow, "couponId">> = {}) {
  await tx
    .update(carts)
    .set({ ...set, updatedAt: new Date(), ...(cart.userId === null ? { expiresAt: guestExpiry(settings) } : {}) })
    .where(eq(carts.id, cart.id));
}

// --- Sign-in merge ---------------------------------------------------------------------------

/**
 * Moves a guest cart into the customer's cart and deletes it. For a variant present in both,
 * the larger quantity wins (the same item added on two devices is not doubled). The customer's
 * own coupon has priority over the guest one. Lines beyond the cart limit are dropped.
 */
export async function mergeGuestCart(db: Db, guestToken: string, userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [guest] = await tx
      .select()
      .from(carts)
      .where(and(eq(carts.guestTokenHash, hashToken(guestToken)), gt(carts.expiresAt, new Date())))
      .for("update");
    if (!guest) return;

    const target = await lockCart(tx, (await ensureCustomerCart(tx, userId)).id);
    const guestLines = await tx.select().from(cartItems).where(eq(cartItems.cartId, guest.id));
    const targetLines = await tx.select().from(cartItems).where(eq(cartItems.cartId, target.id));
    const byVariant = new Map(targetLines.map((line) => [line.variantId, line]));
    let lineCount = targetLines.length;

    for (const line of guestLines) {
      const existing = byVariant.get(line.variantId);
      if (existing) {
        const quantity = mergedQuantity(existing.quantity, line.quantity, "max");
        if (quantity !== existing.quantity) {
          await tx
            .update(cartItems)
            .set({ quantity, unitPriceMinorSnapshot: line.unitPriceMinorSnapshot })
            .where(eq(cartItems.id, existing.id));
        }
      } else if (lineCount < MAX_CART_LINES) {
        await tx.update(cartItems).set({ cartId: target.id }).where(eq(cartItems.id, line.id));
        lineCount += 1;
      }
    }

    await tx.delete(carts).where(eq(carts.id, guest.id));
    await tx
      .update(carts)
      .set({ updatedAt: new Date(), ...(target.couponId === null && guest.couponId !== null ? { couponId: guest.couponId } : {}) })
      .where(eq(carts.id, target.id));
  });
}

// --- Reading and pricing ---------------------------------------------------------------------

export async function loadLines(db: DbExecutor, cartId: string) {
  return db.query.cartItems.findMany({
    where: eq(cartItems.cartId, cartId),
    orderBy: [asc(cartItems.createdAt), asc(cartItems.id)],
    with: {
      variant: {
        with: {
          inventory: true,
          product: {
            with: {
              media: { orderBy: (media, { asc: ascending }) => [ascending(media.position)], limit: 1 },
              collections: true,
            },
          },
        },
      },
    },
  });
}

export type LoadedLine = Awaited<ReturnType<typeof loadLines>>[number];

export function toPricingLine(line: LoadedLine): PricingLine {
  const { variant } = line;
  const stock = variant.inventory;
  return {
    id: line.id,
    quantity: line.quantity,
    unitPriceMinor: variant.priceMinor,
    unitPriceMinorSnapshot: line.unitPriceMinorSnapshot,
    sellable: variant.isActive && variant.product.status === "active",
    available: stock ? Math.max(0, stock.onHand - stock.reserved) : 0,
    collectionIds: variant.product.collections.map((link) => link.collectionId),
  };
}

export async function buildCartView(
  db: DbExecutor,
  cart: CartRow | undefined,
  ctx: { authenticated: boolean },
): Promise<CartView> {
  const owner = ctx.authenticated ? "customer" : "guest";
  if (!cart) {
    const zero = brl(0);
    return {
      id: null,
      owner,
      items: [],
      itemCount: 0,
      coupon: null,
      totals: { subtotal: zero, discount: zero, shipping: null, total: zero },
      hasIssues: false,
      updatedAt: null,
    };
  }

  const lines = await loadLines(db, cart.id);
  const [coupon] = cart.couponId ? await db.select().from(coupons).where(eq(coupons.id, cart.couponId)).limit(1) : [];
  const pricing = priceCart(lines.map(toPricingLine), coupon ?? null, { now: new Date(), ...ctx });

  const items: CartItemView[] = lines.map((line, index) => {
    const priced = pricing.lines[index]!;
    const { variant } = line;
    const [media] = variant.product.media;
    return {
      id: line.id,
      quantity: line.quantity,
      maxQuantity: priced.maxQuantity,
      product: {
        id: variant.product.id,
        slug: variant.product.slug,
        name: variant.product.name,
        isDemo: variant.product.isDemo,
        image: media ? { url: media.url, alt: media.alt } : null,
      },
      variant: {
        id: variant.id,
        sku: variant.sku,
        size: variant.size,
        color: variant.color,
        availability: priced.issues.includes("unavailable") ? "out_of_stock" : variantAvailability(variant.inventory),
      },
      unitPrice: brl(variant.priceMinor),
      compareAtUnitPrice: variant.compareAtPriceMinor === null ? null : brl(variant.compareAtPriceMinor),
      previousUnitPrice: priced.issues.includes("price_changed") ? brl(line.unitPriceMinorSnapshot) : null,
      lineTotal: brl(priced.lineTotalMinor),
      issues: priced.issues,
    };
  });

  return {
    id: cart.id,
    owner,
    items,
    itemCount: pricing.itemCount,
    coupon:
      coupon && pricing.coupon
        ? {
            code: coupon.code,
            description: coupon.description,
            status: pricing.coupon.ok ? "applied" : "not_applicable",
            issue: pricing.coupon.ok ? null : pricing.coupon.issue,
            discount: brl(pricing.discountMinor),
            minimumSubtotal: coupon.minSubtotalMinor > 0 ? brl(coupon.minSubtotalMinor) : null,
          }
        : null,
    totals: {
      subtotal: brl(pricing.subtotalMinor),
      discount: brl(pricing.discountMinor),
      shipping: null,
      total: brl(pricing.totalMinor),
    },
    hasIssues: pricing.hasIssues,
    updatedAt: cart.updatedAt.toISOString(),
  };
}

// --- Mutations -------------------------------------------------------------------------------

interface SellableVariant {
  id: string;
  priceMinor: number;
  available: number;
}

/** Active variant of an active product, with its current price and available stock. */
async function findSellableVariant(tx: DbTransaction, variantId: string): Promise<SellableVariant | undefined> {
  const [row] = await tx
    .select({
      id: productVariants.id,
      priceMinor: productVariants.priceMinor,
      isActive: productVariants.isActive,
      productStatus: products.status,
      onHand: inventoryLevels.onHand,
      reserved: inventoryLevels.reserved,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .leftJoin(inventoryLevels, eq(inventoryLevels.variantId, productVariants.id))
    .where(eq(productVariants.id, variantId))
    .limit(1);
  if (!row || !row.isActive || row.productStatus !== "active") return undefined;
  return { id: row.id, priceMinor: row.priceMinor, available: Math.max(0, (row.onHand ?? 0) - (row.reserved ?? 0)) };
}

const quantityPath = "body.quantity";

function assertStock(quantity: number, available: number) {
  if (available <= 0) {
    throw errors.conflict("Produto sem estoque no momento.", [
      { path: quantityPath, message: "Sem estoque.", code: "out_of_stock" },
    ]);
  }
  if (quantity > available) {
    const max = Math.min(MAX_ITEM_QUANTITY, available);
    throw errors.conflict(`Quantidade indisponível. Disponível: até ${max} unidade(s).`, [
      { path: quantityPath, message: `Máximo disponível: ${max}.`, code: "insufficient_stock" },
    ]);
  }
}

const unavailableVariant = () => errors.notFound("Produto ou tamanho indisponível.");

export async function addItem(db: Db, cartId: string, input: { variantId: string; quantity: number }, settings: CartSettings) {
  await db.transaction(async (tx) => {
    const cart = await lockCart(tx, cartId);
    const variant = await findSellableVariant(tx, input.variantId);
    if (!variant) throw unavailableVariant();

    const [existing] = await tx
      .select()
      .from(cartItems)
      .where(and(eq(cartItems.cartId, cart.id), eq(cartItems.variantId, variant.id)))
      .limit(1);
    const quantity = (existing?.quantity ?? 0) + input.quantity;
    if (quantity > MAX_ITEM_QUANTITY) {
      throw errors.conflict(`Limite de ${MAX_ITEM_QUANTITY} unidades por item.`, [
        { path: quantityPath, message: `Máximo por item: ${MAX_ITEM_QUANTITY}.`, code: "max_quantity_exceeded" },
      ]);
    }
    assertStock(quantity, variant.available);

    if (existing) {
      await tx.update(cartItems).set({ quantity, unitPriceMinorSnapshot: variant.priceMinor }).where(eq(cartItems.id, existing.id));
    } else {
      const [{ lines } = { lines: 0 }] = await tx.select({ lines: count() }).from(cartItems).where(eq(cartItems.cartId, cart.id));
      if (lines >= MAX_CART_LINES) {
        throw errors.conflict(`A sacola aceita até ${MAX_CART_LINES} itens diferentes.`, [
          { path: "body.variantId", message: "Sacola cheia.", code: "cart_full" },
        ]);
      }
      await tx.insert(cartItems).values({ cartId: cart.id, variantId: variant.id, quantity, unitPriceMinorSnapshot: variant.priceMinor });
    }
    await touchCart(tx, cart, settings);
  });
}

export async function updateItemQuantity(db: Db, cartId: string, itemId: string, quantity: number, settings: CartSettings) {
  await db.transaction(async (tx) => {
    const cart = await lockCart(tx, cartId);
    const [item] = await tx
      .select()
      .from(cartItems)
      .where(and(eq(cartItems.id, itemId), eq(cartItems.cartId, cart.id)))
      .limit(1);
    if (!item) throw errors.notFound("Item não encontrado na sacola.");

    const variant = await findSellableVariant(tx, item.variantId);
    if (!variant) {
      throw errors.conflict("Este produto não está mais disponível; remova-o da sacola.", [
        { path: quantityPath, message: "Indisponível.", code: "unavailable" },
      ]);
    }
    assertStock(quantity, variant.available);
    await tx.update(cartItems).set({ quantity, unitPriceMinorSnapshot: variant.priceMinor }).where(eq(cartItems.id, item.id));
    await touchCart(tx, cart, settings);
  });
}

export async function removeItem(db: Db, cartId: string, itemId: string, settings: CartSettings) {
  await db.transaction(async (tx) => {
    const cart = await lockCart(tx, cartId);
    const removed = await tx
      .delete(cartItems)
      .where(and(eq(cartItems.id, itemId), eq(cartItems.cartId, cart.id)))
      .returning({ id: cartItems.id });
    if (removed.length === 0) throw errors.notFound("Item não encontrado na sacola.");
    await touchCart(tx, cart, settings);
  });
}

export type ImportSkip = { variantId: string; reason: "unavailable" | "cart_full" };

/**
 * Imports the browser-preview cart. Unknown or inactive variants are skipped; quantities are
 * added to existing lines and capped at the per-item limit. Stock shortfalls are not rejected
 * here: they surface as `issues` on the returned cart, like any other stock change.
 */
export async function importItems(
  db: Db,
  cartId: string,
  items: readonly { variantId: string; quantity: number }[],
  settings: CartSettings,
): Promise<ImportSkip[]> {
  const requested = new Map<string, number>();
  for (const item of items) requested.set(item.variantId, (requested.get(item.variantId) ?? 0) + item.quantity);

  return db.transaction(async (tx) => {
    const cart = await lockCart(tx, cartId);
    const lines = await tx.select().from(cartItems).where(eq(cartItems.cartId, cart.id));
    const byVariant = new Map(lines.map((line) => [line.variantId, line]));
    let lineCount = lines.length;
    const skipped: ImportSkip[] = [];

    for (const [variantId, incoming] of requested) {
      const variant = await findSellableVariant(tx, variantId);
      if (!variant) {
        skipped.push({ variantId, reason: "unavailable" });
        continue;
      }
      const existing = byVariant.get(variantId);
      if (existing) {
        const quantity = mergedQuantity(existing.quantity, incoming, "sum");
        await tx.update(cartItems).set({ quantity, unitPriceMinorSnapshot: variant.priceMinor }).where(eq(cartItems.id, existing.id));
      } else if (lineCount < MAX_CART_LINES) {
        await tx.insert(cartItems).values({
          cartId: cart.id,
          variantId,
          quantity: mergedQuantity(0, incoming, "sum"),
          unitPriceMinorSnapshot: variant.priceMinor,
        });
        lineCount += 1;
      } else {
        skipped.push({ variantId, reason: "cart_full" });
      }
    }
    await touchCart(tx, cart, settings);
    return skipped;
  });
}

// --- Coupons ---------------------------------------------------------------------------------

export function couponIssueMessage(issue: CouponIssue, coupon?: { minSubtotalMinor: number }): string {
  switch (issue) {
    case "coupon_invalid":
      return "Cupom inválido ou indisponível.";
    case "coupon_expired":
      return "Este cupom expirou.";
    case "coupon_usage_exhausted":
      return "Este cupom atingiu o limite de usos.";
    case "coupon_requires_account":
      return "Entre na sua conta para usar este cupom.";
    case "coupon_minimum_not_met":
      return `Este cupom exige subtotal mínimo de ${formatBrl(coupon?.minSubtotalMinor ?? 0)}.`;
    case "coupon_not_applicable":
      return "O cupom não se aplica aos itens da sacola.";
  }
}

const couponError = (issue: CouponIssue, coupon?: CouponRow) => {
  const message = couponIssueMessage(issue, coupon);
  return errors.validation([{ path: "body.code", message, code: issue }], message);
};

/**
 * Applies a coupon after evaluating it against the current server-side cart. Codes that do not
 * exist, are inactive or have not started yet all return the same `coupon_invalid` reason.
 */
export async function applyCoupon(db: Db, cartId: string, code: string, ctx: { authenticated: boolean }, settings: CartSettings) {
  await db.transaction(async (tx) => {
    const cart = await lockCart(tx, cartId);
    const [coupon] = await tx.select().from(coupons).where(eq(coupons.code, code)).limit(1);
    if (!coupon) throw couponError("coupon_invalid");
    const stateIssue = couponStateIssue(coupon, { now: new Date(), ...ctx });
    if (stateIssue) throw couponError(stateIssue, coupon);

    const lines = await loadLines(tx, cart.id);
    const pricing = priceCart(lines.map(toPricingLine), coupon, { now: new Date(), ...ctx });
    if (pricing.coupon && !pricing.coupon.ok) throw couponError(pricing.coupon.issue, coupon);

    await touchCart(tx, cart, settings, { couponId: coupon.id });
  });
}

export async function removeCoupon(db: Db, cartId: string, settings: CartSettings) {
  await db.transaction(async (tx) => {
    const cart = await lockCart(tx, cartId);
    await touchCart(tx, cart, settings, { couponId: null });
  });
}
