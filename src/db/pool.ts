import pg from "pg";
import { databaseUrl } from "./config.js";

const pool = new pg.Pool({ connectionString: databaseUrl });

pool.on("error", (error) => {
  console.error("[postgres] idle client error (pool will reconnect):", error.message);
});

export function db() {
  return pool;
}

export async function waitForDb(tries = 40) {
  let lastError: unknown;
  for (let attempt = 0; attempt < tries; attempt += 1) {
    try {
      await pool.query("SELECT 1");
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Postgres is not reachable");
}
