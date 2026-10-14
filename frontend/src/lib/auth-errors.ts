import { ApiError } from "@/lib/api/client";

export function authErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof ApiError)) return fallback;
  if (error.code === "UNAUTHENTICATED") return "E-mail ou senha inválidos.";
  if (error.code === "FORBIDDEN") return "Sua conta não tem permissão para concluir esta ação.";
  if (error.code === "CONFLICT") return "Já existe uma conta com este e-mail.";
  if (error.code === "RATE_LIMITED") {
    return error.retryAfter ? `Muitas tentativas. Tente novamente em ${error.retryAfter} segundos.` : "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
  }
  if (error.code === "SERVICE_UNAVAILABLE" || error.status >= 500) return "O serviço de contas está temporariamente indisponível.";
  return error.message || fallback;
}

export function fieldError(error: unknown, field: string, code?: string) {
  if (!(error instanceof ApiError)) return undefined;
  const detail = error.details?.find((item) => item.path === `body.${field}` && (!code || item.code === code));
  return detail?.code;
}
