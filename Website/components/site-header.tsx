'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  Bell,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Search,
  ShieldCheck,
  Store,
  User as UserIcon,
  Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, initialsOf } from '@/components/ui/avatar';
import { Money } from '@/components/money';
import { ThemeToggle } from '@/components/theme-toggle';
import { useSession } from '@/lib/session';
import { useResource } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import type { WalletSummary } from '@/lib/types';
import { faNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/services', label: 'خدمات' },
  { href: '/orders', label: 'سفارش‌های من', auth: true },
  { href: '/provider', label: 'داشبورد ارائه‌دهنده', auth: true },
];

export function SiteHeader() {
  const { user, loading, signOut, isAdmin, isProvider } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const toast = useToast();
  const [query, setQuery] = useState('');

  // Guarded so guests do not trigger a 401 storm on every page.
  const wallet = useResource<WalletSummary>(user ? '/wallet/summary' : null, [pathname]);
  const unread = useResource<{ count: number }>(user ? '/notifications/unread-count' : null, [pathname]);

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    const term = query.trim();
    router.push(term ? `/services?q=${encodeURIComponent(term)}` : '/services');
  };

  const handleSignOut = async () => {
    await signOut();
    toast.success('از حساب خود خارج شدید.');
    router.push('/');
  };

  const links = NAV.filter((item) => !item.auth || user);
  const unreadCount = unread.data?.count ?? 0;

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4">
        <Link href="/" className="flex shrink-0 items-center gap-2 font-bold" aria-label="تسکنو — خانه">
          {/* The mark is a raster asset with a transparent background, so it reads
              on both the light and dark palettes without a second variant. */}
          <Image src="/logo.png" alt="" width={36} height={36} priority className="size-9" />
          <span className="hidden text-lg sm:inline">تسکنو</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {links.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'rounded-lg px-3 py-2 text-sm font-medium transition',
                pathname === item.href || pathname.startsWith(`${item.href}/`)
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              {item.label}
            </Link>
          ))}
          {isAdmin ? (
            <Link
              href="/admin"
              className={cn(
                'rounded-lg px-3 py-2 text-sm font-medium transition',
                pathname.startsWith('/admin')
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              پنل مدیریت
            </Link>
          ) : null}
        </nav>

        <form onSubmit={submitSearch} className="relative mx-auto hidden max-w-sm flex-1 lg:block">
          <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="جست‌وجوی خدمت…"
            aria-label="جست‌وجو"
            className="h-10 w-full rounded-lg border border-input bg-card pr-9 pl-3 text-sm focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none"
          />
        </form>

        <div className="ms-auto flex items-center gap-1 lg:ms-0">
          <ThemeToggle />

          {user ? (
            <Link
              href="/wallet"
              className="hidden items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm transition hover:border-primary/40 sm:flex"
              title="کیف پول"
            >
              <Wallet className="size-4 text-primary" />
              <Money value={wallet.data?.balance ?? '0'} className="text-xs font-semibold" />
            </Link>
          ) : null}

          {user ? (
            <Link
              href="/notifications"
              className="relative rounded-lg p-2 text-muted-foreground transition hover:bg-accent hover:text-foreground"
              aria-label="اطلاع‌رسانی‌ها"
            >
              <Bell className="size-5" />
              {unreadCount > 0 ? (
                <span className="tabular absolute -top-0.5 left-0.5 flex min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                  {faNumber(unreadCount)}
                </span>
              ) : null}
            </Link>
          ) : null}

          {loading ? (
            <div className="size-9 animate-pulse rounded-full bg-muted" />
          ) : user ? (
            <DropdownMenu.Root>
              <DropdownMenu.Trigger className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
                <Avatar>
                  <AvatarFallback>{initialsOf(user.profile.displayName)}</AvatarFallback>
                </Avatar>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="start"
                  sideOffset={8}
                  className="z-100 w-56 rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-lg"
                >
                  <div className="px-3 py-2">
                    <p className="truncate text-sm font-medium">{user.profile.displayName}</p>
                    <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                  </div>
                  <DropdownMenu.Separator className="my-1 h-px bg-border" />
                  <MenuLink href="/account" icon={<UserIcon className="size-4" />} label="حساب کاربری" />
                  <MenuLink href="/orders" icon={<Package className="size-4" />} label="سفارش‌های من" />
                  <MenuLink href="/wallet" icon={<Wallet className="size-4" />} label="کیف پول" />
                  {isProvider ? (
                    <MenuLink href="/provider" icon={<Store className="size-4" />} label="داشبورد ارائه‌دهنده" />
                  ) : (
                    <MenuLink href="/account" icon={<LayoutDashboard className="size-4" />} label="ارائه‌دهنده شوید" />
                  )}
                  {isAdmin ? <MenuLink href="/admin" icon={<ShieldCheck className="size-4" />} label="پنل مدیریت" /> : null}
                  <DropdownMenu.Separator className="my-1 h-px bg-border" />
                  <DropdownMenu.Item
                    onSelect={() => void handleSignOut()}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-destructive outline-none data-[highlighted]:bg-destructive/10"
                  >
                    <LogOut className="size-4" />
                    خروج از حساب
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          ) : (
            <div className="flex items-center gap-2">
              <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                <Link href="/login">ورود</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/register">ثبت‌نام</Link>
              </Button>
            </div>
          )}

          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="منو">
                <Menu />
              </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="start"
                sideOffset={8}
                className="z-100 w-52 rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-lg"
              >
                <MenuLink href="/" icon={<Search className="size-4" />} label="خانه" />
                <MenuLink href="/services" icon={<Store className="size-4" />} label="خدمات" />
                {user ? <MenuLink href="/orders" icon={<Package className="size-4" />} label="سفارش‌های من" /> : null}
                {user ? <MenuLink href="/wallet" icon={<Wallet className="size-4" />} label="کیف پول" /> : null}
                {isAdmin ? <MenuLink href="/admin" icon={<ShieldCheck className="size-4" />} label="پنل مدیریت" /> : null}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </div>
    </header>
  );
}

function MenuLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <DropdownMenu.Item asChild>
      <Link
        href={href}
        className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
      >
        {icon}
        {label}
      </Link>
    </DropdownMenu.Item>
  );
}
