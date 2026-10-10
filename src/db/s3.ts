import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { s3 } from "./config.js";

export const s3Client = new S3Client({
  region: s3.region,
  endpoint: s3.endpoint,
  forcePathStyle: true,
  credentials: {
    accessKeyId: s3.accessKey,
    secretAccessKey: s3.secretKey,
  },
});

export function objectUrl(key: string) {
  if (!key) {
    return "";
  }
  return `${s3.publicUrl}/${key}`;
}

export async function ensureBucket() {
  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: s3.bucket }));
  } catch {
    await s3Client.send(new CreateBucketCommand({ Bucket: s3.bucket }));
  }
}

export async function getObject(key: string) {
  return s3Client.send(new GetObjectCommand({ Bucket: s3.bucket, Key: key }));
}

export async function waitForS3(tries = 40) {
  let lastError: unknown;
  for (let attempt = 0; attempt < tries; attempt += 1) {
    try {
      await ensureBucket();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("S3 is not reachable");
}

export async function putObject(key: string, body: Buffer, contentType: string) {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: s3.bucket,
      Key: key,
      Body: body,
      ContentType: contentType || "application/octet-stream",
    }),
  );
  return objectUrl(key);
}

export function parseDataUrl(dataUrl: string) {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl);
  if (!match) {
    return null;
  }
  return { contentType: match[1], bytes: Buffer.from(match[2], "base64") };
}

export async function storeUpload(
  prefix: string,
  file: { name: string; type: string; size: number; dataUrl: string },
) {
  const parsed = parseDataUrl(file.dataUrl);
  if (!parsed) {
    return { name: file.name, type: file.type, size: file.size, objectKey: "" };
  }
  const safeName = file.name.replace(/[^\w.-]+/g, "-") || "file";
  const objectKey = `${prefix}/${crypto.randomUUID()}-${safeName}`;
  await putObject(objectKey, parsed.bytes, parsed.contentType || file.type);
  return { name: file.name, type: file.type || parsed.contentType, size: file.size, objectKey };
}
