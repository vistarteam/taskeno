import Image from 'next/image';
import Link from 'next/link';
import { ShieldCheck, Wallet } from 'lucide-react';

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-border bg-card/40">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-3">
          <div className="flex items-center gap-2 font-bold">
            <Image src="/logo.png" alt="" width={32} height={32} className="size-8" />
            تسکنو
          </div>
          <p className="text-sm leading-6 text-muted-foreground">
            بازار خدمات دیجیتال با پرداخت امن؛ مبلغ سفارش تا تأیید نهایی شما در امانت تسکنو می‌ماند.
          </p>
        </div>

        <div className="space-y-2 text-sm">
          <p className="font-semibold">دسترسی سریع</p>
          <Link href="/services" className="block text-muted-foreground transition hover:text-primary">
            فهرست خدمات
          </Link>
          <Link href="/orders" className="block text-muted-foreground transition hover:text-primary">
            سفارش‌های من
          </Link>
          <Link href="/wallet" className="block text-muted-foreground transition hover:text-primary">
            کیف پول
          </Link>
          <Link href="/register" className="block text-muted-foreground transition hover:text-primary">
            ثبت‌نام ارائه‌دهنده
          </Link>
        </div>

        <div className="space-y-3 text-sm">
          <p className="font-semibold">تضمین‌ها</p>
          <p className="flex items-center gap-2 text-muted-foreground">
            <ShieldCheck className="size-4 text-success" />
            نگهداری وجه در امانت (Escrow)
          </p>
          <p className="flex items-center gap-2 text-muted-foreground">
            <Wallet className="size-4 text-primary" />
            دفتر مالی دوطرفه و قابل رهگیری
          </p>
        </div>
        
      </div>

      <div className="border-t border-border py-4 text-center text-xs text-muted-foreground">
        © تسکنو — نمونهٔ اجرایی با PGlite، بدون نیاز به Docker
      </div>
    </footer>
  );
}
