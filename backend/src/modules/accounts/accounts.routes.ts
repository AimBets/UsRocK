import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import type { Env } from "../../config/env.js";
import type { Db } from "../../db/client.js";
import { errorResponseSchema, errors } from "../../shared/errors.js";
import { createWindowLimiter, limitBy } from "../../shared/window-limiter.js";
import { requireAuth } from "../auth/auth.plugin.js";
import type { Mailer } from "../mail/mailer.js";
import {
  acceptedResponseSchema,
  changePasswordBodySchema,
  forgotPasswordBodySchema,
  loginBodySchema,
  registerBodySchema,
  resetPasswordBodySchema,
  userResponseSchema,
} from "./accounts.contracts.js";
import {
  authenticate,
  changePassword,
  findActiveUser,
  registerCustomer,
  requestPasswordReset,
  resetPassword,
  toCurrentUser,
  type AccountsDeps,
} from "./accounts.service.js";
import { clearSessionCookie, revokeSession, setSessionCookie } from "./sessions.js";

export interface AccountsRoutesOptions {
  db: Db;
  env: Env;
  mailer: Mailer;
}

const WINDOW = 15 * 60_000;
const noContent = z.null().describe("Sem conteúdo.");
const sessionSecurity = [{ sessionCookie: [] }];

/** Per-account key; the body has already been validated, so `email` is normalised. */
const emailKey = (request: { body: unknown }) => (request.body as { email: string }).email;

export const accountsRoutes: FastifyPluginAsyncZod<AccountsRoutesOptions> = async (app, { db, env, mailer }) => {
  const deps = (log: AccountsDeps["log"]): AccountsDeps => ({ db, env, mailer, log });
  const perIp = { rateLimit: { max: env.AUTH_RATE_LIMIT_MAX, timeWindow: WINDOW } };
  // Per-email limits on top of the per-IP ones: stop credential stuffing and mail bombing that
  // rotate IP addresses against a single account.
  const perEmailLogin = limitBy(createWindowLimiter({ max: env.AUTH_RATE_LIMIT_MAX, windowMs: WINDOW }), emailKey);
  const perEmailReset = limitBy(createWindowLimiter({ max: 3, windowMs: WINDOW }), emailKey);

  app.post(
    "/auth/register",
    {
      config: perIp,
      schema: {
        tags: ["accounts"],
        summary: "Cria conta de cliente e inicia sessão",
        description: "Define o cookie de sessão `httpOnly`. Registra consentimentos (termos, privacidade, marketing por e-mail).",
        body: registerBodySchema,
        response: { 201: userResponseSchema, 409: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const { user, token } = await registerCustomer(deps(request.log), request.body);
      setSessionCookie(reply, token, env);
      return reply.status(201).send({ user: toCurrentUser(user) });
    },
  );

  app.post(
    "/auth/login",
    {
      config: perIp,
      preHandler: perEmailLogin,
      schema: {
        tags: ["accounts"],
        summary: "Inicia sessão com e-mail e senha",
        description: "Credenciais inválidas, conta inexistente ou desativada retornam o mesmo 401.",
        body: loginBodySchema,
        response: { 200: userResponseSchema, 401: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const { user, token } = await authenticate(deps(request.log), request.body);
      setSessionCookie(reply, token, env);
      return { user: toCurrentUser(user) };
    },
  );

  app.post(
    "/auth/logout",
    {
      schema: {
        tags: ["accounts"],
        summary: "Encerra a sessão atual (idempotente)",
        response: { 204: noContent },
      },
    },
    async (request, reply) => {
      if (request.principal) await revokeSession(db, request.principal.sessionId);
      clearSessionCookie(reply, env);
      return reply.status(204).send(null);
    },
  );

  app.post(
    "/auth/password/forgot",
    {
      config: perIp,
      preHandler: perEmailReset,
      schema: {
        tags: ["accounts"],
        summary: "Solicita link de redefinição de senha",
        description: "Resposta idêntica exista ou não a conta. O link expira em 60 minutos e é de uso único.",
        body: forgotPasswordBodySchema,
        response: { 202: acceptedResponseSchema },
      },
    },
    async (request, reply) => {
      await requestPasswordReset(deps(request.log), request.body.email);
      return reply.status(202).send({ message: "Se houver uma conta com este e-mail, enviaremos as instruções em instantes." });
    },
  );

  app.post(
    "/auth/password/reset",
    {
      config: perIp,
      schema: {
        tags: ["accounts"],
        summary: "Define nova senha a partir do token recebido por e-mail",
        description: "Encerra todas as sessões do usuário; é necessário entrar novamente.",
        body: resetPasswordBodySchema,
        response: { 204: noContent },
      },
    },
    async (request, reply) => {
      await resetPassword(deps(request.log), request.body);
      return reply.status(204).send(null);
    },
  );

  app.get(
    "/me",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["accounts"],
        summary: "Usuário da sessão atual, papéis e permissões",
        description: "401 quando não há sessão válida (visitante).",
        security: sessionSecurity,
        response: { 200: userResponseSchema, 401: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const user = await findActiveUser(db, request.principal!.userId);
      if (!user) throw errors.unauthenticated();
      reply.header("cache-control", "no-store");
      return { user: toCurrentUser(user) };
    },
  );

  app.post(
    "/me/password",
    {
      config: perIp,
      preHandler: requireAuth,
      schema: {
        tags: ["accounts"],
        summary: "Altera a senha (encerra as demais sessões)",
        security: sessionSecurity,
        body: changePasswordBodySchema,
        response: { 204: noContent, 401: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const principal = request.principal!;
      await changePassword(deps(request.log), { userId: principal.userId, sessionId: principal.sessionId, ...request.body });
      return reply.status(204).send(null);
    },
  );
};
