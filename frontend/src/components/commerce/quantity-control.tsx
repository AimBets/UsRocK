"use client";

import { Minus, Plus } from "lucide-react";
export function QuantityControl({ quantity, maxQuantity, onChange, label, disabled = false }: { quantity: number; maxQuantity: number; onChange: (value: number) => void; label: string; disabled?: boolean }) {
  return (
    <div className="quantity-control" aria-label={label}>
      <button aria-label="Diminuir quantidade" disabled={disabled || quantity <= 1} onClick={() => onChange(quantity - 1)} type="button"><Minus size={14} /></button>
      <output aria-live="polite" aria-label={`${quantity} unidades`}>{quantity}</output>
      <button aria-label="Aumentar quantidade" disabled={disabled || quantity >= maxQuantity} onClick={() => onChange(quantity + 1)} type="button"><Plus size={14} /></button>
    </div>
  );
}
