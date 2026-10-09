import dotenv from "dotenv";

dotenv.config();

export const databaseUrl = process.env.DATABASE_URL ?? "postgres://vbs:vbs@127.0.0.1:5432/vbs";

export const s3 = {
  endpoint: process.env.S3_ENDPOINT ?? "http://127.0.0.1:9000",
  region: process.env.S3_REGION ?? "us-east-1",
  accessKey: process.env.S3_ACCESS_KEY ?? "vbs",
  secretKey: process.env.S3_SECRET_KEY ?? "vbssecret",
  bucket: process.env.S3_BUCKET ?? "vbs",
  publicUrl: (process.env.S3_PUBLIC_URL ?? "/files").replace(/\/$/, ""),
};
