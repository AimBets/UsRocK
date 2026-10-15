"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import type { ProductDetail } from "@/types/catalog";
import { formatMoney } from "@/lib/format";
import { toCommerceSnapshot } from "@/types/commerce";
import { useStorefront } from "./storefront-provider";

export function ProductOptions({ product }: { product: ProductDetail }) {
  const firstAvailable = useMemo(() => product.variants.find((item) => item.availability !== "out_of_stock"), [product.variants]);
  const [variantId, setVariantId] = useState(firstAvailable?.id ?? product.variants[0]?.id ?? "");
  const [message, setMessage] = useState("");
  const { addToCart } = useStorefront();
  const variant = product.variants.find((item) => item.id === variantId);

  function add() {
    if (!variant || variant.availability === "out_of_stock") return;
    addToCart(toCommerceSnapshot(product), variant.id);
    setMessage(`${product.name}, tamanho ${variant.size}, foi adicionado à prévia da sacola.`);
  }

  return (
    <div className="mt-8">
      {variant && (
        <div className="flex flex-wrap items-baseline gap-3">
          <strong className="text-2xl text-white">{formatMoney(variant.price)}</strong>
          {variant.compareAtPrice && <span className="text-sm text-stone-500 line-through">{formatMoney(variant.compareAtPrice)}</span>}
        </div>
      )}
      <fieldset className="mt-7">
        <legend className="eyebrow mb-3">Escolha o tamanho</legend>
        <div className="flex flex-wrap gap-2">
          {product.variants.map((item) => (
            <button
              aria-pressed={variantId === item.id}
              className={`size-button min-w-11 ${variantId === item.id ? "is-active" : ""}`}
              disabled={item.availability === "out_of_stock"}
              key={item.id}
              onClick={() => { setVariantId(item.id); setMessage(""); }}
              type="button"
            >
              {item.size}
            </button>
          ))}
        </div>
      </fieldset>
      <p className="mt-4 text-xs text-stone-400">
        {variant?.availability === "low_stock" ? "Baixa disponibilidade." : variant?.availability === "out_of_stock" ? "Tamanho indisponível." : "Disponível."}
        {product.isDemo ? " Preço e estoque ilustrativos do ambiente de desenvolvimento." : ""}
      </p>
      <button className="button-primary mt-6 w-full" disabled={!variant || variant.availability === "out_of_stock"} onClick={add} type="button">
        Adicionar à sacola <Plus size={17} />
      </button>
      <p aria-live="polite" className="mt-3 min-h-5 text-xs text-copper">{message}</p>
    </div>
  );
}
