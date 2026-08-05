import 'server-only';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { serverEnv } from '@/lib/env';

// Private S3 client for presigned direct-to-S3 upload/download. Bytes never transit
// the app server: the browser PUTs/GETs directly against S3 using a short-lived
// presigned URL minted here. Bucket is private (all public access blocked, SSE at
// rest, TLS-only bucket policy, versioning + lifecycle expiry) — see infra notes in
// the PR description. Least-privilege IAM: this key can only PutObject/GetObject/
// DeleteObject/ListBucket on the one bucket below, nothing else in the AWS account.

export function hasS3(): boolean {
  return Boolean(serverEnv.s3Bucket && serverEnv.awsAccessKeyId && serverEnv.awsSecretAccessKey);
}

let cached: S3Client | null = null;

export function getS3Client(): S3Client {
  if (!hasS3()) {
    throw new Error(
      'S3 is not configured. Set AWS_REGION, S3_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY.',
    );
  }
  if (cached) return cached;
  cached = new S3Client({
    region: serverEnv.awsRegion,
    credentials: {
      accessKeyId: serverEnv.awsAccessKeyId,
      secretAccessKey: serverEnv.awsSecretAccessKey,
    },
  });
  return cached;
}

export const S3_BUCKET = () => serverEnv.s3Bucket;

// Presigned URL expiry. Short window: the URL is single-use in intent (one upload,
// one download) and minted right before the client acts on it.
const PRESIGN_EXPIRY_SECONDS = 300; // 5 minutes

export interface PresignedPut {
  url: string;
  key: string;
  expiresInSeconds: number;
}

// Mints a presigned PUT URL for a new object. Caller supplies the fully-built key
// (already scoped to e.g. `<property_id>/<stay_id>/...` by the route calling this —
// this module does not enforce prefix scoping, the presign route does).
export async function createPresignedPutUrl(params: {
  key: string;
  contentType: string;
  contentLengthBytes?: number;
}): Promise<PresignedPut> {
  const client = getS3Client();
  const command = new PutObjectCommand({
    Bucket: S3_BUCKET(),
    Key: params.key,
    ContentType: params.contentType,
    ...(params.contentLengthBytes ? { ContentLength: params.contentLengthBytes } : {}),
  });
  const url = await getSignedUrl(client, command, { expiresIn: PRESIGN_EXPIRY_SECONDS });
  return { url, key: params.key, expiresInSeconds: PRESIGN_EXPIRY_SECONDS };
}

export async function createPresignedGetUrl(key: string): Promise<string> {
  const client = getS3Client();
  const command = new GetObjectCommand({ Bucket: S3_BUCKET(), Key: key });
  return getSignedUrl(client, command, { expiresIn: PRESIGN_EXPIRY_SECONDS });
}

export async function deleteObject(key: string): Promise<void> {
  const client = getS3Client();
  await client.send(new DeleteObjectCommand({ Bucket: S3_BUCKET(), Key: key }));
}

// Server-side object write. Used by the cover-image pipeline, which must resize
// with Sharp before storing, so those bytes necessarily transit the app server
// (unlike the presigned direct-upload path above). Keys are always built by the
// caller from trusted parts — never from raw client input.
export async function putObject(params: {
  key: string;
  body: Buffer;
  contentType: string;
  cacheControl?: string;
}): Promise<void> {
  const client = getS3Client();
  await client.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET(),
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
      ...(params.cacheControl ? { CacheControl: params.cacheControl } : {}),
    }),
  );
}

// Server-side object read. The bucket is private, so guest-visible assets are
// streamed through an app route rather than linked directly.
export async function getObjectBytes(key: string): Promise<{ body: Buffer; contentType: string } | null> {
  const client = getS3Client();
  try {
    const res = await client.send(new GetObjectCommand({ Bucket: S3_BUCKET(), Key: key }));
    if (!res.Body) return null;
    const bytes = await res.Body.transformToByteArray();
    return { body: Buffer.from(bytes), contentType: res.ContentType ?? 'application/octet-stream' };
  } catch (e) {
    const name = (e as { name?: string } | null)?.name ?? '';
    if (name === 'NoSuchKey' || name === 'NotFound') return null;
    throw e;
  }
}
