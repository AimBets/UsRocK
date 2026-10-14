import type {
  AcceptedResponse,
  ChangePasswordRequest,
  CurrentUser,
  ForgotPasswordRequest,
  LoginRequest,
  RegisterRequest,
  ResetPasswordRequest,
  UserResponse,
} from "@/types/auth";
import { apiRequest } from "./client";

const jsonRequest = (body?: object): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  ...(body ? { body: JSON.stringify(body) } : {}),
});

export async function register(input: RegisterRequest): Promise<CurrentUser> {
  return (await apiRequest<UserResponse>("/api/v1/auth/register", jsonRequest(input))).user;
}

export async function login(input: LoginRequest): Promise<CurrentUser> {
  return (await apiRequest<UserResponse>("/api/v1/auth/login", jsonRequest(input))).user;
}

export function logout() {
  return apiRequest<void>("/api/v1/auth/logout", jsonRequest());
}

export async function getCurrentUser(): Promise<CurrentUser> {
  return (await apiRequest<UserResponse>("/api/v1/me")).user;
}

export function forgotPassword(input: ForgotPasswordRequest) {
  return apiRequest<AcceptedResponse>("/api/v1/auth/password/forgot", jsonRequest(input));
}

export function resetPassword(input: ResetPasswordRequest) {
  return apiRequest<void>("/api/v1/auth/password/reset", jsonRequest(input));
}

export function changePassword(input: ChangePasswordRequest) {
  return apiRequest<void>("/api/v1/me/password", jsonRequest(input));
}
