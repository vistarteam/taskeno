import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import './globals.css';
import { Providers } from './providers';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';

export const metadata: Metadata = {
  title: { default: 'تسکنو | بازار خدمات دیجیتال', template: '%s | تسکنو' },
  description:
    'تسکنو، بازار خدمات دیجیتال فارسی: خرید و فروش خدمات طراحی، برنامه‌نویسی، محتوا و بازاریابی با پرداخت امن و کیف پول ریالی.',
  applicationName: 'تسکنو',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#1a1a2b' },
  ],
};

/**
 * Runs before paint so the stored theme is applied without a flash of the
 * wrong palette. Kept inline and tiny for that reason.
 */
const THEME_BOOTSTRAP = `try{var s=localStorage.getItem('taskeno-theme');var d=s?s==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d)}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // Persian is right-to-left; Next renders `dir` on <html> so every layout,
    // flex direction and logical property (`ms-*`, `ps-*`) resolves correctly.
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Vazirmatn: a Persian-first variable font. Loaded at runtime so the
            build never depends on network access; the CSS stack falls back to
            Tahoma/system fonts if the CDN is unreachable. */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@300..800&display=swap"
        />
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body className="min-h-dvh antialiased">
        <Providers>
          <a
            href="#main"
            className="sr-only-focusable absolute right-4 top-4 z-100 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground"
          >
            پرش به محتوای اصلی
          </a>
          <SiteHeader />
          <main id="main" className="mx-auto w-full max-w-7xl px-4 py-6">
            {children}
          </main>
          <SiteFooter />
        </Providers>
        <noscript>
          <div className="p-4 text-center text-sm">
            برای استفاده کامل از تسکنو، جاوااسکریپت را فعال کنید. برای مرور خدمات می‌توانید از{' '}
            <Link href="/services" className="text-primary underline">
              اینجا
            </Link>{' '}
            شروع کنید.
          </div>
        </noscript>
      </body>
    </html>
  );
}
