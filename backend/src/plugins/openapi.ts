import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { jsonSchemaTransform, jsonSchemaTransformObject } from "fastify-type-provider-zod";
import type { Env } from "../config/env.js";
import { SESSION_COOKIE_NAME } from "../modules/auth/auth.types.js";

export interface OpenApiOptions {
  env: Env;
}

/**
 * The OpenAPI document is generated from the Zod route schemas, so it cannot drift from the
 * implementation. It is always built (used by `npm run openapi:generate`), but the interactive
 * UI is only exposed when API_DOCS_ENABLED is true (default: outside production).
 */
export const openApiPlugin = fp<OpenApiOptions>(
  async (app: FastifyInstance, { env }) => {
    await app.register(swagger, {
      openapi: {
        openapi: "3.1.0",
        info: {
          title: "UsRock API",
          version: "0.1.0",
          description:
            "API do backend UsRock. Contrato de referência para o frontend; ver docs/API_CONTRACTS.md. " +
            "Erros seguem o schema `ErrorResponse`; listas seguem `{ data, pageInfo }`; valores monetários usam `Money` em centavos.",
        },
        servers: [{ url: "/", description: "Mesmo host (o Next.js encaminha /api/* para o backend)." }],
        tags: [
          { name: "system", description: "Saúde e metadados do serviço" },
          { name: "catalog", description: "Catálogo público: produtos, coleções e categorias" },
          { name: "accounts", description: "Cadastro, sessão, senha e usuário atual" },
        ],
        components: {
          securitySchemes: {
            sessionCookie: {
              type: "apiKey",
              in: "cookie",
              name: SESSION_COOKIE_NAME,
              description: "Sessão opaca httpOnly emitida por /auth/login e /auth/register.",
            },
          },
        },
      },
      transform: jsonSchemaTransform,
      transformObject: jsonSchemaTransformObject,
    });

    if (env.API_DOCS_ENABLED) {
      await app.register(swaggerUi, {
        routePrefix: "/docs",
        uiConfig: { docExpansion: "list", deepLinking: true },
        // Swagger UI needs inline styles/scripts; override the API-wide `default-src 'none'` only here.
        uiHooks: {
          onRequest: (_request, reply, done) => {
            reply.header(
              "content-security-policy",
              "default-src 'self'; img-src 'self' data: validator.swagger.io; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; frame-ancestors 'none'",
            );
            done();
          },
        },
      });
    }
  },
  { name: "usrock-openapi" },
);
