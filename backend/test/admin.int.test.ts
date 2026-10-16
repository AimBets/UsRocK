import { and, eq, isNull, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from "vitest";
import type { App } from "../src/app.js";
import { createDatabase } from "../src/db/client.js";
import type { AdminUser } from "../src/modules/access/access.contracts.js";
import { sessions, users } from "../src/modules/accounts/accounts.schema.js";
import type { AuditLogEntry } from "../src/modules/audit/audit.contracts.js";
import { adminAuditLogs } from "../src/modules/audit/audit.schema.js";
import type { Role } from "../src/modules/auth/auth.types.js";
import { createMemoryMailer } from "../src/modules/mail/mailer.js";
import { orders } from "../src/modules/orders/orders.schema.js";
import type { ErrorResponse } from "../src/shared/errors.js";
import type { captureLogs } from "./helpers/app.js";
import { buildTestApp, TEST_ORIGIN } from "./helpers/app.js";

const database = createDatabase(inject("testDatabaseUrl"), { poolMax: 6 });
const { db } = database;
let app: App;
let logs: ReturnType<typeof captureLogs>;

const PASSWORD = "riff-pesado-2026";
type Res = Awaited<ReturnType<App["inject"]>>;
type Page<T> = { data: T[]; pageInfo: { hasNextPage: boolean; nextCursor: string | null } };

interface Account {
  id: string;
  email: string;
  cookie: string;
}

async function call(who: Account | null, method: "GET" | "POST" | "PUT" | "PATCH", url: string, payload?: unknown): Promise<Res> {
  return app.inject({
    method,
    url: `/api/v1${url}`,
    headers: { origin: TEST_ORIGIN },
    cookies: who ? { usrock_session: who.cookie } : {},
    ...(payload !== undefined ? { payload: payload as Record<string, unknown> } : {}),
  });
}

const detailCodes = (res: Res) => (res.json<ErrorResponse>().error.details ?? []).map((detail) => detail.code);

let counter = 0;
async function account(roles: Role[] = ["customer"]): Promise<Account> {
  counter += 1;
  const email = `equipe${counter}@example.com`;
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    headers: { origin: TEST_ORIGIN },
    payload: { email, password: PASSWORD, name: `Pessoa ${counter}`, acceptTerms: true },
  });
  expect(res.statusCode, res.body).toBe(201);
  const id = res.json<{ user: { id: string } }>().user.id;
  if (roles.join() !== "customer") await db.update(users).set({ roles }).where(eq(users.id, id));
  const cookie = res.cookies.find((c) => c.name === "usrock_session")!.value;
  return { id, email, cookie };
}

async function auditRows() {
  return db.select().from(adminAuditLogs).orderBy(adminAuditLogs.occurredAt);
}

let admin: Account;

beforeAll(async () => {
  await db.execute(sql`TRUNCATE admin_audit_logs, orders, coupons, campaigns, consents, password_reset_tokens, sessions, users RESTART IDENTITY CASCADE`);
  ({ app, logs } = await buildTestApp({ database, mailer: createMemoryMailer(), env: { AUTH_RATE_LIMIT_MAX: "1000", RATE_LIMIT_MAX: "10000" } }));
  await app.ready();
  admin = await account(["admin"]);
});

beforeEach(async () => {
  await db.execute(sql`TRUNCATE admin_audit_logs`);
});

afterAll(async () => {
  await app.close();
  await database.close();
});

