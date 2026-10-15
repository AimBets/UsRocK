import assert from "node:assert/strict";
import test from "node:test";
import { calculateLocalCartTotals, commerceReducer, initialCommerceState, MAX_PREVIEW_QUANTITY, parseStoredCommerce } from "../src/lib/commerce-state.ts";
import type { CommerceProductSnapshot } from "../src/types/commerce.ts";

const product: CommerceProductSnapshot = {
  id: "product-1",
  slug: "produto-teste",
  name: "Produto Teste",
  isDemo: true,
  image: null,
  variants: [{ id: "variant-1", sku: "TEST-P", size: "P", color: null, price: { amountMinor: 12990, currencyCode: "BRL" }, compareAtPrice: null, availability: "in_stock" }],
};

test("adiciona a variante e acumula quantidade sem ultrapassar o limite local", () => {
  let state = commerceReducer(initialCommerceState, { type: "add", product, variantId: "variant-1" });
  for (let index = 0; index < 20; index += 1) state = commerceReducer(state, { type: "add", product, variantId: "variant-1" });
  assert.equal(state.cartLines.length, 1);
  assert.equal(state.cartLines[0].quantity, MAX_PREVIEW_QUANTITY);
});

test("calcula quantidade e subtotal em centavos sem usar ponto flutuante", () => {
  const state = commerceReducer(initialCommerceState, { type: "add", product, variantId: "variant-1" });
  const updated = commerceReducer(state, { type: "quantity", lineId: state.cartLines[0].id, quantity: 3 });
  assert.deepEqual(calculateLocalCartTotals(updated.cartLines), { itemCount: 3, subtotal: { amountMinor: 38970, currencyCode: "BRL" } });
});

test("favorita e desfavorita o mesmo produto", () => {
  const favorited = commerceReducer(initialCommerceState, { type: "toggleFavorite", product });
  assert.equal(favorited.favorites.length, 1);
  const removed = commerceReducer(favorited, { type: "toggleFavorite", product });
  assert.equal(removed.favorites.length, 0);
});

test("ignora armazenamento inválido sem quebrar a experiência", () => {
  assert.deepEqual(parseStoredCommerce("conteúdo inválido"), initialCommerceState);
});

test("descarta linhas incompletas e limita quantidades restauradas", () => {
  const stored = JSON.stringify({
    cartLines: [
      { id: "forjado", product, variant: product.variants[0], quantity: 99 },
      { product: { id: "quebrado" }, quantity: 1 },
    ],
    favorites: [{ product: { id: "incompleto" } }],
  });
  const restored = parseStoredCommerce(stored);
  assert.equal(restored.cartLines.length, 1);
  assert.equal(restored.cartLines[0].id, "product-1:variant-1");
  assert.equal(restored.cartLines[0].quantity, MAX_PREVIEW_QUANTITY);
  assert.deepEqual(restored.favorites, []);
});

test("preserva carrinho e favoritos válidos e permite remover a linha", () => {
  const withCart = commerceReducer(initialCommerceState, { type: "add", product, variantId: "variant-1" });
  const withFavorite = commerceReducer(withCart, { type: "toggleFavorite", product });
  const restored = parseStoredCommerce(JSON.stringify(withFavorite));
  assert.equal(restored.cartLines[0].variant.id, "variant-1");
  assert.equal(restored.favorites[0].product.id, "product-1");
  const removed = commerceReducer(restored, { type: "remove", lineId: restored.cartLines[0].id });
  assert.equal(removed.cartLines.length, 0);
  assert.equal(removed.favorites.length, 1);
});
