/**
 * API access layer.
 *
 * Every call goes through `/api/v1/*` on the website origin, which Next.js
 * forwards to the Nest API (see `next.config.ts`). Because the browser only
 * ever sees one origin, the session cookie is always first party and no CORS
 * preflight happens.
 *
 * The API answers failures with a single envelope:
 *   { error: { code, message, details?, requestId } }
 * which is re-thrown here as `ApiError` so pages can render Persian messages
 * and map field errors back onto form inputs.
 */
import { normalizeDigits } from '@taskeno/contracts';

export const API_PREFIX = '/api/v1';

export type ApiErrorEnvelope = {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
};

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly requestId?: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, requestId?: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.details = details;
  }

  /**
   * `{ 'field.path': 'message' }` from the shared Zod schemas, so forms can
   * show the error next to the offending input instead of in a generic toast.
   */
  get fieldErrors(): Record<string, string> {
    const result: Record<string, string> = {};
    if (!Array.isArray(this.details)) return result;
    for (const issue of this.details) {
      if (issue && typeof issue === 'object' && 'message' in issue) {
        const path = 'path' in issue && typeof issue.path === 'string' ? issue.path : '';
        const message = String((issue as { message: unknown }).message);
        if (!result[path]) result[path] = message;
      }
    }
    return result;
  }
}

export type ApiRequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  /**
   * Required for anything that moves money or creates an order: the server
   * refuses the call without it, which is what makes retries safe.
   */
  idempotencyKey?: string;
  /** Raw body, used by the multipart image upload. */
  rawBody?: BodyInit;
  signal?: AbortSignal;
};

/** One key per logical user action (not per retry). */
export function newIdempotencyKey(prefix = 'web'): string {
  const uuid =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(16).slice(2) + Date.now().toString(16);
  return `${prefix}-${uuid}`;
}

const parseError = async (response: Response): Promise<ApiError> => {
  let code = 'INTERNAL_ERROR';
  let message = 'خطایی رخ داد. لطفاً دوباره تلاش کنید.';
  let details: unknown;
  let requestId: string | undefined;

  try {
    const payload = (await response.json()) as ApiErrorEnvelope;
    if (payload?.error) {
      code = payload.error.code ?? code;
      message = payload.error.message ?? message;
      details = payload.error.details;
      requestId = payload.error.requestId;
    }
  } catch {
    // A non-JSON body (proxy error, HTML 502) falls through to the generic
    // message above rather than surfacing raw markup to the user.
  }

  return new ApiError(response.status, code, message, requestId, details);
};

export async function apiFetch<T = unknown>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { method = 'GET', body, headers, idempotencyKey, rawBody, signal } = options;

  const requestHeaders: Record<string, string> = { accept: 'application/json', ...headers };

  let payload: BodyInit | undefined;
  if (rawBody !== undefined) {
    payload = rawBody;
  } else if (body !== undefined) {
    payload = JSON.stringify(body);
    requestHeaders['content-type'] = 'application/json';
  }

  if (idempotencyKey) requestHeaders['idempotency-key'] = idempotencyKey;

  const response = await fetch(`${API_PREFIX}${path}`, {
    method,
    headers: requestHeaders,
    body: payload,
    credentials: 'include',
    cache: 'no-store',
    signal,
  });

  if (!response.ok) throw await parseError(response);

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export const api = {
  get: <T>(path: string, options?: ApiRequestOptions) => apiFetch<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: ApiRequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, options?: ApiRequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown, options?: ApiRequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'PUT', body }),
  delete: <T>(path: string, options?: ApiRequestOptions) => apiFetch<T>(path, { ...options, method: 'DELETE' }),
};

/** Builds a query string, dropping empty values so URLs stay readable. */
export function qs(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const rendered = search.toString();
  return rendered ? `?${rendered}` : '';
}

/**
 * Converts a user typed amount (Persian digits, separators, optional "تومان")
 * into the integer Rial string the API expects. Returns null when unusable.
 */
export function toTomanInputRial(raw: string): string | null {
  const cleaned = normalizeDigits(raw)
    .replace(/[٬,\s]/g, '')
    .replace(/تومان|ریال/g, '')
    .trim();
  if (!/^\d{1,18}$/.test(cleaned)) return null;
  // The form collects Toman because that is what users read in Iran.
  const rial = BigInt(cleaned) * 10n;
  if (rial <= 0n) return null;
  return rial.toString();
}