describe("team access (users:manage)", () => {
  it("is reserved to administrators", async () => {
    const operator = await account(["operator"]);
    const customer = await account();
    for (const who of [operator, customer]) {
      expect((await call(who, "GET", "/admin/users")).statusCode).toBe(403);
      expect((await call(who, "GET", "/admin/audit-logs")).statusCode).toBe(403);
      expect((await call(who, "PUT", `/admin/users/${customer.id}/roles`, { roles: ["admin"] })).statusCode).toBe(403);
    }
    expect((await call(null, "GET", "/admin/users")).statusCode).toBe(401);
    // A refused attempt changes nothing and leaves no audit entry.
    const [row] = await db.select({ roles: users.roles }).from(users).where(eq(users.id, customer.id));
    expect(row!.roles).toEqual(["customer"]);
    expect(await auditRows()).toHaveLength(0);
  });

  it("lists only staff, and finds any account by exact e-mail", async () => {
    const editor = await account(["content_editor"]);
    const customer = await account();
    const staff = (await call(admin, "GET", "/admin/users?limit=100")).json<Page<AdminUser>>();
    const ids = staff.data.map((user) => user.id);
    expect(ids).toEqual(expect.arrayContaining([admin.id, editor.id]));
    expect(ids).not.toContain(customer.id);
    expect(staff.data.find((user) => user.id === editor.id)).toMatchObject({ roles: ["content_editor"], permissions: ["landing_pages:edit", "media:upload"] });
    expect(JSON.stringify(staff)).not.toMatch(/password/i);

    const found = (await call(admin, "GET", `/admin/users?email=${encodeURIComponent(customer.email.toUpperCase())}`)).json<Page<AdminUser>>();
    expect(found.data.map((user) => user.id)).toEqual([customer.id]);

    const editors = (await call(admin, "GET", "/admin/users?role=content_editor")).json<Page<AdminUser>>();
    expect(editors.data.every((user) => user.roles.includes("content_editor"))).toBe(true);
  });

  it("paginates the staff list without repeating accounts", async () => {
    for (let i = 0; i < 3; i += 1) await account(["operator"]);
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const page: Page<AdminUser> = (await call(admin, "GET", `/admin/users?limit=2${cursor ? `&cursor=${cursor}` : ""}`)).json();
      seen.push(...page.data.map((user) => user.id));
      cursor = page.pageInfo.nextCursor;
    } while (cursor);
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen.length).toBeGreaterThanOrEqual(4);
  });

  it("grants roles with immediate effect and an audit entry tied to the request", async () => {
    const customer = await account();
    expect((await call(customer, "GET", "/admin/orders")).statusCode).toBe(403);

    const res = await call(admin, "PUT", `/admin/users/${customer.id}/roles`, { roles: ["operator", "customer", "operator"] });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json<AdminUser>()).toMatchObject({ roles: ["customer", "operator"], status: "active" });
    expect(res.json<AdminUser>().permissions).toContain("orders:manage");
    // Roles are read per request: the same session gains access without logging in again.
    expect((await call(customer, "GET", "/admin/orders")).statusCode).toBe(200);

    const [entry] = await auditRows();
    expect(entry).toMatchObject({
      action: "user.roles_update",
      resourceType: "user",
      resourceId: customer.id,
      actorUserId: admin.id,
      actorRoles: ["admin"],
      changes: { roles: { from: ["customer"], to: ["customer", "operator"] } },
      requestId: res.headers["x-request-id"],
    });

    // Same set again: nothing changes and nothing is recorded.
    expect((await call(admin, "PUT", `/admin/users/${customer.id}/roles`, { roles: ["operator", "customer"] })).statusCode).toBe(200);
    expect(await auditRows()).toHaveLength(1);

    // Revoking takes effect immediately as well.
    expect((await call(admin, "PUT", `/admin/users/${customer.id}/roles`, { roles: ["customer"] })).statusCode).toBe(200);
    expect((await call(customer, "GET", "/admin/orders")).statusCode).toBe(403);
  });

  it("refuses changes to the caller's own access", async () => {
    const roles = await call(admin, "PUT", `/admin/users/${admin.id}/roles`, { roles: ["customer"] });
    expect(roles.statusCode).toBe(409);
    expect(detailCodes(roles)).toEqual(["cannot_modify_self"]);
    const status = await call(admin, "PATCH", `/admin/users/${admin.id}/status`, { status: "disabled" });
    expect(detailCodes(status)).toEqual(["cannot_modify_self"]);
    expect((await call(admin, "PUT", `/admin/users/00000000-0000-4000-8000-000000000000/roles`, { roles: ["customer"] })).statusCode).toBe(404);
    expect(await auditRows()).toHaveLength(0);
  });

  it("never leaves the store without an active administrator, even under concurrency", async () => {
    // Isolate: only two active administrators who try to demote each other at the same time.
    await db.update(users).set({ status: "disabled" }).where(sql`'admin'::user_role = ANY(${users.roles}) AND ${users.id} <> ${admin.id}`);
    const other = await account(["admin"]);

    // Force the worst interleaving: hold both accounts locked until both requests are inside
    // their transactions and waiting, then release them together.
    const blocker = await database.pool.connect();
    let results: Res[];
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT id FROM users WHERE id = ANY($1::uuid[]) FOR UPDATE", [[admin.id, other.id]]);
      const pending = Promise.all([
        call(admin, "PUT", `/admin/users/${other.id}/roles`, { roles: ["customer"] }),
        call(other, "PUT", `/admin/users/${admin.id}/roles`, { roles: ["customer"] }),
      ]);
      // Polled from another connection: inside a transaction pg_stat_activity is a frozen snapshot.
      for (let attempt = 0; ; attempt += 1) {
        const { rows } = await database.pool.query<{ waiting: number }>(
          "SELECT count(*)::int AS waiting FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'",
        );
        if (rows[0]!.waiting >= 2) break;
        if (attempt > 300) throw new Error("requests never reached the lock");
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      await blocker.query("COMMIT");
      results = await pending;
    } finally {
      blocker.release();
    }
    const [first, second] = results;
    const statuses = [first!.statusCode, second!.statusCode].sort();
    expect(statuses[0]).toBe(200);
    expect([403, 409]).toContain(statuses[1]);

    const remaining = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`'admin'::user_role = ANY(${users.roles}) AND ${users.status} = 'active'`);
    expect(remaining).toHaveLength(1);
    expect(await auditRows()).toHaveLength(1);
    // Restore the suite's administrator if it was the one demoted.
    await db.update(users).set({ roles: ["admin"], status: "active" }).where(eq(users.id, admin.id));
  });

  it("disables an account: sessions end, login is refused, and it can be re-enabled", async () => {
    const operator = await account(["operator"]);
    expect((await call(operator, "GET", "/me")).statusCode).toBe(200);

    const res = await call(admin, "PATCH", `/admin/users/${operator.id}/status`, { status: "disabled" });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json<AdminUser>().status).toBe("disabled");
    expect((await call(operator, "GET", "/me")).statusCode).toBe(401);
    const active = await db.select().from(sessions).where(and(eq(sessions.userId, operator.id), isNull(sessions.revokedAt)));
    expect(active).toHaveLength(0);
    const login = await app.inject({ method: "POST", url: "/api/v1/auth/login", headers: { origin: TEST_ORIGIN }, payload: { email: operator.email, password: PASSWORD } });
    expect(login.statusCode).toBe(401);

    expect((await call(admin, "PATCH", `/admin/users/${operator.id}/status`, { status: "active" })).statusCode).toBe(200);
    const again = await app.inject({ method: "POST", url: "/api/v1/auth/login", headers: { origin: TEST_ORIGIN }, payload: { email: operator.email, password: PASSWORD } });
    expect(again.statusCode).toBe(200);

    const entries = await auditRows();
    expect(entries.map((entry) => [entry.action, entry.changes])).toEqual([
      ["user.status_update", { status: { from: "active", to: "disabled" } }],
      ["user.status_update", { status: { from: "disabled", to: "active" } }],
    ]);
    expect(entries[0]!.metadata).toEqual({ sessionsRevoked: true });
  });
});

