import "server-only";
import { redirect } from "next/navigation";
import type { CurrentUser, UserResponse } from "@/types/auth";
import { ApiError } from "./client";
import { serverApiRequest } from "./server";

export async function getServerCurrentUser(): Promise<CurrentUser | null> {
  try {
    return (await serverApiRequest<UserResponse>("/api/v1/me")).user;
  } catch (error) {
    if (error instanceof ApiError && error.code === "UNAUTHENTICATED") return null;
    throw error;
  }
}

export async function requireServerCurrentUser(next = "/conta"): Promise<CurrentUser> {
  const user = await getServerCurrentUser();
  if (!user) redirect(`/entrar?next=${encodeURIComponent(next)}`);
  return user;
}
