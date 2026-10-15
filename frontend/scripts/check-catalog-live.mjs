import assert from "node:assert/strict";

const apiOrigin = (process.env.USROCK_API_ORIGIN ?? "http://127.0.0.1:3333").replace(/\/$/, "");
const storefrontOrigin = (process.env.USROCK_STOREFRONT_ORIGIN ?? "http://localhost:3000").replace(/\/$/, "");
const expectedSlugs = [
  "nocturne-wings-oversized",
  "eclipse-serpent-heavy-tee",
  "static-star-essential",
  "iron-bloom-heavy-tee",
  "moon-static-washed-tee",
  "black-signal-essential",
];

async function response(url) {
  const result = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  assert.equal(result.status, 200, `${url} deveria responder 200, recebeu ${result.status}`);
  return result;
}

async function catalogAt(origin) {
  const result = await response(`${origin}/api/v1/products?limit=12`);
  const body = await result.json();
  assert.equal(body.data.length, 6, `${origin} deveria expor os 6 produtos do seed`);
  assert.deepEqual(body.data.map((product) => product.slug), expectedSlugs);
  for (const product of body.data) {
    assert.ok(product.primaryMedia?.url, `${product.slug} precisa de imagem principal`);
    assert.ok(product.variants.length > 0, `${product.slug} precisa de variantes`);
  }
  return body.data;
}

const directProducts = await catalogAt(apiOrigin);
const rewrittenProducts = await catalogAt(storefrontOrigin);
assert.deepEqual(rewrittenProducts.map((product) => product.id), directProducts.map((product) => product.id), "o rewrite deve preservar os produtos da API");

for (const route of ["/", "/catalogo"]) {
  const html = await (await response(`${storefrontOrigin}${route}`)).text();
  for (const product of directProducts) {
    assert.match(html, new RegExp(product.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${route} deve renderizar ${product.name}`);
    assert.ok(html.includes(product.primaryMedia.url), `${route} deve referenciar a imagem de ${product.slug}`);
  }
}

for (const product of directProducts) {
  const detailHtml = await (await response(`${storefrontOrigin}/produto/${product.slug}`)).text();
  assert.ok(detailHtml.includes(product.name), `o detalhe deve renderizar ${product.name}`);
  assert.ok(detailHtml.includes(product.primaryMedia.url), `o detalhe deve referenciar a imagem de ${product.slug}`);
  const image = await response(`${storefrontOrigin}${product.primaryMedia.url}`);
  assert.match(image.headers.get("content-type") ?? "", /^image\//, `${product.primaryMedia.url} deve responder como imagem`);
  assert.ok((await image.arrayBuffer()).byteLength > 0, `${product.primaryMedia.url} não pode estar vazia`);
}

for (const [route, marker] of [["/carrinho", "Sua sacola."], ["/favoritos", "Favoritos."]]) {
  const html = await (await response(`${storefrontOrigin}${route}`)).text();
  assert.ok(html.includes(marker), `${route} deve continuar disponível após a recuperação do catálogo`);
}

console.log(`Catálogo ao vivo validado: ${directProducts.length} produtos, ${directProducts.length} detalhes e ${directProducts.length} imagens; homepage, catálogo, rewrite, carrinho e favoritos operacionais.`);
