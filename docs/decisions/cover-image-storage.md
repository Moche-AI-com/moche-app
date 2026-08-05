# Decision: cover images are stored in S3, served through the app

Backlog ticket: **P4-04** (blocking P4-05, referenced by P4-01).
Status: **decided**. Date: 2026-08.

## Decision

Property cover images are stored in the existing **private S3 bucket**, not in
Supabase Storage, and are served to browsers through an app route rather than a
public object URL.

## Why not Supabase Storage

The enhancement plan assumed Supabase Storage. Every other binary asset in this
codebase already goes to S3 through `lib/storage/s3.ts` (presigned PUT/GET,
private bucket, SSE at rest, TLS-only bucket policy, versioning plus lifecycle
expiry, least-privilege IAM key scoped to one bucket). Introducing a second
storage backend for a single column would mean two sets of credentials, two
retention policies, two audit surfaces, and two failure modes to reason about
during an incident, for no capability we do not already have.

## Shape of the pipeline

1. `POST /api/properties/:id/cover` accepts either a `multipart/form-data` file
   or a JSON body with an `https` image URL.
2. Pasted URLs are fetched **server-side** through the shared SSRF guard
   (`lib/net/ssrf.ts`) and stored. Guest portals never hotlink a third-party
   host, so no guest request leaks to an external server and no cover can break
   because someone else deleted their file.
3. The source image is capped at **2 MB** and must sniff as JPEG, PNG, or WebP
   from its magic bytes. The browser-declared MIME type and the file extension
   are both treated as untrusted.
4. Sharp resizes with `fit: cover` into three fixed 16:9 derivatives —
   `hero` 1600x900, `card` 800x450, `thumb` 400x225 — all re-encoded to JPEG.
   Re-encoding also strips EXIF, which removes any GPS coordinates a host's
   phone photo carried.
5. Derivatives are PUT to `properties/<id>/covers/<version>/<size>.jpg`, where
   `version` is a fresh 32-hex token per upload.
6. `properties.cover_image_url` is set to
   `/api/properties/<id>/cover?v=<version>&size=hero`.

## Why the version is in the URL

`GET` on the same route streams a derivative back. It only serves a key whose
version matches the version currently recorded on that property row, so the
route cannot be turned into a read primitive for arbitrary bucket keys. Because
the URL changes on every upload, responses are safely cacheable as
`public, max-age=31536000, immutable` and a replaced cover is never stale.

## Consequences accepted

- Cover bytes transit the app server on upload (Sharp must see them). This is
  the one deviation from the presigned direct-to-S3 pattern, bounded by the 2 MB
  cap.
- Cover reads are proxied, so they consume serverless invocations. The immutable
  cache header plus CDN edge caching keeps this to roughly one origin read per
  edge per version.
- Pre-existing external `cover_image_url` values keep working unchanged; they are
  simply not managed by this pipeline. `isManagedCoverUrl()` distinguishes them.
- `sharp` is a native dependency. Vercel's Node runtime ships a compatible
  prebuilt binary; the route is pinned to `runtime = 'nodejs'` and must never be
  moved to the edge runtime.

## References

- `lib/storage/cover-image.ts` — pure contract (sizes, limits, keys, sniffing)
- `app/api/properties/[id]/cover/route.ts` — POST / GET / DELETE
- `components/PropertyCoverUploader.tsx` — host-facing upload UI
- `lib/net/ssrf.ts` — outbound fetch guard shared with listing ingestion

## P4-01: what the create form requires

Property creation keeps its existing minimum: display name, city, country, plus
timezone and locale (both pre-filled). A cover image is deliberately **not**
required at creation time, for two reasons:

1. The upload pipeline keys objects by property id (`properties/<id>/cover/...`),
   so there is no id to key against until the row exists.
2. Requiring a photo before a host can see anything working adds a hard stop to
   the very first thing they do in the product. The cover image is presentation,
   not correctness, and the guest portal renders a clean gradient fallback
   without one.

The cover control therefore lives on the property's settings page, and the
property page nudges hosts toward it through the existing Brain-health surface.

## P4-02: optional listing link at creation

The create form accepts an optional listing URL. The fetch does **not** run
inside `createPropertyAction`. Listing sites are slow, rate limited, and often
bot-walled; letting that work sit inside the create path means a blocked fetch
either stalls the form or fails a creation that should have succeeded.

Instead the action redirects to `/dashboard/properties/<id>?import=<url>` and a
client component on the property page fires the import once against the existing
`POST /api/properties/:id/ingest/url` route, then clears the query parameter so a
refresh cannot re-run it. Success and failure are both visible states with a next
action attached. The URL is re-validated server side before it is handed to the
client, and the ingest route applies its own SSRF guard (`lib/net/ssrf.ts`)
independently.

As with every other ingestion path, the result lands in `proposed_updates` for
host review. Nothing scraped from a listing page reaches the Brain unreviewed.
