import { readFile, writeFile } from "node:fs/promises";

const source = JSON.parse(await readFile(new URL("../../backend/openapi/openapi.json", import.meta.url), "utf8"));
const selected = ["Availability", "Money", "Media", "CategoryRef", "CollectionRef", "ProductVariant", "ProductSummary", "ProductDetail", "Collection", "Category", "PageInfo", "ErrorDetail", "ErrorResponse", "CurrentUser", "UserResponse", "AcceptedResponse", "Cart", "CartItem", "CartCoupon", "CartItemIssue", "CouponIssue", "CartImportResponse", "Favorite", "FavoriteList", "Campaign", "ActiveCampaigns", "NewsletterConfirmed", "NewsletterUnsubscribed"];
const authRequestPaths = {
  register: ["/api/v1/auth/register", "post"],
  login: ["/api/v1/auth/login", "post"],
  forgotPassword: ["/api/v1/auth/password/forgot", "post"],
  resetPassword: ["/api/v1/auth/password/reset", "post"],
  changePassword: ["/api/v1/me/password", "post"],
};
const commerceRequestPaths = {
  addCartItem: ["/api/v1/cart/items", "post"],
  updateCartItem: ["/api/v1/cart/items/{itemId}", "patch"],
  importCart: ["/api/v1/cart/import", "post"],
  applyCoupon: ["/api/v1/cart/coupon", "put"],
  importFavorites: ["/api/v1/me/favorites/import", "post"],
  subscribeNewsletter: ["/api/v1/newsletter/subscriptions", "post"],
  confirmNewsletter: ["/api/v1/newsletter/confirm", "post"],
  unsubscribeNewsletter: ["/api/v1/newsletter/unsubscribe", "post"],
};

function typeFor(schema) {
  if (!schema) return "unknown";
  if (schema.$ref) return `components["schemas"][${JSON.stringify(schema.$ref.split("/").at(-1))}]`;
  if (Object.hasOwn(schema, "const")) return JSON.stringify(schema.const);
  if (schema.enum) return schema.enum.map((value) => JSON.stringify(value)).join(" | ");
  if (schema.anyOf) return schema.anyOf.map(typeFor).join(" | ");
  if (schema.oneOf) return schema.oneOf.map(typeFor).join(" | ");
  if (Array.isArray(schema.type)) return schema.type.map((type) => typeFor({ ...schema, type })).join(" | ");
  if (schema.type === "array") return `Array<${typeFor(schema.items)}>`;
  if (schema.type === "integer" || schema.type === "number") return "number";
  if (schema.type === "boolean") return "boolean";
  if (schema.type === "string") return "string";
  if (schema.type === "null") return "null";
  if (schema.type === "object" || schema.properties) {
    const required = new Set(schema.required ?? []);
    const fields = Object.entries(schema.properties ?? {}).map(([key, value]) => `      ${JSON.stringify(key)}${required.has(key) ? "" : "?"}: ${typeFor(value)};`);
    return `{\n${fields.join("\n")}\n    }`;
  }
  return "unknown";
}

const schemas = source.components?.schemas ?? {};
for (const name of selected) {
  if (!schemas[name]) throw new Error(`Schema OpenAPI ausente: ${name}`);
}

const body = selected.map((name) => `    ${name}: ${typeFor(schemas[name])};`).join("\n");
const authRequests = Object.entries(authRequestPaths).map(([name, [path, method]]) => {
  const schema = source.paths?.[path]?.[method]?.requestBody?.content?.["application/json"]?.schema;
  if (!schema) throw new Error(`Request body OpenAPI ausente: ${method.toUpperCase()} ${path}`);
  return `  ${name}: ${typeFor(schema)};`;
}).join("\n");
const commerceRequests = Object.entries(commerceRequestPaths).map(([name, [path, method]]) => {
  const schema = source.paths?.[path]?.[method]?.requestBody?.content?.["application/json"]?.schema;
  if (!schema) throw new Error(`Request body OpenAPI ausente: ${method.toUpperCase()} ${path}`);
  return `  ${name}: ${typeFor(schema)};`;
}).join("\n");
const output = `// Gerado por npm run openapi:generate. Não edite manualmente.\nexport interface components {\n  schemas: {\n${body}\n  };\n}\n\nexport interface authRequests {\n${authRequests}\n}\n`;
const finalOutput = output + `\nexport interface commerceRequests {\n${commerceRequests}\n}\n`;
const target = new URL("../src/types/openapi.d.ts", import.meta.url);

if (process.argv.includes("--check")) {
  const current = await readFile(target, "utf8").catch(() => "");
  if (current.replace(/\r\n/g, "\n") !== finalOutput.replace(/\r\n/g, "\n")) {
    throw new Error("Tipos OpenAPI desatualizados. Execute `npm run openapi:generate`.");
  }
} else {
  await writeFile(target, finalOutput, "utf8");
}
