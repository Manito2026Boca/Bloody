# R1 approved product decisions - N8 and PD-CANCEL-001

Base: `f8bef5b825f0f28d66593eaafe7bea47974e008b`.
Owner approved both recommendations in this conversation on 2026-10-22.
Architect: Astra Medium. One application writer; independent QA owns harness scripts.
Local implementation only; no production writes, push or deployment authorization.

## N8 - explicit mode preference

Approved: remember the last explicitly chosen experience per account and device;
first entry Client. Switching experience never changes availability or privileges.
Versioned localStorage holds only client/professional, scoped to authenticated ID.
Invalid/inaccessible storage falls back to Client without overwriting the preference.
An incoming valid intent takes priority but does not overwrite the saved choice.
Session changes reset the in-memory hydration marker; existing load epochs discard
stale account loads. Restore during layout initialization, before visible rendering.

Evidence clarified an Architect assumption: existing `getV6MyCapabilities` exposes
Admin only, and the experience selector permits Professional/onboarding to everyone.
Preserve that exact UI eligibility. Professional experience is not authorization
to operate; onboarding/identity/backend gates stay intact. Do not infer access from
Admin, role metadata, availability or a stored preference. The helper supports an
explicit false access fallback, without introducing a new restriction in this app.

## PD-CANCEL-001 - guidance, not a new cancellation policy

Approved: retain the existing inability to cancel after work starts and provide
"Tengo un problema" guidance. Display only during working, for the two participants.
Link to the existing authorized work chat and the same order's payment/Protection
information. Explain preserving conversation/evidence and that the final PIN does
not request cancellation or assistance. No new request, transition or financial rule.

Important partial-delivery limit: no configured general assistance destination was
found in current sources. Chat is with the counterpart, not MANITO support. Protection
case creation remains restricted to post-completion eligibility/window. Do not open
it early, invent contact information or promise immediate support. The informational
guide is deliverable; a real in-progress assistance channel is still an operational
gap requiring an owner-selected destination and a separately scoped implementation.

## Acceptance

N8: first entry, explicit switches, reload, account/device isolation, logout/login,
invalid/denied storage, incoming intent precedence, no availability writes.
Guidance: both roles, working-only, no cancellation CTA/RPC, no professional PIN
exposure, usable mobile 360/390, opens existing information, preserves chat permission.
Physical Human Test remains pending; synthetic browser tests do not certify live Auth.

## Local result and checks

N8: FIXED_LOCAL. PD-CANCEL-001: approved policy retained and guide implemented;
real in-progress assistance remains an operational gap, not a delivered channel.
Suite: 440 tests/62 files PASS. Explicit TypeScript PASS. Production build PASS
with the required public APP URL; generated PWA artifacts restored, no PWA changes.
After reviewer corrections, 21 affected unit tests PASS. Nine browser cases PASS:
reload/account isolation, empty/error catalog, explicit intent, notification
priority and guidance for both roles at 360/390. No availability or cancellation
writes. Browser APIs/sessions are synthetic and external connections blocked.
An initial intent fixture included unsupported query parameters and was corrected
to use the actual valid URL; no application validation was relaxed for that test.
Architect review closed two P2 follow-ups (catalog dependency and notification
priority). Test-harness ownership returned to the integrator for the final cases.

Files: central App, `app/lib/experiencePreference.ts`, its unit tests, isolated
fixtures/harness and `scripts/qa-r1/product-decisions-browser.mjs`, and this record.
No schema/API/RLS, pricing, PIN-validation, availability or cancellation-rule changes.
No main integration, push/deploy or shared data/account modifications.
