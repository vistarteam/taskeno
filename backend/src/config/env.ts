import path from 'node:path';
import fs from 'node:fs';
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

/**
 * Environment contract.
 *
 * Every configuration value is validated at boot. A missing or malformed
 * critical value stops the process immediately instead of failing later at
 * runtime with a confusing error. No secret ever lives in source code.
 */

const candidateEnvFiles = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(__dirname, '../../.env'), // backend/.env
  path.resolve(__dirname, '../../../.env'), // repository root .env
];

for (const file of candidateEnvFiles) {
  if (fs.existsSync(file)) {
    loadDotenv({ path: file, override: false, quiet: true });
  }
}

const booleanish = z
  .union([z.boolean(), z.string()])
  .transform((value) => {
    if (typeof value === 'boolean') return value;
    return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
  });

const csv = z
  .string()
  .default('')
  .transform((value) =>
    value
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean),
  );

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  APP_URL: z.string().default('http://localhost:3000'),
  CORS_ORIGINS: csv,

  DATABASE_URL: z.string().default(''),
  PGLITE_DIR: z.string().default('.data/pglite'),

  SESSION_COOKIE_NAME: z.string().min(3).default('tk_session'),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  SESSION_IDLE_TTL_HOURS: z.coerce.number().int().min(1).max(8760).default(720),
  COOKIE_SECURE: booleanish.default(false),

  CURRENCY: z.string().length(3).default('IRR'),
  COMMISSION_DEFAULT_BPS: z.coerce.number().int().min(0).max(10000).default(1000),

  ORDER_ACCEPT_DEADLINE_HOURS: z.coerce.number().int().min(1).max(720).default(48),
  ORDER_AUTO_COMPLETE_DAYS: z.coerce.number().int().min(1).max(60).default(7),
  PAYMENT_EXPIRY_MINUTES: z.coerce.number().int().min(1).max(180).default(15),

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('var/uploads'),
  UPLOAD_MAX_BYTES: z.coerce.number().int().min(1024).default(2 * 1024 * 1024),
  UPLOAD_MAX_PER_SERVICE: z.coerce.number().int().min(1).max(50).default(12),

  PAYMENT_PROVIDER: z.enum(['sandbox', 'zarinpal']).default('sandbox'),
  ZARINPAL_MERCHANT_ID: z.string().default(''),

  FEATURE_P2P_TRANSFERS: booleanish.default(true),
  FEATURE_WITHDRAWALS: booleanish.default(false),
  FEATURE_SMS: booleanish.default(false),

  JOBS_POLL_INTERVAL_MS: z.coerce.number().int().min(200).max(60000).default(2000),
  JOBS_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(10),

  LOG_LEVEL: z.enum(['silent', 'fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type AppEnv = z.infer<typeof envSchema>;

export class EnvValidationError extends Error {}

/**
 * Blank values and `PORT=0` (injected by some hosts to mean "any free port")
 * are treated as unset so the documented defaults apply instead of failing
 * validation with a confusing message.
 */
const normalizeSource = (source: NodeJS.ProcessEnv): NodeJS.ProcessEnv => {
  const cleaned: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(source)) {
    if (typeof value !== 'string') {
      cleaned[key] = value;
      continue;
    }
    if (value.trim() === '') continue;
    if (key === 'PORT' && value.trim() === '0') continue;
    cleaned[key] = value;
  }
  return cleaned;
};

export const parseEnv = (source: NodeJS.ProcessEnv = process.env): AppEnv => {
  const parsed = envSchema.safeParse(normalizeSource(source));
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new EnvValidationError(`Invalid environment configuration:\n${details}`);
  }

  const value = parsed.data;

  if (value.NODE_ENV === 'production') {
    const problems: string[] = [];
    if (!value.DATABASE_URL) problems.push('DATABASE_URL is required in production');
    if (!value.COOKIE_SECURE) problems.push('COOKIE_SECURE must be true in production');
    if (value.CORS_ORIGINS.length === 0) problems.push('CORS_ORIGINS must be set in production');
    if (value.FEATURE_P2P_TRANSFERS) {
      // Legal guard rail from the plan: stored-value transfers require a
      // payment licence / licensed PSP partner. Refuse to start misconfigured.
      problems.push('FEATURE_P2P_TRANSFERS must stay disabled in production until compliance approves it');
    }
    if (problems.length > 0) {
      throw new EnvValidationError(`Unsafe production configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    }
  }

  return value;
};

export const env: AppEnv = parseEnv();

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

/** Absolute path of the embedded development database directory. */
export const pgliteDir = path.isAbsolute(env.PGLITE_DIR)
  ? env.PGLITE_DIR
  : path.resolve(process.cwd(), env.PGLITE_DIR);

export const storageLocalDir = path.isAbsolute(env.STORAGE_LOCAL_DIR)
  ? env.STORAGE_LOCAL_DIR
  : path.resolve(process.cwd(), env.STORAGE_LOCAL_DIR);
