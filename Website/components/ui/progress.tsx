'use client';

import * as ProgressPrimitive from '@radix-ui/react-progress';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function Progress({
  className,
  value = 0,
  ...props
}: ComponentProps<typeof ProgressPrimitive.Root>) {
  const percent = Math.min(100, Math.max(0, value ?? 0));
  return (
    <ProgressPrimitive.Root
      className={cn('relative h-2 w-full overflow-hidden rounded-full bg-muted', className)}
      value={percent}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className="h-full rounded-full bg-primary transition-[width] duration-500"
        style={{ width: `${percent}%` }}
      />
    </ProgressPrimitive.Root>
  );
}
