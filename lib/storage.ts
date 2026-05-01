import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

const s3 = new S3Client({
  region: process.env.S3_REGION ?? "us-east-1",
  endpoint: process.env.S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: true, // necesario para MinIO
})

const BUCKET = process.env.S3_BUCKET_NAME!
const PUBLIC_URL = (process.env.S3_PUBLIC_URL ?? "").replace(/\/$/, "")

// ─── Key helpers ──────────────────────────────────────────────────────────────

/**
 * Genera la key S3 para una variante de asset.
 * variant: "original" | "thumb" | "web" | "high" | "watermarked"
 */
export function assetKey(
  studioId: string,
  galleryId: string,
  assetId: string,
  variant: string,
  ext: string
): string {
  return `studios/${studioId}/galleries/${galleryId}/assets/${assetId}/${variant}.${ext}`
}

export function brandingKey(studioId: string, type: "logo" | "watermark", ext: string): string {
  return `studios/${studioId}/branding/${type}.${ext}`
}

export function pdfKey(studioId: string, type: "contracts" | "invoices", entityId: string): string {
  return `studios/${studioId}/${type}/${entityId}/document.pdf`
}

export function zipKey(studioId: string, downloadId: string): string {
  return `studios/${studioId}/zips/${downloadId}/download.zip`
}

// ─── Presigned URLs ───────────────────────────────────────────────────────────

/** Presigned URL para upload directo — expira en 10 min */
export async function getUploadUrl(key: string, contentType: string): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
  })
  return getSignedUrl(s3, command, { expiresIn: 600 })
}

/** Presigned URL para descarga privada — expira en 15 min */
export async function getDownloadUrl(key: string, filename?: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ResponseContentDisposition: filename
      ? `attachment; filename="${encodeURIComponent(filename)}"`
      : undefined,
  })
  return getSignedUrl(s3, command, { expiresIn: 900 })
}

/** URL pública para variantes servidas via CDN (sin firma) */
export function publicUrl(key: string): string {
  return `${PUBLIC_URL}/${key}`
}

/** Eliminar un objeto de S3 */
export async function deleteObject(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
}

// ─── Objeto legacy (para backward-compat si algo lo importa) ─────────────────
export const storage = {
  getUploadUrl,
  getDownloadUrl,
  publicUrl,
  deleteObject,
  assetKey,
  brandingKey,
  pdfKey,
  zipKey,
  s3,
  BUCKET,
}
