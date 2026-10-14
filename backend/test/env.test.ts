import { describe, expect, it } from "vitest";
import { EnvValidationError, loadEnv } from "../src/config/env.js";

const base = { DATABASE_URL: "postgres://user:s3cret-value@db.internal:5432/usrock" };
const production = { ...base, NODE_ENV: "production", APP_PUBLIC_URL: "https://usrock.com.br" };

describe("loadEnv", () => {
  it("applies safe defaults", () => {
    const env = loadEnv(base);
    expect(env).toMatchObject({
      NODE_ENV: "development",
      HOST: "127.0.0.1",
      PORT: 3333,
      CORS_ORIGINS: [],
      TRUST_PROXY: false,
      API_DOCS_ENABLED: true,
    });
  });

  it("requires DATABASE_URL and reports it by name", () => {
    expect(() => loadEnv({})).toThrowError(EnvValidationError);
    try {
      loadEnv({ DATABASE_URL: "" });
    } catch (error) {
      expect((error as EnvValidationError).issues).toEqual([{ variable: "DATABASE_URL", message: "obrigatória" }]);
    }
  });

  it("never echoes variable values in the error message", () => {
    const secret = "mysql://root:super-secret-password@host/db";
    let message = "";
    try {
      loadEnv({ DATABASE_URL: secret, PORT: "not-a-port" });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("DATABASE_URL");
    expect(message).toContain("PORT");
    expect(message).not.toContain("super-secret-password");
    expect(message).not.toContain("not-a-port");
  });

  it("parses and normalises the CORS allowlist", () => {
    const env = loadEnv({ ...base, CORS_ORIGINS: "http://localhost:3000/, https://usrock.com.br" });
    expect(env.CORS_ORIGINS).toEqual(["http://localhost:3000", "https://usrock.com.br"]);
    expect(() => loadEnv({ ...base, CORS_ORIGINS: "javascript:alert(1)" })).toThrowError(/CORS_ORIGINS/);
  });

  it("disables API docs by default in production and enforces https origins", () => {
    const env = loadEnv({ ...production, CORS_ORIGINS: "https://usrock.com.br" });
    expect(env.API_DOCS_ENABLED).toBe(false);
    expect(() => loadEnv({ ...production, CORS_ORIGINS: "http://usrock.com.br" })).toThrowError(/CORS_ORIGINS/);
    expect(() => loadEnv({ ...production, LOG_LEVEL: "debug" })).toThrowError(/LOG_LEVEL/);
  });

  it("secures session cookies and public links in production", () => {
    expect(loadEnv(base).SESSION_COOKIE_SECURE).toBe(false);
    expect(loadEnv(production).SESSION_COOKIE_SECURE).toBe(true);
    expect(() => loadEnv({ ...production, SESSION_COOKIE_SECURE: "false" })).toThrowError(/SESSION_COOKIE_SECURE/);
    expect(() => loadEnv({ ...production, APP_PUBLIC_URL: "http://usrock.com.br" })).toThrowError(/APP_PUBLIC_URL/);
  });

  it("validates SMTP credentials and session windows", () => {
    expect(() => loadEnv({ ...base, SMTP_USER: "apikey" })).toThrowError(/SMTP_PASSWORD/);
    expect(loadEnv({ ...base, SMTP_USER: "apikey", SMTP_PASSWORD: "x" }).SMTP_USER).toBe("apikey");
    expect(() => loadEnv({ ...base, SESSION_TTL_DAYS: "7", SESSION_IDLE_DAYS: "14" })).toThrowError(/SESSION_IDLE_DAYS/);
  });

  it("parses booleans strictly", () => {
    expect(loadEnv({ ...base, TRUST_PROXY: "true" }).TRUST_PROXY).toBe(true);
    expect(loadEnv({ ...base, TRUST_PROXY: "0" }).TRUST_PROXY).toBe(false);
    expect(() => loadEnv({ ...base, TRUST_PROXY: "yes" })).toThrowError(/TRUST_PROXY/);
  });
});
