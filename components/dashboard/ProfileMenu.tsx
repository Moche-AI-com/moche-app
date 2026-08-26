'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, FileText, LifeBuoy, LogOut, Moon, UserRound } from 'lucide-react';
import { logoutAction } from '@/app/(auth)/actions';
import { SALES_EMAIL } from '@/lib/constants';

type Theme = 'dark' | 'light';

const SUPPORT_MAILTO = `mailto:${SALES_EMAIL}?subject=${encodeURIComponent('Moche.AI support request')}`;

// Account menu for the dashboard header. It replaced the flat Profile tab and
// the standalone header theme toggle: the trigger is the host's name next to
// the notification bell, and the panel carries the three account destinations
// (Profile Settings, Documentation, Support), the dark/light switch, and
// sign out — which used to be its own header button.
//
// Theme handling mirrors components/ThemeToggle.tsx exactly — same data-theme
// attribute, same 'moche-theme' localStorage key, and the same light default
// the boot script in app/layout.tsx applies before first paint — so the two
// controls can never disagree about the current theme.
export function ProfileMenu({ displayName }: { displayName: string }) {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>('light');
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const wasOpenRef = useRef(false);
  const pathname = usePathname();

  // Mirror the boot-script theme into React state (same contract as ThemeToggle).
  useEffect(() => {
    const attr = document.documentElement.getAttribute('data-theme');
    setTheme(attr === 'dark' ? 'dark' : 'light');
  }, []);

  // Move focus into the panel on open and back to the trigger on close — the
  // same keyboard contract the notification bell follows.
  useEffect(() => {
    if (open) {
      wasOpenRef.current = true;
      requestAnimationFrame(() => {
        panelRef.current
          ?.querySelector<HTMLElement>('a[href], button:not(:disabled)')
          ?.focus();
      });
      return;
    }
    if (wasOpenRef.current) {
      wasOpenRef.current = false;
      requestAnimationFrame(() => triggerRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function onClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>('a[href], button:not(:disabled)'),
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function toggleTheme() {
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

  // The trigger stays lit while the host is anywhere inside the profile shell,
  // now that no flat tab carries that state.
  const profileActive =
    pathname === '/dashboard/profile' || pathname.startsWith('/dashboard/profile/');

  return (
    <div ref={rootRef} className="profile-menu-root">
      <button
        ref={triggerRef}
        type="button"
        className={`profile-menu-trigger${profileActive ? ' profile-menu-trigger-active' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="profile-menu-panel"
        aria-haspopup="dialog"
        title="Account"
        data-testid="button-profile-menu"
      >
        <span className="profile-menu-avatar" aria-hidden>
          <UserRound size={14} />
        </span>
        <span className="profile-menu-name">{displayName}</span>
        <ChevronDown size={14} aria-hidden className="profile-menu-chevron" data-open={open} />
      </button>

      {open && (
        <div
          ref={panelRef}
          id="profile-menu-panel"
          className="card profile-menu-panel"
          role="dialog"
          aria-modal="true"
          aria-label="Account menu"
          data-testid="profile-menu-dropdown"
        >
          <Link
            href="/dashboard/profile"
            className="profile-menu-item"
            onClick={() => setOpen(false)}
          >
            <UserRound size={15} aria-hidden />
            Profile Settings
          </Link>
          {/* Plain anchor, not next/link: the Legal Center lives outside the
              dashboard shell, so it opens in a new tab and the host keeps their
              place. */}
          <a
            href="/legal"
            target="_blank"
            rel="noopener noreferrer"
            className="profile-menu-item"
            onClick={() => setOpen(false)}
          >
            <FileText size={15} aria-hidden />
            Documentation
          </a>
          {/* Direct mailto per spec — "sends us an email". The richer support
              page (account id pre-filled) stays reachable at
              Profile Settings → Support. */}
          <a href={SUPPORT_MAILTO} className="profile-menu-item" onClick={() => setOpen(false)}>
            <LifeBuoy size={15} aria-hidden />
            Support
          </a>
          <div className="profile-menu-divider" role="separator" />
          {/* Toggling must NOT close the panel: flipping back is a one-click
              action only if the menu stays put. */}
          <button
            type="button"
            role="switch"
            aria-checked={theme === 'dark'}
            className="profile-menu-item profile-menu-theme"
            onClick={toggleTheme}
            data-testid="switch-dark-mode"
          >
            <Moon size={15} aria-hidden />
            Dark mode
            <span className="profile-menu-switch" data-on={theme === 'dark'} aria-hidden>
              <span className="profile-menu-switch-thumb" />
            </span>
          </button>
          <div className="profile-menu-divider" role="separator" />
          <form action={logoutAction}>
            <button
              type="submit"
              className="profile-menu-item profile-menu-signout"
              data-testid="button-sign-out"
            >
              <LogOut size={15} aria-hidden />
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
