'use client';

import * as AvatarPrimitive from '@radix-ui/react-avatar';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function Avatar({ className, ...props }: ComponentProps<typeof AvatarPrimitive.Root>) {
  return (
    <AvatarPrimitive.Root
      className={cn('relative flex size-9 shrink-0 overflow-hidden rounded-full', className)}
      {...props}
    />
  );
}

export function AvatarImage({ className, ...props }: ComponentProps<typeof AvatarPrimitive.Image>) {
  return <AvatarPrimitive.Image className={cn('aspect-square size-full object-cover', className)} {...props} />;
}

export function AvatarFallback({ className, ...props }: ComponentProps<typeof AvatarPrimitive.Fallback>) {
  return (
    <AvatarPrimitive.Fallback
      className={cn(
        'flex size-full items-center justify-center rounded-full bg-primary/12 text-sm font-medium text-primary',
        className,
      )}
      {...props}
    />
  );
}

/** First letter of a Persian display name, used when there is no avatar image. */
export function initialsOf(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed.slice(0, 1) : '؟';
}
