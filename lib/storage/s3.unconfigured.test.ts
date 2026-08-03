import { describe, it, expect, vi } from 'vitest';

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(),
  PutObjectCommand: vi.fn(),
  GetObjectCommand: vi.fn(),
  DeleteObjectCommand: vi.fn(),
}));
vi.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: vi.fn() }));

// No AWS_* / S3_BUCKET set — mirrors a fresh environment before PR #3's env vars land.
vi.mock('@/lib/env', () => ({
  serverEnv: { awsRegion: 'us-east-2', s3Bucket: '', awsAccessKeyId: '', awsSecretAccessKey: '' },
}));

const { hasS3, getS3Client } = await import('./s3');

describe('s3 storage wrapper (unconfigured)', () => {
  it('reports not configured when bucket/keys are missing', () => {
    expect(hasS3()).toBe(false);
  });

  it('throws a clear error instead of constructing a client with empty credentials', () => {
    expect(() => getS3Client()).toThrow(/S3 is not configured/);
  });
});
