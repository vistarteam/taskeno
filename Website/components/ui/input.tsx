import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

const base =
  'w-full rounded-lg border border-input bg-card px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-destructive aria-invalid:ring-destructive/20';

export function Input({ className, type = 'text', ...props }: ComponentProps<'input'>) {
  return <input type={type} className={cn(base, 'h-10', className)} {...props} />;
}

export function Textarea({ className, rows = 4, ...props }: ComponentProps<'textarea'>) {
  return <textarea rows={rows} className={cn(base, 'min-h-20 leading-6', className)} {...props} />;
}
