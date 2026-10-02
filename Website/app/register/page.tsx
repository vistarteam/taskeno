'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { useSession } from '@/lib/session';
import { useToast } from '@/lib/toast';
import { ApiError } from '@/lib/api';

const MIN_PASSWORD = 10;

export default function RegisterPage() {
  const { signUp } = useSession();
  const router = useRouter();
  const toast = useToast();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user = await signUp({ email: email.trim(), password, displayName: displayName.trim() });
      toast.success(`حساب ساخته شد. نام کاربری شما: ${user.profile.username}`);
      router.replace('/account');
    } catch (cause) {
      setError(cause as ApiError);
      if (!(cause instanceof ApiError)) toast.error('ثبت‌نام ناموفق بود.');
    } finally {
      setBusy(false);
    }
  };

  const fieldErrors = error?.fieldErrors ?? {};

  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 py-8">
      <div className="space-y-1 text-center">
        <h1 className="text-xl font-bold">ساخت حساب در تسکنو</h1>
        <p className="text-sm text-muted-foreground">
          برای خرید خدمت یا فروش کار خود، یک حساب بسازید. نام کاربری به‌صورت خودکار ساخته می‌شود و بعداً قابل تغییر است.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-4 pt-5">
          <form onSubmit={submit} className="space-y-4">
            <Field label="نام نمایشی" htmlFor="displayName" required error={fieldErrors.displayName}>
              <Input
                id="displayName"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="مثلاً: سارا محمدی"
                required
                minLength={2}
                maxLength={60}
              />
            </Field>

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

            <Field
              label="رمز عبور"
              htmlFor="password"
              required
              error={fieldErrors.password}
              hint={`حداقل ${MIN_PASSWORD} کاراکتر؛ ترکیبی از حرف و عدد.`}
            >
              <Input
                id="password"
                type="password"
                dir="ltr"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={MIN_PASSWORD}
              />
            </Field>

            {error ? <Alert tone="danger">{error.message}</Alert> : null}

            <Button type="submit" className="w-full" size="lg" loading={busy}>
              ساخت حساب
            </Button>
          </form>

          <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" />
            رمزهای عبور با Argon2 هش می‌شوند و نشست‌ها با کوکی امن مدیریت می‌شوند.
          </p>
        </CardContent>
      </Card>

      <p className="text-center text-sm text-muted-foreground">
        قبلاً ثبت‌نام کرده‌اید؟{' '}
        <Link href="/login" className="font-medium text-primary hover:underline">
          وارد شوید
        </Link>
      </p>
    </div>
  );
}
