'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { MessageSquare, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { EmptyState } from '@/components/empty-state';
import { Spinner } from '@/components/ui/skeleton';
import { useResource, request } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { ApiError } from '@/lib/api';
import { formatJalaliDateTime, formatRelativeTime } from '@/lib/format';
import type { Conversation } from '@/lib/types';
import { cn } from '@/lib/utils';

/**
 * Conversation for one order.
 *
 * Both sides of the order can post here; `mine` comes from the API so the
 * bubbles are positioned correctly regardless of who is looking.
 */
export function MessageThread({
  orderId,
  refreshKey = 0,
  onSent,
}: {
  orderId: string;
  /** Bump to force a reload after the order changed elsewhere on the page. */
  refreshKey?: number;
  onSent?: () => void;
}) {
  const { data, loading, reload } = useResource<Conversation>(`/orders/${orderId}/messages`, [refreshKey]);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const toast = useToast();
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'nearest' });
  }, [data?.items.length]);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await request(`/orders/${orderId}/messages`, { method: 'POST', body: { body: text } });
      setBody('');
      reload();
      onSent?.();
    } catch (cause) {
      toast.error(cause instanceof ApiError ? cause.message : 'ارسال پیام ناموفق بود.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      {loading && !data ? (
        <Spinner label="در حال بارگذاری گفت‌وگو…" />
      ) : data && data.items.length > 0 ? (
        <div className="max-h-96 space-y-3 overflow-y-auto scrollbar-thin pl-1">
          {data.items.map((message) => (
            <div key={message.id} className={cn('flex', message.mine ? 'justify-start' : 'justify-end')}>
              <div
                className={cn(
                  'max-w-[85%] rounded-xl border px-3 py-2 text-sm leading-6',
                  message.mine ? 'border-primary/25 bg-primary/8' : 'border-border bg-muted/60',
                )}
              >
                <p className="whitespace-pre-wrap break-words">{message.body}</p>
                <p
                  className="mt-1 text-[11px] text-muted-foreground"
                  title={formatJalaliDateTime(message.createdAt)}
                >
                  {message.mine ? 'من' : 'طرف مقابل'} · {formatRelativeTime(message.createdAt)}
                </p>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      ) : (
        <EmptyState
          icon={MessageSquare}
          title="هنوز پیامی رد و بدل نشده است"
          description="برای هماهنگی جزئیات کار، اولین پیام را بفرستید."
        />
      )}

      <form onSubmit={send} className="space-y-2">
        <Textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={3}
          placeholder="پیام خود را بنویسید…"
          aria-label="متن پیام"
        />
        <div className="flex justify-start">
          <Button type="submit" loading={sending} disabled={body.trim().length === 0}>
            <Send />
            ارسال پیام
          </Button>
        </div>
      </form>
    </div>
  );
}
