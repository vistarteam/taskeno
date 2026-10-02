'use client';

/**
 * Minimal data-fetching hooks.
 *
 * The website talks to the API through Next's rewrite (`/api/v1/*`), so the
 * session cookie is always first party. A tiny hand-written hook is enough here
 * and keeps the dependency list small; it covers the three things every page
 * needs: load, reload after a mutation, and cancel on unmount.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, apiFetch, type ApiRequestOptions } from './api';

export type Resource<T> = {
  data: T | undefined;
  error: ApiError | undefined;
  loading: boolean;
  /** Re-runs the request; call it after a mutation changes the same resource. */
  reload: () => void;
  setData: (next: T) => void;
};

const toApiError = (error: unknown): ApiError =>
  error instanceof ApiError
    ? error
    : new ApiError(0, 'NETWORK_ERROR', 'ارتباط با سرور برقرار نشد. اتصال خود را بررسی کنید.');

/** GETs `path` (relative to `/api/v1`) and keeps the result in state. */
export function useResource<T>(path: string | null, deps: unknown[] = []): Resource<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<ApiError | undefined>(undefined);
  const [loading, setLoading] = useState<boolean>(Boolean(path));
  const [nonce, setNonce] = useState(0);
  const pathRef = useRef(path);
  pathRef.current = path;

  useEffect(() => {
    if (!path) {
      setLoading(false);
      setData(undefined);
      return;
    }
    const controller = new AbortController();
    let alive = true;
    setLoading(true);

    apiFetch<T>(path, { signal: controller.signal })
      .then((result) => {
        if (!alive) return;
        setData(result);
        setError(undefined);
      })
      .catch((cause: unknown) => {
        if (!alive || controller.signal.aborted) return;
        setError(toApiError(cause));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, nonce, ...deps]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);
  return { data, error, loading, reload, setData };
}

/**
 * Wraps a mutation so components get loading state and a normalised error
 * without repeating try/catch. Resolves to `undefined` when it fails, which
 * keeps call sites free of nested error handling.
 */
export function useMutation<TResult, TArgs extends unknown[]>(
  run: (...args: TArgs) => Promise<TResult>,
) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | undefined>(undefined);

  const mutate = useCallback(
    async (...args: TArgs): Promise<TResult | undefined> => {
      setBusy(true);
      setError(undefined);
      try {
        return await run(...args);
      } catch (cause) {
        setError(toApiError(cause));
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [run],
  );

  return { mutate, busy, error, clearError: () => setError(undefined) };
}

/** Imperative fetch for one-off calls inside event handlers. */
export async function request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  return apiFetch<T>(path, options);
}
