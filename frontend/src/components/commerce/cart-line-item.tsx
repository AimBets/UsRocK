"use client";

import Image from "next/image";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { formatMoney } from "@/lib/format";
import type { CartLine } from "@/types/commerce";
import { QuantityControl } from "./quantity-control";

export function CartLineItem({ line, compact = false, onQuantity, onRemove }: { line: CartLine; compact?: boolean; onQuantity: (value: number) => void; onRemove: () => void }) {
  const lineTotal = { amountMinor: line.variant.price.amountMinor * line.quantity, currencyCode: line.variant.price.currencyCode };
  return (
    <article className={`cart-line ${compact ? "is-compact" : ""}`}>
      <Link className="cart-line-image" href={`/produto/${line.product.slug}`}>
        {line.product.image ? <Image alt={line.product.image.alt} fill sizes={compact ? "96px" : "144px"} src={line.product.image.url} unoptimized={line.product.image.url.startsWith("http")} /> : <span>Sem imagem</span>}
      </Link>
      <div className="cart-line-content">
        <div>
          <Link className="cart-line-name" href={`/produto/${line.product.slug}`}>{line.product.name}</Link>
          <p className="cart-line-meta">Tamanho {line.variant.size}{line.variant.color ? ` · ${line.variant.color}` : ""}</p>
          {line.product.isDemo && <span className="commerce-demo-label">Catálogo demonstrativo</span>}
        </div>
        <div className="cart-line-actions">
          <QuantityControl label={`Quantidade de ${line.product.name}`} onChange={onQuantity} quantity={line.quantity} />
          <button className="remove-line" onClick={onRemove} type="button"><Trash2 size={15} /> Remover</button>
        </div>
      </div>
      <div className="cart-line-price">
        <strong>{formatMoney(lineTotal)}</strong>
        {line.quantity > 1 && <span>{formatMoney(line.variant.price)} cada</span>}
      </div>
    </article>
  );
}
