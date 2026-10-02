'use client';

import type { ReactNode } from 'react';
import { SessionProvider } from '@/lib/session';
import { ToastProvider } from '@/lib/toast';

/**
 * Client-side context that every page relies on: who is signed in, and how to
 * surface a toast. Kept in one place so the root layout can stay a server
 * component.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <ToastProvider>{children}</ToastProvider>
    </SessionProvider>
  );
}
