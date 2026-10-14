import { brl } from "../../shared/money.js";
import { productAvailability, variantAvailability } from "./availability.js";
import type { Category, Collection, ProductDetail, ProductSummary } from "./catalog.contracts.js";
import type { ProductWithRelations } from "./catalog.repository.js";
import type { categories, collections } from "./catalog.schema.js";

type MediaRow = ProductWithRelations["media"][number];

function toMedia(media: MediaRow) {
  return { url: media.url, alt: media.alt, width: media.width, height: media.height };
}

function toBase(product: ProductWithRelations) {
  const variants = product.variants.map((variant) => ({
    id: variant.id,
    sku: variant.sku,
    size: variant.size,
    color: variant.color,
    price: brl(variant.priceMinor),
    compareAtPrice: variant.compareAtPriceMinor === null ? null : brl(variant.compareAtPriceMinor),
    availability: variantAvailability(variant.inventory),
  }));
  const prices = product.variants.map((variant) => variant.priceMinor);
  if (prices.length === 0) {
    // Repository queries only return products with active variants; reaching this is a bug.
    throw new Error(`product ${product.id} has no active variants`);
  }

  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    label: product.label,
    tone: product.tone,
    isDemo: product.isDemo,
    category:
      product.category?.isActive === true
        ? { id: product.category.id, slug: product.category.slug, name: product.category.name }
        : null,
    collections: product.collections
      .filter((link) => link.collection.status === "published")
      .map(({ collection }) => ({ id: collection.id, slug: collection.slug, title: collection.title })),
    priceRange: { min: brl(Math.min(...prices)), max: brl(Math.max(...prices)) },
    availability: productAvailability(variants.map((variant) => variant.availability)),
    variants,
  };
}

export function toProductSummary(product: ProductWithRelations): ProductSummary {
  const [first] = product.media;
  return { ...toBase(product), primaryMedia: first ? toMedia(first) : null };
}

export function toProductDetail(product: ProductWithRelations): ProductDetail {
  if (!product.publishedAt) throw new Error(`active product ${product.id} has no publishedAt`);
  return {
    ...toBase(product),
    description: product.description,
    media: product.media.map(toMedia),
    seo: { title: product.seoTitle ?? product.name, description: product.seoDescription },
    publishedAt: product.publishedAt.toISOString(),
  };
}

export function toCollection(row: typeof collections.$inferSelect): Collection {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    heroMedia: row.heroMediaUrl && row.heroMediaAlt ? { url: row.heroMediaUrl, alt: row.heroMediaAlt } : null,
  };
}

export function toCategory(row: typeof categories.$inferSelect): Category {
  return { id: row.id, slug: row.slug, name: row.name, description: row.description, parentId: row.parentId };
}
