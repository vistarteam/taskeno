'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Layout wrapper for a single form control.
 *
 * The API returns Zod field errors keyed by dotted path; passing the matching
 * message here is what puts the error next to the input that caused it.
 */
export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
  htmlFor,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <div className={cn('space-y-2', className)}>
      <label htmlFor={htmlFor} className="flex items-center gap-1 text-sm font-medium">
        {label}
        {required ? <span className="text-destructive">*</span> : null}
      </label>
      {children}
      {hint && !error ? <p className="text-xs leading-5 text-muted-foreground">{hint}</p> : null}
      {error ? <p className="text-xs font-medium text-destructive">{error}</p> : null}
    </div>
  );
}
