# Runbook: Incorrect AI Answer

**Trigger:** A host or guest reports that the concierge gave a wrong, misleading, or
inappropriate answer.

**Owner:** Support on-call + the property's host.

## Steps

1. Capture the property, the exact question, and the answer given (screenshot/timestamp).
2. Determine the source: is the underlying fact **wrong or missing in the Property Brain**?
   The concierge answers only from host-provided content (`lib/guest/concierge.ts`).
   Most wrong answers trace to stale or absent brain content.
3. Have the host **correct the Property Brain** (add/fix the document, FAQ, or
   recommendation). Re-test the same question in the host preview.
4. If the answer was a **hallucination despite correct content**, note the confidence
   behavior: the concierge should refuse/escalate when not confident
   (`DEFAULT_CONFIDENCE_THRESHOLD`). File an engineering ticket with the transcript.
5. If the answer touched **emergency/medical/legal/financial** territory, verify the
   AI-policy disclaimers and emergency handling surfaced correctly (see
   `emergency-safety.md`). This is higher priority.
6. Confirm the fix with the reporter.

## Escalation path

Support → Host (content fix) → Engineering (retrieval/confidence/guardrail bug) →
review against `/legal/ai-policy` commitments.

## Customer comms template

> Thanks for flagging this — the concierge should never state that. We've {corrected the
> underlying property information / escalated this to our engineering team}. It should
> now answer correctly; please let us know if you see it again.
