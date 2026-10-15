"use client";

import Image from "next/image";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { formatMoney } from "@/lib/format";
import type { CartLine } from "@/types/commerce";
import { QuantityControl } from "./quantity-control";

const issueLabels = {
  unavailable: "Item indisponível para venda.",
  out_of_stock: "Sem estoque no momento.",
  insufficient_stock: "Quantidade ajustável ao estoque atual.",
  price_changed: "O preço mudou desde sua última alteração.",
} as const;

export function CartLineItem({ line, compact = false, disabled = false, onQuantity, onRemove }: { line: CartLine; compact?: boolean; disabled?: boolean; onQuantity: (value: number) => void; onRemove: () => void }) {
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
          <QuantityControl disabled={disabled} label={`Quantidade de ${line.product.name}`} maxQuantity={line.maxQuantity} onChange={onQuantity} quantity={line.quantity} />
          <button className="remove-line" disabled={disabled} onClick={onRemove} type="button"><Trash2 size={15} /> Remover</button>
        </div>
        {line.issues.map((issue) => <p className="cart-item-issue" key={issue}>{issueLabels[issue]}{issue === "price_changed" && line.previousUnitPrice ? ` Antes: ${formatMoney(line.previousUnitPrice)}.` : ""}</p>)}
      </div>
      <div className="cart-line-price">
        <strong>{formatMoney(line.lineTotal)}</strong>
        {line.quantity > 1 && <span>{formatMoney(line.unitPrice)} cada</span>}
      </div>
    </article>
  );
}
