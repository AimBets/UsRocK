import { z } from "zod";

/** Brazilian states (UF). */
export const brazilianStates = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;

const digitsOnly = (value: string) => value.replace(/\D/g, "");

/** CPF check digits (Receita Federal algorithm); rejects repeated-digit sequences. */
export function isValidCpf(value: string): boolean {
  const cpf = digitsOnly(value);
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const digit = (length: number) => {
    let sum = 0;
    for (let index = 0; index < length; index += 1) sum += Number(cpf[index]) * (length + 1 - index);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

/** `12345-678` or `12345678` → `12345678`. */
export const postalCodeSchema = z
  .string()
  .trim()
  .transform(digitsOnly)
  .pipe(z.string().regex(/^\d{8}$/, "CEP deve ter 8 dígitos."))
  .describe("CEP com 8 dígitos (pontuação opcional; a resposta usa só dígitos).");

export const cpfSchema = z
  .string()
  .trim()
  .transform(digitsOnly)
  .pipe(z.string().refine(isValidCpf, "CPF inválido."))
  .describe("CPF do destinatário (exigido pelas transportadoras para a etiqueta).");

export const phoneSchema = z
  .string()
  .trim()
  .transform(digitsOnly)
  .pipe(z.string().regex(/^[1-9]{2}\d{8,9}$/, "Telefone com DDD inválido."))
  .describe("Telefone com DDD, 10 ou 11 dígitos.");

/** `12345678909` → `***.***.789-09`: enough for the customer to recognise it. */
export function maskCpf(cpf: string): string {
  return `***.***.${cpf.slice(6, 9)}-${cpf.slice(9, 11)}`;
}

/** `11987654321` → `(11) *****-4321`. */
export function maskPhone(phone: string): string {
  return `(${phone.slice(0, 2)}) ${"*".repeat(phone.length - 6)}-${phone.slice(-4)}`;
}

export function formatPostalCode(postalCode: string): string {
  return `${postalCode.slice(0, 5)}-${postalCode.slice(5)}`;
}
