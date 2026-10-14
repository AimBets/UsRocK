import "server-only";
import { cookies } from "next/headers";
import { apiRequest } from "./client";

/** Encaminha a sessão HttpOnly apenas do servidor Next.js para o Fastify. */
export async function serverApiRequest<T>(path: string, init: RequestInit = {}) {
  const cookieStore = await cookies();
  const cookie = cookieStore.getAll().map(({ name, value }) => `${name}=${value}`).join("; ");
  return apiRequest<T>(path, {
    ...init,
    headers: { ...init.headers, ...(cookie ? { cookie } : {}) },
  });
}
