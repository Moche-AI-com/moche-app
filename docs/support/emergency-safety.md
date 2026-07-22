# Runbook: Emergency / Safety Report

**Trigger:** A guest reports an emergency or safety issue (fire, gas, injury, break-in,
flooding, etc.) via the concierge, or an escalation is flagged as an emergency.

**Owner:** Support on-call (immediate) + the property's host.

> **The product is not an emergency service and cannot dispatch help.** Our role is to
> ensure the guest is directed to real emergency services and the host, fast.

## Steps

1. **First, life safety.** Ensure the guest has been told to contact local emergency
   services (911 in the US, 112 in the EU/UK). The concierge detects emergencies
   (`EMERGENCY_PATTERNS` in `lib/guest/concierge.ts`) and surfaces this instruction
   per-message; confirm the guest saw it.
2. **Notify the host immediately** through all available channels (the escalation
   notification + direct contact). The host is responsible for on-site response.
3. Do **not** let the AI attempt to manage the emergency or give safety-critical
   instructions — that is explicitly out of scope (`/legal/ai-policy`, `/legal/terms`).
4. Stay available to relay information between guest and host until resolved.
5. After resolution, log the incident. If it reveals a product gap (e.g., emergency not
   detected), file an engineering ticket and review `EMERGENCY_PATTERNS`.

## Escalation path

Local emergency services (guest-initiated) **first** → Host → Support lead →
Engineering (post-incident, for detection/UX gaps).

## Customer comms template

> If you are in immediate danger, call your local emergency number now (911 US / 112
> EU-UK). I'm also alerting your host right now. I'll stay with you here to help
> coordinate — but please treat emergency services as your first contact.
