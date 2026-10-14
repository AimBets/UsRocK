import type { NavigationItem } from "@/types/catalog";

export const navigation: NavigationItem[] = [
  { label: "Novidades", href: "/#novidades", featured: true },
  { label: "Catálogo", href: "/catalogo" },
  { label: "Camisetas", href: "/catalogo?category=camisetas" },
  { label: "Coleções", href: "/#colecoes" },
  { label: "Manifesto", href: "/#manifesto" },
];

export const genres = [
  { name: "Heavy metal", note: "Peso, contraste e presença", code: "HM / 01", image: "/images/genres/heavy-metal.png", imageAlt: "Editorial de moda alternativo em preto e cobre", style: "copper" },
  { name: "Classic rock", note: "Textura analógica e atitude", code: "CR / 02", image: "/images/genres/classic-rock.png", imageAlt: "Editorial original com guitarra sem marca em sala de ensaio", style: "amber" },
  { name: "Grunge", note: "Camadas, ruído e expressão", code: "GR / 03", image: "/images/genres/grunge.png", imageAlt: "Editorial urbano com camisa xadrez e camiseta escura", style: "silver" },
  { name: "Alternative", note: "Novas cenas, novas formas", code: "AL / 04", image: "/images/genres/alternative.png", imageAlt: "Editorial contemporâneo em corredor de arquitetura minimalista", style: "bone" },
];
