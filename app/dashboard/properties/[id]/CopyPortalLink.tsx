'use client';

import { useState } from 'react';

// Small client helper so the server-rendered property page can offer a copy button.
export function CopyPortalLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      data-testid="button-copy-portal-link"
      onClick={() => {
        void navigator.clipboard?.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? 'Copied!' : 'Copy link'}
    </button>
  );
}
