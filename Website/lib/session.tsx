'use client';

/**
 * Session state.
 *
 * The session cookie is httpOnly, so the browser cannot read it: the only way to
 * know whether someone is signed in is to ask the API. Everything that depends
 * on "who am I" (the header, guarded pages) reads from this provider and calls
 * `refresh()` after a login, logout or profile change.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from './api';
import type { User } from './types';

type SessionContextValue = {
  user: User | null;
  loading: boolean;
  refresh: () => Promise<void>;
  signIn: (input: { email: string; password: string }) => Promise<User>;
  signUp: (input: { email: string; password: string; displayName: string }) => Promise<User>;
  signOut: () => Promise<void>;
  becomeProvider: () => Promise<User>;
  isAdmin: boolean;
  isProvider: boolean;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used inside <SessionProvider>');
  return context;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const result = await api.get<{ user: User }>('/auth/me');
      setUser(result.user);
    } catch {
      // 401 simply means "guest"; the API is the only source of truth here.
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signIn = useCallback(async (input: { email: string; password: string }) => {
    const result = await api.post<{ user: User }>('/auth/login', input);
    setUser(result.user);
    return result.user;
  }, []);

  const signUp = useCallback(async (input: { email: string; password: string; displayName: string }) => {
    const result = await api.post<{ user: User }>('/auth/register', input);
    setUser(result.user);
    return result.user;
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      setUser(null);
    }
  }, []);

  const becomeProvider = useCallback(async () => {
    const result = await api.post<{ user: User }>('/auth/become-provider');
    setUser(result.user);
    return result.user;
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      user,
      loading,
      refresh,
      signIn,
      signUp,
      signOut,
      becomeProvider,
      isAdmin: Boolean(user?.roles.includes('admin')),
      isProvider: Boolean(user?.profile.isProvider),
    }),
    [user, loading, refresh, signIn, signUp, signOut, becomeProvider],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
