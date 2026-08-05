// Static-asset module declarations for `tsc --noEmit`.
//
// WHY THIS FILE EXISTS
// --------------------
// `components/landing/*` imports .webp/.jpg files directly (`import hero from
// '@/public/premium/str-hero-beachhouse.webp'`). Those module types normally come
// from `next-env.d.ts`, which Next generates on `next dev` / `next build` and
// which .gitignore excludes (line 148).
//
// The consequence is that `npm run typecheck` fails with 8 TS2307 errors on any
// checkout where a build has not been run yet, which is exactly what a clean CI
// runner is. Rather than make the typecheck job run a full production build just
// to generate a 2-line file, reference the same Next-provided declarations from a
// tracked file.
//
// This is additive and cannot conflict with next-env.d.ts: both resolve to the
// same declarations in next/image-types/global, and TypeScript deduplicates
// identical triple-slash references.

/// <reference types="next/image-types/global" />
