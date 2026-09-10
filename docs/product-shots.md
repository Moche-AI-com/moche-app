# Product screenshots for the marketing pages

The articles ship real product imagery rather than stock photography. The
captures live in `public/premium/product-*.png`, are committed assets, and are
produced by `scripts/capture-product-shots.mjs` driving a production build with
Playwright at two fixed frames.

## Run it

```bash
npx playwright install chromium   # once per machine
npm run build && npm run start    # production build on :3000
npm run capture:product-shots
```

Public surfaces (landing, how-it-works, guest-experience) always capture. The
host-side surfaces need the demo account:

```bash
DEMO_EMAIL=demo@moche-ai.com \
DEMO_PASSWORD=… \
npm run capture:product-shots
```

Optional: `DEMO_PROPERTY_ID` deep-links a specific property (otherwise the
dashboard's first property card is used), and `PORTAL_URL` captures a live
guest portal — a host preview link or a real guest link on the demo property.

## What it produces

| File | Surface | Frame |
|---|---|---|
| `product-landing-{desktop,mobile}.png` | Homepage hero + arc | always |
| `product-how-it-works-{desktop,mobile}.png` | Article page | always |
| `product-guest-experience-{desktop,mobile}.png` | Article page | always |
| `product-dashboard-{desktop,mobile}.png` | Dashboard overview | with demo login |
| `product-brain-{desktop,mobile}.png` | Property Brain manager | with demo login |
| `product-go-live-{desktop,mobile}.png` | Brain go-live readiness | with demo login |
| `product-local-recs-{desktop,mobile}.png` | Local Recs + map | with demo login |
| `product-portal-{desktop,mobile}.png` | Guest portal chat | with PORTAL_URL |

Desktop frames are 1600×900 — exactly the 16:9 frame `PageHero` renders on the
articles, so a capture drops in without cropping. Mobile frames are 390×844 at
2× device pixel ratio.

## The demo account

One dedicated account — `demo@moche-ai.com` — owns a single seeded property
("The Cliffside Cottage") with a complete Brain, one live stay, a handful of
approved local recommendations, and no personal data. Everything the
screenshots show comes from it. The credentials live in CI secrets and the
shared password manager; they never appear in the repo.

Local Recs renders Mapbox tiles, so the build the script drives needs the
server Mapbox token in its environment — the same `moche-app-server` token the
app uses in production.

## Where the captures land

The articles' opening figures and Related cards take `StaticImageData` in
`app/(marketing)/_parts.tsx`, so swapping a page to product imagery is one
import line. Intended mapping:

- **/how-it-works** — `product-go-live-desktop.png` (the publish-readiness
  surface is the page's subject)
- **/guest-experience** — `product-portal-desktop.png` (the portal is the page's
  subject)
- **/about, /security, /support, /resources/guest-communication-guide** — keep
  the photography. These are brand and editorial pages; the property images are
  doing the right job there.

Swap those two pages only after the generated PNGs are committed — the build
fails on a missing import, so the pipeline and the imagery must land before the
article wiring.

## Cadence

During beta, regenerate when a captured surface visibly changes, and review the
diff like any other asset change. Once the UI settles this can become a CI step
on `main` or a weekly Trigger.dev schedule; until then it runs on demand.
