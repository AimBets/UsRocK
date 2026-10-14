// Demonstration catalog mirroring the storefront mock in frontend/src/data/storefront.ts.
// Prices and stock levels are illustrative only (every product is flagged `isDemo`); images are
// the original assets served by the frontend from /public/images.

export interface DemoProduct {
  slug: string;
  name: string;
  description: string;
  collection: string;
  label: string;
  tone: "black" | "graphite" | "bone";
  priceMinor: number;
  compareAtPriceMinor?: number;
  image: string;
  imageAlt: string;
  /** Stock per size, in the order sizes should appear. */
  stock: Record<string, number>;
}

export const demoCategory = {
  slug: "camisetas",
  name: "Camisetas",
  description: "Camisetas autorais inspiradas no rock e no metal (catálogo demonstrativo).",
};

export const demoCollections = [
  { slug: "nocturne-series", title: "Nocturne Series", description: "Coleção demonstrativa de peças escuras com arte noturna.", position: 0 },
  { slug: "ritual-collection", title: "Ritual Collection", description: "Coleção demonstrativa com estampas de inspiração ritualística.", position: 1 },
  { slug: "noise-division", title: "Noise Division", description: "Coleção demonstrativa com grafismos de ruído e onda sonora.", position: 2 },
];

const IMAGE_SIZE = 1254;
export const demoImageSize = { width: IMAGE_SIZE, height: IMAGE_SIZE };

/** Ordered newest first, matching the "Lançamentos" section of the homepage mock. */
export const demoProducts: DemoProduct[] = [
  {
    slug: "nocturne-wings-oversized",
    name: "Nocturne Wings Oversized",
    description: "Camiseta oversized preta com arte original de asas prateadas. Produto demonstrativo.",
    collection: "nocturne-series",
    label: "DROP CONCEITO",
    tone: "black",
    priceMinor: 12990,
    image: "/images/product-raven.png",
    imageAlt: "Camiseta preta oversized com arte original de asas prateadas",
    stock: { P: 8, M: 12, G: 10, GG: 4 },
  },
  {
    slug: "eclipse-serpent-heavy-tee",
    name: "Eclipse Serpent Heavy Tee",
    description: "Camiseta grafite de malha pesada com arte original de serpente e eclipse. Produto demonstrativo.",
    collection: "ritual-collection",
    label: "PREÇO EXEMPLO",
    tone: "graphite",
    priceMinor: 13990,
    compareAtPriceMinor: 15990,
    image: "/images/product-serpent.png",
    imageAlt: "Camiseta grafite oversized com arte original de serpente e eclipse",
    stock: { P: 6, M: 9, G: 7, GG: 3, XG: 2 },
  },
  {
    slug: "static-star-essential",
    name: "Static Star Essential",
    description: "Camiseta clara com arte original geométrica e onda sonora. Produto demonstrativo.",
    collection: "noise-division",
    label: "CAPSULE CONCEITO",
    tone: "bone",
    priceMinor: 11990,
    image: "/images/product-static.png",
    imageAlt: "Camiseta clara oversized com arte original geométrica e onda sonora",
    stock: { P: 5, M: 10, G: 6, GG: 0 },
  },
  {
    slug: "iron-bloom-heavy-tee",
    name: "Iron Bloom Heavy Tee",
    description: "Camiseta preta de malha pesada com arte original abstrata em cobre. Produto demonstrativo.",
    collection: "ritual-collection",
    label: "CAPSULE CONCEITO",
    tone: "black",
    priceMinor: 14990,
    image: "/images/products/iron-bloom.png",
    imageAlt: "Camiseta preta oversized com arte original abstrata em cobre",
    stock: { P: 4, M: 7, G: 5, GG: 2 },
  },
  {
    slug: "moon-static-washed-tee",
    name: "Moon Static Washed Tee",
    description: "Camiseta carvão lavada com lua crescente e onda sonora originais. Produto demonstrativo.",
    collection: "noise-division",
    label: "PREÇO EXEMPLO",
    tone: "graphite",
    priceMinor: 12990,
    compareAtPriceMinor: 14990,
    image: "/images/products/moon-static.png",
    imageAlt: "Camiseta carvão lavada com lua crescente e onda sonora originais",
    stock: { P: 0, M: 3, G: 2, GG: 1, XG: 0 },
  },
  {
    slug: "black-signal-essential",
    name: "Black Signal Essential",
    description: "Camiseta preta com estampa geométrica original em prata envelhecida. Produto demonstrativo.",
    collection: "nocturne-series",
    label: "DROP CONCEITO",
    tone: "bone",
    priceMinor: 11990,
    image: "/images/products/black-signal.png",
    imageAlt: "Camiseta preta com estampa geométrica original em prata envelhecida",
    stock: { P: 9, M: 11, G: 8, GG: 5 },
  },
];

export function demoSku(slug: string, size: string): string {
  return `DEMO-${slug.toUpperCase()}-${size.toUpperCase()}`;
}
