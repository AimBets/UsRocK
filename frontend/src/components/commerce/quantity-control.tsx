"use client";

import { Minus, Plus } from "lucide-react";
import { MAX_PREVIEW_QUANTITY } from "@/lib/commerce-state";

export function QuantityControl({ quantity, onChange, label }: { quantity: number; onChange: (value: number) => void; label: string }) {
  return (
    <div className="quantity-control" aria-label={label}>
      <button aria-label="Diminuir quantidade" disabled={quantity <= 1} onClick={() => onChange(quantity - 1)} type="button"><Minus size={14} /></button>
      <output aria-live="polite" aria-label={`${quantity} unidades`}>{quantity}</output>
      <button aria-label="Aumentar quantidade" disabled={quantity >= MAX_PREVIEW_QUANTITY} onClick={() => onChange(quantity + 1)} type="button"><Plus size={14} /></button>
    </div>
  );
}
