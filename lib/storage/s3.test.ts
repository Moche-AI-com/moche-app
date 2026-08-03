import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendMock = vi.fn().mockResolvedValue({});
const getSignedUrlMock = vi.fn().mockResolvedValue('https://signed.example.com/put');

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn().mockImplementation(() => ({ send: sendMock })),
  PutObjectCommand: vi.fn().mockImplementation((input: unknown) => ({ input })),
  GetObjectCommand: vi.fn().mockImplementation((input: unknown) => ({ input })),
  DeleteObjectCommand: vi.fn().mockImplementation((input: unknown) => ({ input })),
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: getSignedUrlMock,
}));

vi.mock('@/lib/env', () => ({
  serverEnv: {
    awsRegion: 'us-east-2',
    s3Bucket: 'moche-ai-storage-798359705563',
    awsAccessKeyId: 'AKIATEST',
    awsSecretAccessKey: 'secret',
  },
}));

const { hasS3, createPresignedPutUrl, createPresignedGetUrl, deleteObject, S3_BUCKET } = await import('./s3');

describe('s3 storage wrapper (configured)', () => {
  beforeEach(() => {
    getSignedUrlMock.mockClear();
    sendMock.mockClear();
  });

  it('reports configured when all env vars are present', () => {
    expect(hasS3()).toBe(true);
  });

  it('exposes the configured bucket name', () => {
    expect(S3_BUCKET()).toBe('moche-ai-storage-798359705563');
  });

  it('mints a presigned PUT url scoped to the given key', async () => {
    const result = await createPresignedPutUrl({
      key: 'properties/p1/abc.jpg',
      contentType: 'image/jpeg',
      contentLengthBytes: 1024,
    });
    expect(result.url).toBe('https://signed.example.com/put');
    expect(result.key).toBe('properties/p1/abc.jpg');
    expect(result.expiresInSeconds).toBe(300);
    expect(getSignedUrlMock).toHaveBeenCalledTimes(1);
  });

  it('mints a presigned GET url for a key', async () => {
    const url = await createPresignedGetUrl('properties/p1/abc.jpg');
    expect(url).toBe('https://signed.example.com/put');
    expect(getSignedUrlMock).toHaveBeenCalledTimes(1);
  });

  it('deletes an object via the S3 client', async () => {
    await deleteObject('properties/p1/abc.jpg');
    expect(sendMock).toHaveBeenCalledTimes(1);
  });
});
