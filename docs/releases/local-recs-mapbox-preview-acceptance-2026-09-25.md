# Local Recs — Mapbox Preview acceptance

Status: draft PR only. Do not merge, enable in Production, or use a real guest stay. No guest code, token, session, or guest identity belongs in this record.

## Scope

- Test only the designated, owner-controlled stay at the designated live demo property.
- Vercel Preview variables `LOCAL_LIVE_MAPBOX_ENABLED=true` and `LOCAL_LIVE_MAPBOX_PROPERTY_ID=<designated property UUID>` are scoped to `feat/local-recs-concierge-20260925`. Neither variable should be set for Production.
- A new Preview deployment is necessary after adding variables; confirm its commit and READY state before testing.
- Live POI results are temporary Search Box responses. Do not write them to `places`, `property_place_recommendations`, logs, AI training context, or a persistent cache. Host-authored recommendations are separate.

## Owner-assisted live test

1. Open the protected Preview deployment and enter the controlled stay using the normal guest verification flow. Never send the visit code or cookie to a reviewer.
2. Open Local Guide. Host guide is selected, shows only guest-visible approved entries, and makes zero live POI requests on initial load.
3. Switch to Explore nearby. The UI identifies Mapbox as the source and says results are not host picks. Switching alone makes zero live POI requests.
4. Search once for coffee. Expect no more than six places, a source/check time, usable links when supported, and no host endorsement or unverified open-hours claim. Observe a request to the property-scoped `GET /api/guest/[slug]/local/search` route.
5. Switch back to Host guide. Previously fetched provider results disappear from the view; saved picks remain intact. Refresh the page and verify provider results have not become saved recommendations.
6. Check denial states using an expired/unauthorized session and a different property. Both must fail before any Mapbox request. Test a provider failure with mocks only.
7. Inspect only aggregate status and cost telemetry. The route records a hashed rate-limit event; it must not log guest query text, tokens, or personal contact data.

## Abort and rollback

Stop on unexpected Mapbox charges, leaked guest data, provider details shown as host-approved, a cross-property result, an unsafe link, or 5xx errors. Disable or remove the branch-scoped Preview flag and create a fresh Preview deployment. No Production flag should be created as part of this acceptance.

## Release gates still open

- Localize the newly added guest UI copy for the portal's supported languages.
- Validate property/account-level usage limits and Mapbox billing settings in addition to the per-session rate cap.
- Confirm live provider access, UI behavior on mobile, and database non-persistence after the owner-assisted test.
- Keep Mapbox Search Box data temporary unless a separate Mapbox storage agreement explicitly permits durable POIs.
- Review the draft PR against current main, complete source-specific security review, and approve deployment separately.
