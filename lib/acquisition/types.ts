import type { AcquisitionProfile } from './profiles';

export type AcquisitionErrorReason = 'blocked' | 'empty' | 'unreachable' | 'unsafe_target' | 'too_large';

export interface AcquisitionResult {
  title: string;
  text: string;
  sourceUrl: string;
  finalUrl: string;
  contentType: string | null;
  byteLength: number;
  providerName: string;
  httpStatus: number | null;
  truncated: boolean;
}

export interface AcquisitionProvider {
  name: string;
  supports(profile: AcquisitionProfile): boolean;
  fetch(url: URL, profile: AcquisitionProfile, signal: AbortSignal): Promise<AcquisitionResult>;
}

export interface AcquisitionAttempt {
  provider: string;
  result?: AcquisitionResult;
  errorReason?: AcquisitionErrorReason;
  httpStatus?: number | null;
  latencyMs: number;
  isShadow: boolean;
}

export interface AcquisitionContext {
  /** Persists audit data without coupling providers to Supabase. */
  onAttempt?: (attempt: AcquisitionAttempt) => Promise<void> | void;
}

export class AcquisitionError extends Error {
  constructor(public readonly reason: AcquisitionErrorReason, message: string) {
    super(message);
    this.name = 'AcquisitionError';
  }
}