describe("audit trail", () => {
  it("is append-only at the database level", async () => {
    const customer = await account();
    await call(admin, "PUT", `/admin/users/${customer.id}/roles`, { roles: ["operator"] });
    const [entry] = await auditRows();
    await expect(db.update(adminAuditLogs).set({ action: "user.forged" }).where(eq(adminAuditLogs.id, entry!.id))).rejects.toThrow();
    await expect(db.delete(adminAuditLogs).where(eq(adminAuditLogs.id, entry!.id))).rejects.toThrow();
    const [unchanged] = await auditRows();
    expect(unchanged!.action).toBe("user.roles_update");
    // The entry survives the deletion of the account that acted.
    const actor = await account(["admin"]);
    const target = await account();
    await call(actor, "PUT", `/admin/users/${target.id}/roles`, { roles: ["content_editor"] });
    await db.delete(users).where(eq(users.id, actor.id));
    const list = (await call(admin, "GET", `/admin/audit-logs?actorUserId=${actor.id}`)).json<Page<AuditLogEntry>>();
    expect(list.data).toHaveLength(1);
    expect(list.data[0]!.actor).toEqual({ userId: actor.id, name: null, roles: ["admin"] });
  });

  it("records coupon and campaign changes atomically, only for effective changes", async () => {
    const created = await call(admin, "POST", "/admin/coupons", { code: "AUDIT10", description: "Teste", discountType: "percentage", percentOff: 10 });
    expect(created.statusCode, created.body).toBe(201);
    const couponId = created.json<{ id: string }>().id;
    // Rejected writes roll back their audit entry with them.
    expect((await call(admin, "POST", "/admin/coupons", { code: "AUDIT10", description: "dup", discountType: "percentage", percentOff: 5 })).statusCode).toBe(409);
    expect((await call(admin, "PATCH", `/admin/coupons/${couponId}`, { endsAt: "2020-01-01T00:00:00.000Z" })).statusCode).toBe(400);
    expect((await call(admin, "PATCH", `/admin/coupons/${couponId}`, { isActive: false })).statusCode).toBe(200);
    expect((await call(admin, "PATCH", `/admin/coupons/${couponId}`, { isActive: false })).statusCode).toBe(200);

    const campaign = await call(admin, "POST", "/admin/campaigns", { slug: "audit-drop", placement: "home_panel", title: "Drop", startsAt: new Date().toISOString() });
    expect(campaign.statusCode, campaign.body).toBe(201);
    const campaignId = campaign.json<{ id: string }>().id;
    await call(admin, "PATCH", `/admin/campaigns/${campaignId}`, { status: "published" });

    const entries = await auditRows();
    expect(entries.map((entry) => entry.action)).toEqual(["coupon.create", "coupon.update", "campaign.create", "campaign.update"]);
    expect(entries[0]!.changes).toMatchObject({ code: { from: null, to: "AUDIT10" }, percentOff: { from: null, to: 10 } });
    expect(entries[0]!.changes).not.toHaveProperty("updatedAt");
    expect(entries[1]!.changes).toEqual({ isActive: { from: true, to: false } });
    expect(entries[3]!.changes).toEqual({ status: { from: "draft", to: "published" } });
  });

  it("records operator order transitions with the note, and nothing for refused ones", async () => {
    const buyer = await account();
    const [order] = await db
      .insert(orders)
      .values({
        userId: buyer.id,
        status: "paid",
        customerName: "Fã de Rock",
        customerEmail: buyer.email,
        shippingAddress: {
          recipientName: "Fã de Rock", recipientDocument: "52998224725", recipientPhone: "11987654321", postalCode: "01310100",
          street: "Avenida Paulista", number: "1000", complement: null, district: "Bela Vista", city: "São Paulo", state: "SP",
        },
        shippingProvider: "fixture",
        shippingServiceId: "1",
        shippingServiceName: "PAC",
        shippingCarrier: "Correios",
        shippingDeliveryDaysMin: 3,
        shippingDeliveryDaysMax: 6,
        subtotalMinor: 10000,
        discountMinor: 0,
        shippingMinor: 1500,
        totalMinor: 11500,
        reservationExpiresAt: new Date(Date.now() + 3_600_000),
        paidAt: new Date(),
      })
      .returning();

    expect((await call(admin, "POST", `/admin/orders/${order!.id}/transitions`, { to: "delivered" })).statusCode).toBe(409);
    const moved = await call(admin, "POST", `/admin/orders/${order!.id}/transitions`, { to: "in_fulfillment", note: "separando" });
    expect(moved.statusCode, moved.body).toBe(200);

    const entries = await auditRows();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      action: "order.transition",
      resourceType: "order",
      resourceId: order!.id,
      changes: { status: { from: "paid", to: "in_fulfillment" } },
      metadata: { orderNumber: order!.number, note: "separando" },
    });
    // Personal data of the order never reaches the trail.
    expect(JSON.stringify(entries)).not.toMatch(/52998224725|11987654321|Paulista|example\.com/);
  });

  it("filters and paginates the trail", async () => {
    const target = await account();
    for (const roles of [["operator"], ["content_editor"], ["customer"]] as Role[][]) {
      await call(admin, "PUT", `/admin/users/${target.id}/roles`, { roles });
    }
    await call(admin, "POST", "/admin/coupons", { code: "FILTER5", description: "x", discountType: "percentage", percentOff: 5 });

    const forUser = (await call(admin, "GET", `/admin/audit-logs?resourceType=user&resourceId=${target.id}`)).json<Page<AuditLogEntry>>();
    expect(forUser.data.map((entry) => entry.changes?.roles?.to)).toEqual([["customer"], ["content_editor"], ["operator"]]);
    expect(forUser.data[0]!.actor).toMatchObject({ userId: admin.id, name: expect.any(String) as string });

    const coupons = (await call(admin, "GET", "/admin/audit-logs?action=coupon.create")).json<Page<AuditLogEntry>>();
    expect(coupons.data).toHaveLength(1);

    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const page: Page<AuditLogEntry> = (await call(admin, "GET", `/admin/audit-logs?limit=1${cursor ? `&cursor=${cursor}` : ""}`)).json();
      seen.push(...page.data.map((entry) => entry.id));
      cursor = page.pageInfo.nextCursor;
    } while (cursor);
    expect(seen).toHaveLength(4);
    expect(new Set(seen).size).toBe(4);

    const future = new Date(Date.now() + 60_000).toISOString();
    expect((await call(admin, "GET", `/admin/audit-logs?from=${future}`)).json<Page<AuditLogEntry>>().data).toHaveLength(0);
    expect((await call(admin, "GET", `/admin/audit-logs?to=${future}`)).json<Page<AuditLogEntry>>().data).toHaveLength(4);
    expect((await call(admin, "GET", "/admin/audit-logs?cursor=bm9wZQ")).statusCode).toBe(400);
  });

  it("keeps e-mails out of the logs of admin operations", async () => {
    const target = await account();
    logs.lines.length = 0;
    await call(admin, "PUT", `/admin/users/${target.id}/roles`, { roles: ["operator"] });
    await call(admin, "GET", `/admin/users?email=${encodeURIComponent(target.email)}`);
    expect(logs.raw()).not.toContain(target.email);
  });
});
