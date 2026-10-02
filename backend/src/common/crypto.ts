import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

/** 32 random bytes, base64url — the raw session/reset token. */
export const generateToken = (): string => randomBytes(32).toString('base64url');

/** Deterministic SHA-256 hex digest; used to store tokens at rest. */
export const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

/** Constant time string comparison for secrets. */
export const safeEquals = (a: string, b: string): boolean => {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
};

/** 6 digit numeric one-time code (email / phone verification). */
export const generateNumericCode = (): string => String(randomInt(100_000, 999_999));

/** Unambiguous alphabet: no O/0, I/1 to keep codes readable over the phone. */
const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

const randomCode = (length: number): string => {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)];
  }
  return out;
};

/** Human readable order reference, e.g. `TK-7QF2M9KD`. */
export const generateOrderCode = (): string => `TK-${randomCode(8)}`;

/** URL friendly slug base; Persian characters are kept as-is. */
export const slugify = (input: string): string =>
  input
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^\p{L}\p{N}-]+/gu, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);

/** Appends a short random suffix so slugs stay unique without a retry loop. */
export const uniqueSlug = (input: string): string => {
  const base = slugify(input);
  return base.length > 0 ? `${base}-${randomCode(5).toLowerCase()}` : randomCode(8).toLowerCase();
};
