'use client';

import { useEffect, useState } from 'react';

type Theme = 'dark' | 'light';

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => {
    const stored = (localStorage.getItem('moche-theme') as Theme | null) ?? 'dark';
    setTheme(stored);
    document.documentElement.setAttribute('data-theme', stored);
  }, []);

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('moche-theme', next);
  }

  return (
    <button className="btn btn-ghost btn-sm" onClick={toggle} aria-label="Toggle theme" type="button">
      {theme === 'dark' ? '☾' : '☀'}
    </button>
  );
}
