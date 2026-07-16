import type { Config } from 'tailwindcss';

// Palette mirrors the Moche.AI landing design system (glacier navy + aurora teal + coral).
const config: Config = {
  darkMode: ['class', '[data-theme="dark"]'],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        'bg-2': 'var(--bg-2)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        border: 'var(--border)',
        'border-strong': 'var(--border-strong)',
        text: 'var(--text)',
        'text-muted': 'var(--text-muted)',
        'text-faint': 'var(--text-faint)',
        teal: 'var(--teal)',
        'teal-deep': 'var(--teal-deep)',
        iris: 'var(--iris)',
        coral: 'var(--coral)',
        'coral-soft': 'var(--coral-soft)',
      },
      fontFamily: {
        display: ['var(--font-display)'],
        body: ['var(--font-body)'],
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
      },
      boxShadow: {
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
      },
      transitionTimingFunction: {
        out: 'cubic-bezier(.16,1,.3,1)',
      },
    },
  },
  plugins: [],
};
export default config;
