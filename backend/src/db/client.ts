import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema/index.js";

export type Db = NodePgDatabase<typeof schema>;

export interface Database {
  db: Db;
  pool: pg.Pool;
  /** Cheap round-trip used by the health check. */
  ping(): Promise<void>;
  close(): Promise<void>;
}

export interface DatabaseOptions {
  poolMax?: number;
  /** Called for errors on idle clients; without a listener `pg` would crash the process. */
  onPoolError?: (error: Error) => void;
}

export function createDatabase(connectionString: string, options: DatabaseOptions = {}): Database {
  const pool = new pg.Pool({
    connectionString,
    max: options.poolMax ?? 10,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    // Guards against runaway queries holding connections; long jobs must opt in explicitly.
    statement_timeout: 15_000,
    application_name: "usrock-backend",
  });
  pool.on("error", (error) => options.onPoolError?.(error));

  const db = drizzle(pool, { schema, casing: "snake_case" });

  return {
    db,
    pool,
    async ping() {
      await pool.query("select 1");
    },
    async close() {
      await pool.end();
    },
  };
}
