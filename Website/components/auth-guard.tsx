'use client';

import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Lock } from 'lucide-react';
import { useSession } from '@/lib/session';
import { PageLoader } from '@/components/ui/skeleton';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

/**
 * Client-side access control.
 *
 * The API enforces authorisation itself (every guarded route returns 401/403 on
 * its own); this only keeps the UI honest by sending guests to the login page
 * with a `next` target instead of rendering a page that would fail to load.
 */
export function AuthGuard({
  children,
  requireProvider = false,
  requireAdmin = false,
}: {
  children: ReactNode;
  requireProvider?: boolean;
  requireAdmin?: boolean;
}) {
  const { user, loading } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [loading, user, router, pathname]);

  if (loading) return <PageLoader label="در حال بررسی ورود…" />;
  if (!user) return <PageLoader label="انتقال به صفحه ورود…" />;

  if (requireAdmin && !user.roles.includes('admin')) {
    return <Forbidden message="این بخش فقط برای مدیران سیستم است." />;
  }
  if (requireProvider && !user.profile.isProvider) {
    return <Forbidden message="برای دسترسی به داشبورد ارائه‌دهنده باید حساب خود را به ارائه‌دهنده ارتقا دهید." />;
  }

  return <>{children}</>;
}

function Forbidden({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-lg space-y-4 py-10">
      <Alert tone="warning" title="دسترسی محدود">
        {message}
      </Alert>
      <div className="flex gap-3">
        <Button asChild variant="outline">
          <Link href="/">بازگشت به خانه</Link>
        </Button>
        <Button asChild>
          <Link href="/account">
            <Lock />
            تنظیمات حساب
          </Link>
        </Button>
      </div>
    </div>
  );
}
