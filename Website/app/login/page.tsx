'use client';

import { Suspense, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { PageLoader } from '@/components/ui/skeleton';
import { useSession } from '@/lib/session';
import { useToast } from '@/lib/toast';
import { ApiError } from '@/lib/api';

export default function LoginPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const { signIn } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const next = params.get('next') ?? '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user = await signIn({ email: email.trim(), password });
      toast.success(`خوش آمدید، ${user.profile.displayName}!`);
      router.replace(next);
    } catch (cause) {
      setError(cause as ApiError);
      if (!(cause instanceof ApiError)) toast.error('ورود ناموفق بود.');
    } finally {
      setBusy(false);
    }
  };

  const fieldErrors = error?.fieldErrors ?? {};

  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 py-8">
      <div className="space-y-1 text-center">
        <h1 className="text-xl font-bold">ورود به تسکنو</h1>
        <p className="text-sm text-muted-foreground">برای ثبت سفارش، مدیریت خدمات و کیف پول وارد شوید.</p>
      </div>

      <Card>
        <CardContent className="space-y-4 pt-5">
          <form onSubmit={submit} className="space-y-4">
            <Field label="ایمیل" htmlFor="email" required error={fieldErrors.email}>
              <Input
                id="email"
                type="email"
                dir="ltr"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                required
              />
            </Field>

            <Field label="رمز عبور" htmlFor="password" required error={fieldErrors.password}>
              <Input
                id="password"
                type="password"
                dir="ltr"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </Field>

            {error ? <Alert tone="danger">{error.message}</Alert> : null}

            <Button type="submit" className="w-full" size="lg" loading={busy}>
              ورود
            </Button>
          </form>
        </CardContent>
      </Card>

      <p className="text-center text-sm text-muted-foreground">
        حساب ندارید؟{' '}
        <Link href="/register" className="font-medium text-primary hover:underline">
          ثبت‌نام کنید
        </Link>
      </p>
    </div>
  );
}
