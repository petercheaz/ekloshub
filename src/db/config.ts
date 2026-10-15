import dotenv from "dotenv";

dotenv.config();

function envTrim(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

const isProduction = process.env.NODE_ENV === "production";

export const databaseUrl = process.env.DATABASE_URL ?? "postgres://vbs:vbs@127.0.0.1:5432/vbs";

/** Local dev defaults to s3mock; production uses native AWS S3 when S3_ENDPOINT is unset. */
export const s3 = {
  endpoint: envTrim("S3_ENDPOINT") ?? (isProduction ? undefined : "http://127.0.0.1:9000"),
  region: envTrim("S3_REGION") ?? "us-east-1",
  accessKey: envTrim("S3_ACCESS_KEY") ?? (isProduction ? undefined : "vbs"),
  secretKey: envTrim("S3_SECRET_KEY") ?? (isProduction ? undefined : "vbssecret"),
  bucket: envTrim("S3_BUCKET") ?? "vbs",
  publicUrl: (envTrim("S3_PUBLIC_URL") ?? "/files").replace(/\/$/, ""),
};

export function s3UsesCustomEndpoint() {
  return Boolean(s3.endpoint);
}
