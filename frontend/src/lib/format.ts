import type { Money } from "@/types/catalog";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatMoney(money: Money) {
  if (!Number.isInteger(money.amountMinor)) throw new Error("Money.amountMinor deve ser um inteiro em centavos.");
  return brl.format(money.amountMinor / 100);
}

export function formatPriceRange(min: Money, max: Money) {
  return min.amountMinor === max.amountMinor ? formatMoney(min) : `${formatMoney(min)} – ${formatMoney(max)}`;
}
