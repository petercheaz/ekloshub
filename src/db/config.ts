import dotenv from "dotenv";

dotenv.config();

function envTrim(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

const isProduction = process.env.NODE_ENV === "production";

function requireEnv(name: string): string {
  const value = envTrim(name);
  if (!value) {
    throw new Error(`Set ${name} in .env`);
  }
  return value;
}

export const databaseUrl = requireEnv("DATABASE_URL");

/** Local dev uses S3_ENDPOINT (s3mock); production uses native AWS S3 when S3_ENDPOINT is unset. */
export const s3 = {
  endpoint: envTrim("S3_ENDPOINT") ?? (isProduction ? undefined : "http://127.0.0.1:9000"),
  region: envTrim("S3_REGION") ?? "us-east-1",
  accessKey: envTrim("S3_ACCESS_KEY"),
  secretKey: envTrim("S3_SECRET_KEY"),
  bucket: envTrim("S3_BUCKET") ?? "vbs",
  publicUrl: (envTrim("S3_PUBLIC_URL") ?? "/files").replace(/\/$/, ""),
};

export function s3UsesCustomEndpoint() {
  return Boolean(s3.endpoint);
}
