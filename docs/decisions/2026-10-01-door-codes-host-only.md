# Door codes are host-only

**Date:** 2026-10-01
**Status:** Applied to production (migration `20261001122531_door_code_host_only`)

## Decision

Moche-AI never presents a door, building, lockbox, or gate code to a guest, and never
sends one to a model. Hosts may still keep the code in Moche-AI for their own records.

| Surface | Behavior |
|---|---|
| Host dashboard | Optional `door_code_or_entry_method` field. Vault-encrypted, tier `host_only`, audience `host_private`. Revealed only by `POST /api/host/properties/[id]/brain/door-code` (owner or Brain editor), audit-logged as `brain.door_code_revealed` before the read. |
| Guest portal / AI | A door or entry code question skips retrieval and the model and becomes a host escalation (`lib/guest/credential-questions.ts`, `app/api/guest/[slug]/chat/route.ts`). Lockouts are flagged urgent. |
| Guest-facing guidance | New `entry_instructions` field: how to get in, written without the code. It replaces the door code as the access hard block. |
| Database | `brain_values_read_host_secret` is service-role only and refuses any field that is not a `host_only` Vault secret. `brain_values_set_secret` is no longer executable by `authenticated`. |

This mirrors the existing Wi-Fi model: `wifi_password` is a legacy, unscored secret and
`wifi_password_location` is the guest-safe hard block (`lib/guest/wifi-instructions.ts`).

## Layers of protection

1. Registry tier `host_only` excludes every guest audience (audience matrix CHECK).
2. Vault routing rejects plaintext values for the field.
3. The chat route intercepts entry-code questions before any model call.
4. `redactCredentials` still runs on every guest-facing answer.
5. The only read path is service-role, host-only, permission-checked, and audit-logged.

## Follow-ups

- Regenerate `field_registry.json` from `scripts/build-field-registry.py` and commit it.
- Regenerate `evals/golden-v1.json` with `scripts/build-golden-evals.mjs`.
- Brain editor UI: show the door code as host-only with a Reveal button that calls the route above.
