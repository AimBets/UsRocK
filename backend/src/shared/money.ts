import { z } from "zod";

/**
 * Monetary amount in integer minor units (centavos). Floats are never used for money:
 * R$ 129,90 is `{ amountMinor: 12990, currencyCode: "BRL" }`.
 */
export const moneySchema = z
  .object({
    amountMinor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).describe("Valor em centavos."),
    currencyCode: z.literal("BRL").describe("ISO 4217. A loja opera somente em BRL."),
  })
  .meta({ id: "Money" });

export type Money = z.infer<typeof moneySchema>;

export function brl(amountMinor: number): Money {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) {
    throw new RangeError("amountMinor deve ser um inteiro não negativo em centavos.");
  }
  return { amountMinor, currencyCode: "BRL" };
}

export function addMoney(a: Money, b: Money): Money {
  return brl(a.amountMinor + b.amountMinor);
}

/** Multiplies a unit price by a quantity, staying in integer arithmetic. */
export function multiplyMoney(unit: Money, quantity: number): Money {
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    throw new RangeError("quantity deve ser um inteiro não negativo.");
  }
  return brl(unit.amountMinor * quantity);
}
