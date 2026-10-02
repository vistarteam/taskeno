import { ERROR_CODES, ERROR_MESSAGES_FA, type ErrorCode } from '@taskeno/contracts';

export { ERROR_CODES };
export type { ErrorCode };

/**
 * Every expected failure is an `AppError` carrying a machine readable code.
 * Unexpected failures become a generic 500 so internal details never leak to
 * the client: the full error is logged with the request id instead.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, options: { message?: string; status?: number; details?: unknown } = {}) {
    super(options.message ?? ERROR_MESSAGES_FA[code]);
    this.name = 'AppError';
    this.code = code;
    this.status = options.status ?? statusForCode(code);
    this.details = options.details;
  }
}

const STATUS_BY_CODE: Partial<Record<ErrorCode, number>> = {
  VALIDATION_FAILED: 400,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  FORBIDDEN_RESOURCE: 403,
  FEATURE_DISABLED: 409,
  IDEMPOTENCY_CONFLICT: 409,
  SERVICE_NOT_PURCHASABLE: 409,
  SERVICE_NOT_EDITABLE: 409,
};

const statusForCode = (code: ErrorCode): number => {
  if (STATUS_BY_CODE[code]) return STATUS_BY_CODE[code] as number;
  if (code.startsWith('AUTH_')) return 401;
  return 400;
};

/** Field level validation failure produced by a Zod schema. */
export class ValidationError extends AppError {
  constructor(issues: Array<{ path: (string | number)[]; message: string }>) {
    super(ERROR_CODES.VALIDATION_FAILED, {
      details: issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    });
    this.name = 'ValidationError';
  }
}

export const notFound = (code: ErrorCode = ERROR_CODES.NOT_FOUND, message?: string): AppError =>
  new AppError(code, { status: 404, message });

export const forbidden = (code: ErrorCode = ERROR_CODES.FORBIDDEN_RESOURCE, message?: string): AppError =>
  new AppError(code, { status: 403, message });

export const conflict = (code: ErrorCode, message?: string): AppError => new AppError(code, { status: 409, message });

export const isUniqueViolation = (error: unknown): boolean => {
  const candidate = error as { code?: string; cause?: { code?: string } };
  return candidate?.code === '23505' || candidate?.cause?.code === '23505';
};

export const isCheckViolation = (error: unknown): boolean => {
  const candidate = error as { code?: string; cause?: { code?: string } };
  return candidate?.code === '23514' || candidate?.cause?.code === '23514';
};

/**
 * Errors raised by the database when one of the financial invariants is
 * violated. These are never shown to users verbatim, but they are logged as
 * critical because they mean a code path is wrong.
 */
export const isLedgerInvariantViolation = (error: unknown): boolean => {
  const message = String((error as Error)?.message ?? '');
  return isCheckViolation(error) && message.toLowerCase().includes('ledger');
};
