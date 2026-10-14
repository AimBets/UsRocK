import { z } from "zod";
import { permissions, roles } from "../auth/auth.types.js";
import { PASSWORD_MAX_LENGTH, passwordSchema, tokenSchema } from "./security.js";

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("E-mail inválido.").max(254, "E-mail muito longo."));

export const registerBodySchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    name: z.string().trim().min(1, "Informe seu nome.").max(120),
    acceptTerms: z.literal(true, "É necessário aceitar os Termos de Uso e a Política de Privacidade."),
    marketingEmailOptIn: z.boolean().default(false).describe("Consentimento opcional para receber e-mails de marketing."),
  })
  .refine((body) => body.password.toLowerCase() !== body.email, {
    message: "A senha não pode ser igual ao e-mail.",
    path: ["password"],
  });

export const loginBodySchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});

export const forgotPasswordBodySchema = z.object({ email: emailSchema });

export const resetPasswordBodySchema = z.object({ token: tokenSchema, password: passwordSchema });

export const changePasswordBodySchema = z.object({
  currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  newPassword: passwordSchema,
});

export const currentUserSchema = z
  .object({
    id: z.uuid(),
    email: z.string(),
    name: z.string(),
    roles: z.array(z.enum(roles)),
    permissions: z.array(z.enum(permissions)).describe("Permissões administrativas efetivas (vazio para clientes)."),
    emailVerified: z.boolean(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: "CurrentUser" });

export const userResponseSchema = z.object({ user: currentUserSchema }).meta({ id: "UserResponse" });

export const acceptedResponseSchema = z.object({ message: z.string() }).meta({ id: "AcceptedResponse" });

export type CurrentUser = z.infer<typeof currentUserSchema>;
