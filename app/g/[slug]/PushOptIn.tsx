'use client';

import { useEffect, useState } from 'react';
import type { PortalT } from '@/lib/guest/portal-strings';

// Guest web-push opt-in (issue #133, item 5): portal-default notifications, so a
// guest hears about host replies without SMS and without keeping a tab open.
// Renders nothing unless VAPID is configured and the browser supports push —
// the feature ships dark until keys exist (scripts/generate-vapid-keys.mjs).
export function PushOptIn(props: { slug: string; t: PortalT }) {
  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const [state, setState] = useState<'hidden' | 'prompt' | 'on' | 'off'>('hidden');

  useEffect(() => {
    if (!vapidKey) return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;
    let cancelled = false;
    navigator.serviceWorker
      .register('/sw-push.js')
      .then(async (registration) => {
        const existing = await registration.pushManager.getSubscription();
        if (cancelled) return;
        setState(existing ? 'on' : Notification.permission === 'denied' ? 'off' : 'prompt');
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [vapidKey]);

  async function enable() {
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState('off');
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey!),
      });
      const json = subscription.toJSON();
      const res = await fetch(`/api/guest/${props.slug}/push-subscription`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      });
      setState(res.ok ? 'on' : 'off');
    } catch {
      setState('off');
    }
  }

  if (state === 'hidden') return null;
  // portalT falls back to the key itself when a locale lacks it — degrade to
  // English for now; translators fill the locales append-only.
  const promptLabel = props.t('pushOptIn') === 'pushOptIn' ? 'Notify me when my host replies' : props.t('pushOptIn');
  const onLabel = props.t('pushOn') === 'pushOn' ? 'Notifications on for this device' : props.t('pushOn');

  return (
    <div style={{ textAlign: 'center', marginTop: '1rem' }}>
      {state === 'prompt' && (
        <button type="button" className="gp-msg-link" onClick={enable} data-testid="button-enable-push">
          {promptLabel}
        </button>
      )}
      {state === 'on' && (
        <span className="gp-muted" style={{ fontSize: '.8rem' }}>{onLabel}</span>
      )}
    </div>
  );
}

// Return type is explicitly Uint8Array<ArrayBuffer> (not ArrayBufferLike) so it
// satisfies BufferSource under the stricter TS 5.7+/Next 16 generic typings.
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64Safe);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}
