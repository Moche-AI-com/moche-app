// Redacting logger. Never emit secrets, OTPs, full access codes, service-role keys,
// complete guest identifiers, or raw private documents.

const SENSITIVE_KEY = /(password|passwd|secret|token|otp|code_hash|service_role|api[_-]?key|authorization|cookie|ssn|card|cvv|contact(?!_hash)|email|phone)/i;

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const LONG_DIGITS_RE = /\b\d{5,}\b/g;
const BEARER_RE = /\b(sk|rk|sb|pk|whsec|Bearer)[-_A-Za-z0-9]{6,}\b/g;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[depth]';
  if (value == null) return value;
  if (typeof value === 'string') return redactString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY.test(k)) {
        out[k] = '[redacted]';
      } else {
        out[k] = redact(v, depth + 1);
      }
    }
    return out;
  }
  return '[unserializable]';
}

export function redactString(s: string): string {
  return s
    .replace(BEARER_RE, '[redacted-token]')
    .replace(EMAIL_RE, '[redacted-email]')
    .replace(LONG_DIGITS_RE, (m) => `***${m.slice(-2)}`);
}

type Level = 'debug' | 'info' | 'warn' | 'error';

function emit(level: Level, msg: string, meta?: Record<string, unknown>) {
  const line = {
    level,
    msg: redactString(msg),
    ...(meta ? { meta: redact(meta) } : {}),
    ts: new Date().toISOString(),
  };
  const serialized = JSON.stringify(line);
  if (level === 'error') console.error(serialized);
  else if (level === 'warn') console.warn(serialized);
  else console.log(serialized);
}

export const log = {
  debug: (msg: string, meta?: Record<string, unknown>) => {
    if (process.env.NODE_ENV !== 'production') emit('debug', msg, meta);
  },
  info: (msg: string, meta?: Record<string, unknown>) => emit('info', msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => emit('warn', msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => emit('error', msg, meta),
};
