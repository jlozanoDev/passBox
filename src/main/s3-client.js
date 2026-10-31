import { S3Client } from '@aws-sdk/client-s3';

/**
 * S3-compatible client factory (S1): every field is user-provided BYO
 * configuration — endpoint, region and static credentials — with no
 * OAuth, no consent screen and no token refresh. Path-style addressing
 * stays on by default so Backblaze B2, Cloudflare R2 and MinIO work
 * with the same build as AWS S3.
 *
 * @param {{
 *   endpoint: string,
 *   region: string,
 *   accessKeyId: string,
 *   secretAccessKey: string,
 *   forcePathStyle?: boolean,
 * }} config
 */
export function createS3Client({
  endpoint,
  region,
  accessKeyId,
  secretAccessKey,
  forcePathStyle = true,
}) {
  return new S3Client({
    endpoint,
    region,
    forcePathStyle,
    credentials: { accessKeyId, secretAccessKey },
  });
}
