import type { authRequests, components } from "@/types/openapi";

export type CurrentUser = components["schemas"]["CurrentUser"];
export type UserResponse = components["schemas"]["UserResponse"];
export type AcceptedResponse = components["schemas"]["AcceptedResponse"];
export type RegisterRequest = authRequests["register"];
export type LoginRequest = authRequests["login"];
export type ForgotPasswordRequest = authRequests["forgotPassword"];
export type ResetPasswordRequest = authRequests["resetPassword"];
export type ChangePasswordRequest = authRequests["changePassword"];
