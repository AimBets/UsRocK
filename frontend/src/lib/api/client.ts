import type { ApiErrorResponse } from "@/types/catalog";

const DEFAULT_API_ORIGIN = "http://127.0.0.1:3333";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;
  readonly details?: ApiErrorResponse["error"]["details"];
  readonly retryAfter?: string | null;

  constructor(
    status: number,
    code: string,
    message: string,
    requestId?: string,
    details?: ApiErrorResponse["error"]["details"],
    retryAfter?: string | null,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.details = details;
    this.retryAfter = retryAfter;
  }
}

function apiUrl(path: string) {
  if (!path.startsWith("/api/")) throw new Error("O cliente aceita somente caminhos internos /api/*.");
  if (typeof window !== "undefined") return path;
  const rawOrigin = process.env.USROCK_API_ORIGIN ?? DEFAULT_API_ORIGIN;
  const origin = new URL(rawOrigin);
  if (origin.username || origin.password) throw new Error("USROCK_API_ORIGIN não pode conter credenciais.");
  return new URL(path, `${origin.toString().replace(/\/$/, "")}/`).toString();
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(apiUrl(path), {
      ...init,
      cache: init.cache ?? "no-store",
      credentials: "include",
      headers: { Accept: "application/json", ...init.headers },
      signal: init.signal ?? controller.signal,
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as ApiErrorResponse | null;
      throw new ApiError(
        response.status,
        body?.error.code ?? (response.status >= 500 ? "SERVICE_UNAVAILABLE" : "UNKNOWN_ERROR"),
        body?.error.message ?? "Não foi possível concluir a solicitação.",
        body?.error.requestId ?? response.headers.get("x-request-id") ?? undefined,
        body?.error.details,
        response.headers.get("retry-after"),
      );
    }

    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    const message = error instanceof DOMException && error.name === "AbortError"
      ? "A API demorou demais para responder."
      : "A loja está temporariamente sem conexão com o catálogo.";
    throw new ApiError(503, "SERVICE_UNAVAILABLE", message);
  } finally {
    clearTimeout(timeout);
  }
}
