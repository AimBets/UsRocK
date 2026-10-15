import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import type { Env } from "../../config/env.js";
import type { Db } from "../../db/client.js";
import { createWindowLimiter, limitBy } from "../../shared/window-limiter.js";
import { acceptedResponseSchema, emailSchema } from "../accounts/accounts.contracts.js";
import { tokenSchema } from "../accounts/security.js";
import type { Mailer } from "../mail/mailer.js";
import { CONFIRMATION_TTL_HOURS, confirmSubscription, requestSubscription, unsubscribe } from "./newsletter.service.js";

export interface NewsletterRoutesOptions {
  db: Db;
  env: Env;
  mailer: Mailer;
}

const WINDOW = 15 * 60_000;
const PER_EMAIL_REQUESTS = 3;

export const newsletterSources = ["footer", "home", "landing_page", "account"] as const;

const subscribeBodySchema = z.object({
  email: emailSchema,
  consent: z
    .literal(true, "É necessário concordar em receber a newsletter.")
    .describe("Aceite explícito de receber e-mails de marketing, conforme a Política de Privacidade. A caixa não pode vir pré-marcada."),
  source: z.enum(newsletterSources).default("footer").describe("Onde o formulário foi exibido."),
});

const tokenBodySchema = z.object({ token: tokenSchema });

const statusResponse = (status: "confirmed" | "unsubscribed") =>
  z.object({ status: z.literal(status) }).meta({ id: status === "confirmed" ? "NewsletterConfirmed" : "NewsletterUnsubscribed" });

const emailKey = (request: { body: unknown }) => (request.body as { email: string }).email;

export const newsletterRoutes: FastifyPluginAsyncZod<NewsletterRoutesOptions> = async (app, { db, env, mailer }) => {
  const perIp = { rateLimit: { max: env.AUTH_RATE_LIMIT_MAX, timeWindow: WINDOW } };
  const perEmail = limitBy(createWindowLimiter({ max: PER_EMAIL_REQUESTS, windowMs: WINDOW }), emailKey);

  app.post(
    "/newsletter/subscriptions",
    {
      config: perIp,
      preHandler: perEmail,
      schema: {
        tags: ["newsletter"],
        summary: "Solicita inscrição (envia e-mail de confirmação; dupla confirmação)",
        description:
          "Responde 202 com a mesma mensagem em todos os casos (já inscrito, pendente ou novo), sem revelar quem está na lista. " +
          `O link de confirmação vale ${CONFIRMATION_TTL_HOURS} h e é de uso único.`,
        body: subscribeBodySchema,
        response: { 202: acceptedResponseSchema },
      },
    },
    async (request, reply) => {
      await requestSubscription({ db, env, mailer, log: request.log }, request.body);
      return reply
        .status(202)
        .send({ message: "Se o e-mail puder ser inscrito, enviaremos um link de confirmação. Verifique sua caixa de entrada." });
    },
  );

  app.post(
    "/newsletter/confirm",
    {
      config: perIp,
      schema: {
        tags: ["newsletter"],
        summary: "Confirma a inscrição com o token do e-mail",
        description: "Token inválido, usado ou expirado: `400` com `details[0].code = invalid_token` em `body.token`.",
        body: tokenBodySchema,
        response: { 200: statusResponse("confirmed") },
      },
    },
    async (request) => {
      await confirmSubscription({ db }, request.body.token);
      return { status: "confirmed" as const };
    },
  );

  app.post(
    "/newsletter/unsubscribe",
    {
      config: perIp,
      schema: {
        tags: ["newsletter"],
        summary: "Cancela a inscrição com o token do link de descadastro (idempotente)",
        body: tokenBodySchema,
        response: { 200: statusResponse("unsubscribed") },
      },
    },
    async (request) => {
      await unsubscribe({ db }, request.body.token);
      return { status: "unsubscribed" as const };
    },
  );
};
