'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

type Theme = 'dark' | 'light';

// Light is the product default (see app/globals.css). The stored value is
// applied before paint by the inline boot script in app/layout.tsx; this
// component only mirrors that into React state so the icon and label match.
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    const attr = document.documentElement.getAttribute('data-theme');
    setTheme(attr === 'dark' ? 'dark' : 'light');
  }, []);

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('moche-theme', next);
    } catch {
      // Private-browsing modes can throw here; the theme still applies for
      // this page view, it just will not persist.
    }
  }

  const label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';

  return (
    <button
      className="btn btn-ghost btn-sm"
      onClick={toggle}
      aria-label={label}
      title={label}
      type="button"
      style={{ minHeight: 44, minWidth: 44, padding: '0 .75rem' }}
    >
      {theme === 'dark' ? <Sun size={16} aria-hidden /> : <Moon size={16} aria-hidden />}
    </button>
  );
}
