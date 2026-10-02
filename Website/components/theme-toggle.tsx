'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';

const STORAGE_KEY = 'taskeno-theme';

/** Applies the stored theme to <html>. The layout runs this before paint. */
export function applyStoredTheme(): void {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const dark = stored ? stored === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark', dark);
  } catch {
    /* private mode: keep the light default */
  }
}

export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light');
    } catch {
      /* ignore */
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={dark ? 'حالت روشن' : 'حالت تاریک'}
      title={dark ? 'حالت روشن' : 'حالت تاریک'}
    >
      {dark ? <Sun /> : <Moon />}
    </Button>
  );
}
