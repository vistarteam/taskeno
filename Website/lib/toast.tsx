'use client';

/**
 * A tiny toast system.
 *
 * Persian text is long, so toasts carry the API's own message (which is already
 * written for end users) and sit above everything at the bottom of the screen.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { cn } from './utils';

type ToastKind = 'success' | 'error' | 'info';
type Toast = { id: string; kind: ToastKind; message: string };

type ToastContextValue = {
  toast: (message: string, kind?: ToastKind) => void;
  success: (message: string) => void;
  error: (message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>');
  return context;
}

const ICONS = { success: CheckCircle2, error: XCircle, info: Info } as const;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, kind: ToastKind = 'info') => {
      const id = Math.random().toString(36).slice(2);
      setToasts((current) => [...current.slice(-3), { id, kind, message }]);
      setTimeout(() => dismiss(id), 6000);
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      toast,
      success: (message: string) => toast(message, 'success'),
      error: (message: string) => toast(message, 'error'),
    }),
    [toast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-100 flex flex-col items-center gap-2 px-4">
        {toasts.map((item) => {
          const Icon = ICONS[item.kind];
          return (
            <div
              key={item.id}
              role="status"
              className={cn(
                'pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl border p-3 text-sm shadow-lg backdrop-blur',
                'bg-card/95 text-card-foreground',
                item.kind === 'success' && 'border-success/40',
                item.kind === 'error' && 'border-destructive/40',
                item.kind === 'info' && 'border-border',
              )}
            >
              <Icon
                className={cn(
                  'mt-0.5 size-5 shrink-0',
                  item.kind === 'success' && 'text-success',
                  item.kind === 'error' && 'text-destructive',
                  item.kind === 'info' && 'text-primary',
                )}
              />
              <p className="flex-1 leading-6">{item.message}</p>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                className="rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                aria-label="بستن"
              >
                <X className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
