// Scoped guest-portal styles. Everything hangs off .gp-v2 so nothing leaks into
// the host dashboard or marketing pages. Shared by the portal shell
// (GuestPortal.tsx) and the local guide (local/LocalGuide.tsx) so every
// guest-facing surface renders from one design system.
//
// Theming: semantic custom properties hold every color. .gp-v2 carries the dark
// luxury default; .gp-v2.gp-light overrides the whole set. Text colors are
// solid values (never opacity-dimmed white over a dark guess) so BOTH themes
// keep readable contrast — a guest switching theme must never lose a message,
// placeholder, or button label to a same-color background.
import { useCallback, useEffect, useState } from 'react';

export const PORTAL_CSS = `
.gp-v2 {
  --gp-bg: #0b0f0e;
  --gp-surface: #131a18;
  --gp-surface-2: #0f1514;
  --gp-surface-3: #1a2320;
  --gp-text: #f2f5f4;
  --gp-muted: #a7b4b0;
  --gp-faint: #7d8a86;
  --gp-border: rgba(255,255,255,0.09);
  --gp-border-strong: rgba(255,255,255,0.16);
  --gp-ghost-bg: rgba(255,255,255,0.07);
  --gp-on-primary: #06201c;
  --gp-on-accent: #2a1408;
  --gp-icon: var(--gp-primary);
  --gp-primary-soft: rgba(51,230,212,0.12);
  --gp-accent-text: #ffb08f;
  --gp-accent-soft-bg: rgba(255,138,92,0.14);
  --gp-accent-soft-border: rgba(255,138,92,0.4);
  --gp-danger-text: #ff9d8a;
  --gp-danger-bg: rgba(255,107,84,0.12);
  --gp-danger-border: rgba(255,107,84,0.4);
  --gp-backdrop: rgba(3,7,6,0.62);
  --gp-art-bg: linear-gradient(135deg, rgba(82,203,222,0.16), rgba(118,152,249,0.12));
  min-height: 100dvh;
  background: var(--gp-bg);
  color: var(--gp-text);
  color-scheme: dark;
  font-family: var(--font-portal-sans), system-ui, -apple-system, sans-serif;
  -webkit-font-smoothing: antialiased;
}
.gp-v2.gp-light {
  --gp-bg: #f4f6f5;
  --gp-surface: #ffffff;
  --gp-surface-2: #edf1ef;
  --gp-surface-3: #e8eeeb;
  --gp-text: #152019;
  --gp-muted: #4f5f58;
  --gp-faint: #68786f;
  --gp-border: rgba(21,32,25,0.12);
  --gp-border-strong: rgba(21,32,25,0.22);
  --gp-ghost-bg: rgba(21,32,25,0.06);
  --gp-icon: #0a7c6e;
  --gp-primary-soft: rgba(13,124,110,0.10);
  --gp-accent-text: #a04a24;
  --gp-accent-soft-bg: rgba(255,138,92,0.16);
  --gp-accent-soft-border: rgba(214,102,58,0.45);
  --gp-danger-text: #b03a22;
  --gp-danger-bg: rgba(255,107,84,0.10);
  --gp-danger-border: rgba(214,74,44,0.4);
  --gp-backdrop: rgba(21,32,25,0.35);
  --gp-art-bg: linear-gradient(135deg, rgba(82,203,222,0.20), rgba(118,152,249,0.14));
  color-scheme: light;
}
.gp-v2 button { font-family: inherit; }
.gp-v2 button:focus-visible, .gp-v2 a:focus-visible, .gp-v2 input:focus-visible, .gp-v2 textarea:focus-visible {
  outline: 2px solid var(--gp-primary);
  outline-offset: 2px;
}
.gp-muted { color: var(--gp-muted); }
.gp-alert-text { color: var(--gp-accent-text); }

.gp-wrap {
  max-width: 600px;
  margin: 0 auto;
  padding: calc(16px + env(safe-area-inset-top)) 16px calc(24px + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
}
.gp-header { display: flex; align-items: center; gap: 12px; padding: 8px 0 16px; }
.gp-header-text { flex: 1; min-width: 0; }
.gp-header-actions { display: flex; gap: 8px; flex-shrink: 0; }
.gp-logo { width: 40px; height: 40px; border-radius: 10px; object-fit: cover; flex-shrink: 0; }
.gp-property-name { font-family: var(--font-portal-serif), Georgia, serif; font-size: 1.35rem; font-weight: 600; line-height: 1.2; }
.gp-property-loc { font-size: 0.85rem; color: var(--gp-muted); }
.gp-icon-btn {
  width: 40px; height: 40px; border-radius: 12px; flex-shrink: 0;
  border: 1px solid var(--gp-border); background: var(--gp-surface); color: var(--gp-text);
  display: flex; align-items: center; justify-content: center; cursor: pointer;
  transition: border-color 0.15s ease;
}
.gp-icon-btn:hover { border-color: var(--gp-primary); }
.gp-main { flex: 1; display: flex; flex-direction: column; }
.gp-footer { text-align: center; font-size: 0.75rem; color: var(--gp-faint); padding-top: 24px; }

.gp-step-title { font-family: var(--font-portal-serif), Georgia, serif; font-size: 1.6rem; font-weight: 600; margin: 8px 0 4px; }
.gp-step-sub { font-size: 0.95rem; color: var(--gp-muted); margin-bottom: 20px; line-height: 1.45; }
.gp-title-row { display: flex; align-items: center; gap: .45rem; margin: 0; }

.gp-card { background: var(--gp-surface); border: 1px solid var(--gp-border); border-radius: 16px; padding: 18px; }

.gp-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; border: none; border-radius: 12px; padding: 14px 18px; font-size: 1rem; font-weight: 600; cursor: pointer; width: 100%; transition: transform 0.05s ease, opacity 0.15s ease; }
.gp-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.gp-btn-primary { background: var(--gp-primary); color: var(--gp-on-primary); }
.gp-btn-accent { background: var(--gp-accent); color: var(--gp-on-accent); }
.gp-btn-ghost { background: var(--gp-ghost-bg); color: inherit; border: 1px solid var(--gp-border); }

.gp-field { margin-bottom: 14px; }
.gp-label { display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 6px; color: var(--gp-text); }
.gp-input, .gp-textarea { width: 100%; background: var(--gp-surface-2); border: 1px solid var(--gp-border-strong); border-radius: 12px; color: var(--gp-text); padding: 13px 14px; font-size: 1rem; outline: none; box-sizing: border-box; font-family: inherit; }
.gp-input::placeholder, .gp-textarea::placeholder { color: var(--gp-faint); }
.gp-input:focus, .gp-textarea:focus { border-color: var(--gp-primary); }
.gp-textarea { min-height: 90px; resize: vertical; }
.gp-field-error { color: var(--gp-danger-text); font-size: 0.82rem; margin-top: 5px; }

.gp-code-row { display: flex; gap: 10px; justify-content: center; margin: 18px 0 8px; }
.gp-code-box { width: 58px; height: 68px; text-align: center; font-size: 1.9rem; font-weight: 700; background: var(--gp-surface-2); border: 1.5px solid var(--gp-border-strong); border-radius: 14px; color: var(--gp-text); outline: none; transition: border-color 0.15s ease, box-shadow 0.15s ease; }
.gp-code-box:focus { border-color: var(--gp-primary); box-shadow: 0 0 0 3px var(--gp-primary-soft); }
.gp-error { background: var(--gp-danger-bg); border: 1px solid var(--gp-danger-border); color: var(--gp-danger-text); border-radius: 12px; padding: 11px 14px; font-size: 0.9rem; margin: 12px 0; }

.gp-consent { display: flex; gap: 10px; align-items: flex-start; background: var(--gp-surface-2); border: 1px solid var(--gp-border); border-radius: 12px; padding: 13px 14px; margin: 0; cursor: pointer; }
.gp-consent input { width: 20px; height: 20px; margin-top: 1px; accent-color: var(--gp-primary); flex-shrink: 0; }
.gp-consent-text { font-size: 0.88rem; line-height: 1.4; }
.gp-consent-opt { display: block; font-size: 0.76rem; color: var(--gp-muted); margin-top: 2px; }

.gp-menu-grid { display: grid; grid-template-columns: 1fr; gap: 12px; margin-top: 18px; }
@media (min-width: 480px) { .gp-menu-grid { grid-template-columns: 1fr 1fr; } }
.gp-menu-card { display: flex; flex-direction: column; align-items: stretch; gap: 10px; text-align: left; background: var(--gp-surface); border: 1px solid var(--gp-border); border-radius: 16px; padding: 14px; cursor: pointer; color: inherit; transition: border-color 0.15s ease, transform 0.05s ease; }
.gp-menu-card:active { transform: scale(0.985); }
.gp-menu-card:hover { border-color: var(--gp-primary); }
.gp-menu-card:disabled { opacity: 0.45; cursor: not-allowed; }
.gp-menu-title { font-size: 1.02rem; font-weight: 700; padding: 0 2px; }
.gp-menu-blurb { font-size: 0.83rem; color: var(--gp-muted); line-height: 1.4; padding: 0 2px; }

/* Consistent card art: one brand-gradient tile + one line glyph per card, so
   every image slot across the portal shares a frame, palette, and weight. */
.gp-card-art {
  display: flex; align-items: center; justify-content: center;
  width: 100%; height: 88px; border-radius: 12px;
  background: var(--gp-art-bg); border: 1px solid var(--gp-border);
  color: var(--gp-icon);
}

.gp-wf-header { display: flex; align-items: center; gap: 10px; padding: 4px 0 14px; }
.gp-back { display: inline-flex; align-items: center; gap: 4px; background: var(--gp-ghost-bg); border: 1px solid var(--gp-border); color: inherit; border-radius: 10px; padding: 9px 12px; font-size: 0.88rem; font-weight: 600; cursor: pointer; text-decoration: none; }
.gp-wf-title { font-family: var(--font-portal-serif), Georgia, serif; font-size: 1.25rem; font-weight: 600; }

.gp-banner { border-radius: 12px; padding: 11px 14px; font-size: 0.85rem; line-height: 1.45; margin-bottom: 14px; color: var(--gp-text); }
.gp-banner-host { background: var(--gp-accent-soft-bg); border: 1px solid var(--gp-accent-soft-border); }

.gp-chat-list { flex: 1; display: flex; flex-direction: column; gap: 10px; overflow-y: auto; padding: 4px 0 14px; min-height: 200px; }
.gp-bubble { max-width: 85%; padding: 11px 14px; border-radius: 16px; font-size: 0.95rem; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
.gp-bubble-user { align-self: flex-end; background: var(--gp-primary); color: var(--gp-on-primary); border-bottom-right-radius: 6px; }
.gp-bubble-assistant { align-self: flex-start; background: var(--gp-surface-3); border: 1px solid var(--gp-border); border-bottom-left-radius: 6px; }
.gp-bubble-host { align-self: flex-start; background: var(--gp-accent-soft-bg); border: 1px solid var(--gp-accent-soft-border); border-bottom-left-radius: 6px; }
.gp-bubble-emergency { border-color: var(--gp-danger-border); background: var(--gp-danger-bg); }
.gp-bubble-tag { display: block; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--gp-muted); margin-bottom: 4px; }
.gp-bubble-meta { display: block; font-size: 0.72rem; color: var(--gp-muted); margin-top: 6px; }

/* Chat surfaces (Ask + Host Chat). Bubbles use solid semantic colors so text is
   readable in both themes: the guest's own bubble is brand primary with the
   dark on-primary ink in BOTH themes. */
.gp-chat-panel { border: 1px solid var(--gp-border); border-radius: 18px; padding: 1rem; min-height: 300px; max-height: 48vh; overflow-y: auto; background: var(--gp-surface-2); }
.gp-msg-row { display: flex; justify-content: flex-start; margin-bottom: .7rem; }
.gp-msg-row-user { justify-content: flex-end; }
.gp-msg { max-width: 84%; border-radius: 18px; padding: .75rem .85rem; background: var(--gp-surface-3); border: 1px solid var(--gp-border); color: var(--gp-text); border-bottom-left-radius: 4px; }
.gp-msg-user { background: var(--gp-primary); color: var(--gp-on-primary); border-color: transparent; border-bottom-left-radius: 18px; border-bottom-right-radius: 4px; }
.gp-msg-host, .gp-msg-escalation { background: var(--gp-accent-soft-bg); border-color: var(--gp-accent-soft-border); }
.gp-msg-tag { font-size: .72rem; font-weight: 700; margin-bottom: .3rem; color: var(--gp-accent-text); display: flex; align-items: center; gap: .35rem; }
.gp-msg-meta { display: flex; gap: .6rem; align-items: center; margin-top: .4rem; font-size: .72rem; color: var(--gp-muted); }
.gp-msg-user .gp-msg-meta { color: inherit; opacity: .75; }
.gp-msg-link { border: 0; background: none; color: inherit; cursor: pointer; padding: 0; text-decoration: underline; font: inherit; }
.gp-msg-emergency { margin: .45rem 0 0; font-size: .78rem; color: var(--gp-accent-text); }
.gp-msg-user .gp-msg-emergency { color: inherit; opacity: .85; }

.gp-notice { display: flex; gap: .6rem; align-items: flex-start; border: 1px solid var(--gp-accent-soft-border); background: var(--gp-accent-soft-bg); color: var(--gp-text); border-radius: 14px; padding: .75rem; margin-bottom: .85rem; font-size: .92rem; line-height: 1.45; }

.gp-assist-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(145px, 1fr)); gap: .65rem; margin: 1rem 0; }
.gp-assist-card { text-align: left; border: 1px solid var(--gp-border); border-radius: 16px; padding: .7rem; background: var(--gp-surface); color: inherit; cursor: pointer; display: flex; flex-direction: column; gap: .5rem; transition: border-color .15s ease; }
.gp-assist-card:hover { border-color: var(--gp-primary); }
.gp-assist-card:disabled { opacity: .5; cursor: not-allowed; }
.gp-assist-card .gp-card-art { height: 64px; }
.gp-assist-title { display: flex; align-items: center; gap: .4rem; font-weight: 700; font-size: .92rem; }
.gp-assist-desc { color: var(--gp-muted); font-size: .78rem; line-height: 1.35; display: block; }

.gp-chips { display: flex; flex-wrap: wrap; gap: 8px; padding-bottom: 12px; }
.gp-chip { background: var(--gp-ghost-bg); border: 1px solid var(--gp-border); color: inherit; border-radius: 999px; padding: 9px 14px; font-size: 0.85rem; cursor: pointer; }
.gp-chip:hover { border-color: var(--gp-primary); }

.gp-input-row { display: flex; gap: 8px; padding-top: 4px; }
.gp-input-row .gp-input { flex: 1; }

.gp-empty { text-align: center; padding: 40px 20px; color: var(--gp-muted); font-size: 0.95rem; line-height: 1.5; }
.gp-confirm { text-align: center; padding: 28px 18px; }
.gp-confirm-icon { color: var(--gp-primary); margin: 0 auto 12px; }
.gp-ref { display: inline-block; background: var(--gp-ghost-bg); border: 1px solid var(--gp-border); border-radius: 8px; padding: 6px 12px; font-weight: 700; letter-spacing: 0.05em; margin: 10px 0; }

.gp-badge { display: inline-block; font-size: 0.72rem; font-weight: 700; padding: 3px 9px; border-radius: 999px; background: var(--gp-ghost-bg); color: var(--gp-text); border: 1px solid var(--gp-border); }
.gp-badge-waiting { background: var(--gp-accent-soft-bg); color: var(--gp-accent-text); border-color: var(--gp-accent-soft-border); }
.gp-badge-pick { background: var(--gp-primary-soft); color: var(--gp-icon); border-color: var(--gp-primary); }

.gp-offer { background: var(--gp-surface); border: 1px solid var(--gp-border); border-radius: 14px; padding: 15px; margin-bottom: 10px; cursor: pointer; text-align: left; width: 100%; color: inherit; }
.gp-offer:hover { border-color: var(--gp-primary); }
.gp-offer-title { font-weight: 700; font-size: 0.98rem; }
.gp-offer-price { color: var(--gp-icon); font-size: 0.85rem; font-weight: 600; margin-top: 2px; }
.gp-offer-desc { font-size: 0.84rem; color: var(--gp-muted); margin-top: 6px; line-height: 1.45; }
.gp-cat { font-size: 0.78rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--gp-faint); margin: 18px 0 8px; }

.gp-stepper { display: flex; align-items: center; gap: 14px; }
.gp-stepper button { width: 38px; height: 38px; border-radius: 10px; border: 1px solid var(--gp-border-strong); background: var(--gp-surface-2); color: inherit; font-size: 1.15rem; cursor: pointer; }
.gp-stepper span { font-size: 1.05rem; font-weight: 700; min-width: 22px; text-align: center; }
.gp-variant-row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 6px; }
.gp-variant { border: 1px solid var(--gp-border-strong); background: var(--gp-surface-2); color: inherit; border-radius: 999px; padding: 9px 15px; font-size: 0.88rem; cursor: pointer; }
.gp-variant-on { border-color: var(--gp-primary); background: var(--gp-primary-soft); }

/* Modal + picker primitives (card prompt sheets, appliance picker, language
   picker). Bottom-sheet on phones, centered dialog on larger screens. */
.gp-modal-backdrop { position: fixed; inset: 0; background: var(--gp-backdrop); display: flex; align-items: flex-end; justify-content: center; z-index: 60; padding: 12px; }
@media (min-width: 520px) { .gp-modal-backdrop { align-items: center; } }
.gp-modal { background: var(--gp-surface); border: 1px solid var(--gp-border-strong); border-radius: 18px; width: 100%; max-width: 460px; max-height: 78vh; display: flex; flex-direction: column; box-shadow: 0 18px 50px rgba(0,0,0,0.35); }
.gp-modal-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 14px 16px; border-bottom: 1px solid var(--gp-border); }
.gp-modal-title { font-weight: 700; font-size: 1rem; display: flex; align-items: center; gap: .5rem; min-width: 0; }
.gp-modal-body { padding: 12px 16px 16px; overflow-y: auto; }
.gp-modal-sub { font-size: .84rem; color: var(--gp-muted); margin: 0 0 10px; line-height: 1.4; }
.gp-prompt-list { display: flex; flex-direction: column; gap: 8px; }
.gp-prompt-item { text-align: left; width: 100%; background: var(--gp-surface-2); border: 1px solid var(--gp-border); color: var(--gp-text); border-radius: 12px; padding: 12px 14px; font-size: .92rem; line-height: 1.4; cursor: pointer; transition: border-color .15s ease; }
.gp-prompt-item:hover { border-color: var(--gp-primary); }
.gp-picker-search { margin-bottom: 10px; }
.gp-picker-list { display: flex; flex-direction: column; gap: 6px; max-height: 46vh; overflow-y: auto; }
.gp-picker-item { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left; background: var(--gp-surface-2); border: 1px solid var(--gp-border); color: var(--gp-text); border-radius: 12px; padding: 11px 13px; cursor: pointer; font-size: .92rem; }
.gp-picker-item:hover { border-color: var(--gp-primary); }
.gp-picker-item-title { font-weight: 650; }
.gp-picker-item-sub { display: block; font-size: .78rem; color: var(--gp-muted); margin-top: 1px; }

/* Local guide (/g/[slug]/local). */
.gp-section-title { font-family: var(--font-portal-serif), Georgia, serif; font-size: 1.15rem; font-weight: 600; margin: 20px 0 10px; display: flex; align-items: center; gap: .45rem; }
.gp-filter-bar { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0 4px; }
.gp-filter-chip { background: var(--gp-ghost-bg); border: 1px solid var(--gp-border); color: inherit; border-radius: 999px; padding: 8px 13px; font-size: .82rem; font-weight: 600; cursor: pointer; }
.gp-filter-chip:hover { border-color: var(--gp-primary); }
.gp-filter-chip-on { border-color: var(--gp-primary); background: var(--gp-primary-soft); color: var(--gp-icon); }
.gp-place-card { display: flex; gap: 12px; background: var(--gp-surface); border: 1px solid var(--gp-border); border-radius: 14px; padding: 14px; margin-bottom: 10px; }
.gp-place-icon { width: 38px; height: 38px; border-radius: 10px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; background: var(--gp-art-bg); border: 1px solid var(--gp-border); color: var(--gp-icon); }
.gp-place-body { flex: 1; min-width: 0; }
.gp-place-title { font-weight: 700; font-size: .98rem; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.gp-place-meta { font-size: .8rem; color: var(--gp-muted); margin-top: 2px; display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
.gp-place-note { font-size: .85rem; color: var(--gp-text); margin: 8px 0 0; line-height: 1.45; }
.gp-place-addr { font-size: .78rem; color: var(--gp-faint); margin: 6px 0 0; }
.gp-place-actions { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
.gp-place-link { display: inline-flex; align-items: center; gap: 5px; font-size: .82rem; font-weight: 600; color: var(--gp-icon); background: var(--gp-ghost-bg); border: 1px solid var(--gp-border); border-radius: 999px; padding: 7px 12px; text-decoration: none; }
.gp-place-link:hover { border-color: var(--gp-primary); }

.gp-spin { animation: gp-spin 1s linear infinite; }
@keyframes gp-spin { to { transform: rotate(360deg); } }

/* -------------------------------------------------------------------------
   Party access + UX overhaul (2026-08-28). Everything below is additive or
   intentionally overrides an earlier rule (later wins at equal specificity).
   ------------------------------------------------------------------------- */

/* Step transitions: every portal screen fades and rises in on mount (the shell
   keys the wrapper by step), so navigation feels continuous instead of a swap. */
.gp-step { animation: gp-step-in .28s ease both; display: flex; flex-direction: column; flex: 1; }
@keyframes gp-step-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }

/* Property hero. Entry steps get the 16:9 cover with a scrim + name overlay;
   a broken/expired host image swaps to a branded monogram tile instead of a
   broken-image icon. Workflow screens get the slim banner (image only). */
.gp-hero { position: relative; width: 100%; aspect-ratio: 16 / 9; max-height: 250px; border-radius: 20px; overflow: hidden; margin-bottom: 18px; border: 1px solid var(--gp-border); background: var(--gp-art-bg); }
.gp-hero-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
.gp-hero-fallback { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-family: var(--font-portal-serif), Georgia, serif; font-size: 3rem; font-weight: 600; color: var(--gp-icon); letter-spacing: 0.04em; }
.gp-hero-scrim { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(5,9,8,0) 42%, rgba(5,9,8,0.66) 100%); }
.gp-hero-caption { position: absolute; left: 16px; right: 16px; bottom: 12px; color: #ffffff; text-shadow: 0 1px 10px rgba(0,0,0,0.5); }
.gp-hero-name { font-family: var(--font-portal-serif), Georgia, serif; font-size: 1.55rem; font-weight: 600; line-height: 1.15; }
.gp-hero-loc { font-size: 0.85rem; opacity: 0.92; margin-top: 2px; }
.gp-hero-compact { position: relative; width: 100%; height: 44px; border-radius: 12px; overflow: hidden; margin: -4px 0 12px; border: 1px solid var(--gp-border); background: var(--gp-art-bg); }
.gp-hero-compact img { width: 100%; height: 100%; object-fit: cover; display: block; }

.gp-kicker { display: inline-flex; align-items: center; gap: 6px; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--gp-icon); margin-bottom: 6px; }
.gp-code-hint { font-size: 0.82rem; color: var(--gp-faint); text-align: center; margin: 10px 0 4px; }
.gp-shake { animation: gp-shake 0.3s ease; }
@keyframes gp-shake { 25% { transform: translateX(-5px); } 50% { transform: translateX(5px); } 75% { transform: translateX(-3px); } }

/* Menu + assistant cards stagger in on entry instead of flash-appearing. */
.gp-menu-card, .gp-assist-card { animation: gp-rise 0.35s ease both; }

/* Chat: messages rise in gently (only newly mounted rows animate — React keys
   keep existing rows stable across polls). The composer is a floating pill
   pinned to the bottom safe-area with a circular service-bell send button. */
.gp-msg-row { animation: gp-rise 0.25s ease both; }
.gp-chat-list .gp-bubble { animation: gp-rise 0.25s ease both; }
@keyframes gp-rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
.gp-typing { display: inline-flex; gap: 5px; align-items: center; }
.gp-typing span { width: 7px; height: 7px; border-radius: 50%; background: var(--gp-faint); animation: gp-dot 1.1s infinite ease-in-out; }
.gp-typing span:nth-child(2) { animation-delay: 0.15s; }
.gp-typing span:nth-child(3) { animation-delay: 0.3s; }
@keyframes gp-dot { 0%, 80%, 100% { opacity: 0.35; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-3px); } }
.gp-composer { position: sticky; bottom: calc(10px + env(safe-area-inset-bottom)); display: flex; align-items: flex-end; gap: 6px; background: var(--gp-surface); border: 1px solid var(--gp-border-strong); border-radius: 26px; padding: 6px 6px 6px 16px; margin-top: 0.85rem; box-shadow: 0 10px 28px rgba(0,0,0,0.28); z-index: 5; }
.gp-composer:focus-within { border-color: var(--gp-primary); }
.gp-composer textarea { flex: 1; min-width: 0; background: transparent; border: none; outline: none; resize: none; color: var(--gp-text); font-family: inherit; font-size: 1rem; line-height: 1.4; max-height: 140px; padding: 10px 0; }
.gp-composer textarea::placeholder { color: var(--gp-faint); }
.gp-send { width: 42px; height: 42px; border-radius: 50%; flex-shrink: 0; border: none; background: var(--gp-primary); color: var(--gp-on-primary); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: transform 0.12s ease, opacity 0.15s ease; }
.gp-send:not(:disabled):active { transform: scale(0.92); }
.gp-send:disabled { opacity: 0.45; }
.gp-send-accent { background: var(--gp-accent); color: var(--gp-on-accent); }

@media (prefers-reduced-motion: reduce) {
  .gp-step, .gp-msg-row, .gp-menu-card, .gp-assist-card, .gp-chat-list .gp-bubble, .gp-typing span, .gp-shake { animation: none !important; }
}
`;

// ---------------------------------------------------------------------------
// Portal theme hook (client). Shared by the portal shell and the local guide so
// the guest's light/dark choice follows them across portal pages. Dark is the
// default; a stored light choice applies right after mount.
// ---------------------------------------------------------------------------
export type PortalTheme = 'dark' | 'light';
const THEME_STORAGE_KEY = 'gp-theme';

export function usePortalTheme(): { theme: PortalTheme; toggleTheme: () => void } {
  const [theme, setTheme] = useState<PortalTheme>('dark');

  useEffect(() => {
    try {
      if (window.localStorage.getItem(THEME_STORAGE_KEY) === 'light') setTheme('light');
    } catch {
      // Private-browsing modes can throw; the dark default simply stays.
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      const next: PortalTheme = current === 'dark' ? 'light' : 'dark';
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        // Still applies for this view even if it cannot persist.
      }
      return next;
    });
  }, []);

  return { theme, toggleTheme };
}
