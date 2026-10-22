# MANITO QA R1 - local implementation report

Date: 2026-10-22. Branch: `codex/qa-cycle-001/integration`.
Functional base: `9366f2ab2d4f864e1e2b5e3c64e5445d7f0a972f`.
Scope: accepted R1 presentation/interaction fixes B1-B5, no remote writes.
Status: FIXED_LOCAL / NOT DEPLOYED / HUMAN TEST PENDING.

## Stable IDs and return to Claude

| ID | Decision | Local result | Fix commits |
| --- | --- | --- | --- |
| N1 | ACEPTADO | FIXED_LOCAL: Continue opens review; distinct button identity and final submitter guard prevent publication without explicit final action. Native input Enter does not publish. | 048326e |
| N2 | ACEPTADO | FIXED_LOCAL: failed/expired direct requests prioritize the existing client decision, not automatic searching. No unassigned chat/tracking invitation. | 62d311f |
| N3 | ACEPTADO | FIXED_LOCAL: immediate busy/disabled feedback through action and refresh; duplicate guard/errors preserved. Real network latency cause remains unmeasured. | ea95ce3 |
| N4 | ACEPTADO | FIXED_LOCAL: own reservation remains in Hoy with detail access, separate from contracted work; role-aware waiting text. Existing acceptance notice preserved. Backend, not device clock, resolves reservation. | 62d311f, ea95ce3, 3f64427 |
| N5 | ACEPTADO | FIXED_LOCAL: unevaluated/loading/error do not mean zero compatible professionals. Recommendation copy does not infer compatibility from ranking. Review names actual effective assignment. No prepublication deadline. | 2bf7eca |
| N6 | ACEPTADO | FIXED_LOCAL: constrained order grid, recovery form display, wrapping and correct mobile price column. No overflow hiding. | 511feb5 |
| N7 | ACEPTADO | FIXED_LOCAL: closure guidance uses known payment/rating facts, neutral on missing/error/refund/not-required states. Unknown rating does not enable rating CTA. Historical chat access preserved. | 62d311f, 3f64427 |
| N8 | PRODUCT_DECISION_REQUIRED | NOT IMPLEMENTED: owner chooses initial/remembered experience behavior. | none |
| N9 | ACEPTADO | FIXED_LOCAL: exhaustive manual-state labels; arrival estimate only while an assigned professional is expected to arrive. | 62d311f |
| N10 | RECHAZADO: missing-cron cause | NOT IMPLEMENTED: B07 cron already exists. Specific notification delivery remains unproven; requires a new authorized fixture. | none |

PD-CANCEL-001 remains an owner decision. No cancellation policy was changed.
The October 22 17:22 R2 work and September 14 evidence order were not touched.

## Independent collaboration

- Astra Medium froze the MASTER and performed read-only code review.
- A separate QA agent built isolated real-App browser tests with API fixtures.
- Claude Code Pro supplied one bounded product-review exchange with tools/MCP
  disabled and anonymous context only. It did not perform live browser or data QA.
- Reviewer found four P2 issues in the first candidate: clock-based disappearance,
  refund/unknown payment inference, empty/fallback payment results, and early
  rating CTA. All were corrected and re-reviewed with no further findings in that delta.
- Architect explicitly revised B3: a passed local deadline changes only copy to
  "Plazo terminado. Actualizando estado", not authoritative reservation state.

## Runtime evidence and cause qualification

Baseline bundle `08a0702c0511` reproduced N1: clicking resolution Continue caused
one `createV6Order` call and zero visible review screens. After correction both
mouse and touch produced zero writes, then one write from explicit publication.
This confirms the observed failure locally rather than relying on a source hypothesis.

For N6 a 302px card had a 342.266px implicit grid track. A generic payment-box
flex selector overrode its inline grid form, and the mobile price selector still
targeted a direct `b` although the amount was now inside a `span`. CSS fixes target
those layout causes. Measured affected cases have zero escaping descendants and
zero internal overflow after correction, including long prices.

## Validation

- Full suite once: 434 tests, 61 files passed.
- Explicit `pnpm exec tsc --noEmit`: passed.
- Final `pnpm run vercel-build`: passed, including Next TypeScript check.
- First build failed because this clean worktree lacked required public
  `NEXT_PUBLIC_APP_URL`; retry used `https://app.manitoapp.com.ar` in process env.
  No secret/env file or remote configuration was changed. Generated PWA files
  were restored to their original tracked contents; no PWA change is delivered.
- Following the final reviewer fixes, 23 affected unit tests passed again.
- Browser corpus: 80 distinct isolated cases passed: wizard 8, states/closure 31,
  professional feedback/reservations 5, recommendation/eligibility 6, layout 30.
  Final reviewer changes were rechecked with affected browser cases, plus six
  reservation geometry cases at 360x800, 390x844 and 1280x900.
- Real App and form DOM, real CSS and PWA guard with fixture update port; backend
  API calls are synthetic. External browser traffic is blocked; unknown API calls,
  browser/console/resource errors fail the harness. No real accounts or credentials.
- Screenshots/measurements are under ignored `outputs/qa-r1/`; source-hash manifests
  identify exactly which application sources each bundle exercised.
- Automated/browser evidence does not certify physical Android/PWA behavior,
  real two-account Realtime, delivery latency, authorization or production writes.

## Reproduction

Use Node/pnpm dependencies from the lockfile and an external Playwright installation.
Set `MANITO_PLAYWRIGHT_MODULE` to its `index.mjs` and, where appropriate,
`MANITO_BROWSER_CHANNEL=msedge`. Run each `scripts/qa-r1/*-browser.mjs` from repo root.
These scripts mock the backend and do not load QA credentials or a real Supabase SDK.
No Playwright dependency or package/lockfile change was added to the application.
`node scripts/qa-r1/serve.mjs` also serves a loopback-only synthetic preview of the
real UI, without real account access. It is not a two-account or production test.

## Files

- `app/components/ManitoV6App.tsx`: explicit request intent, status/guidance,
  reservation context, visible progress and eligibility query presentation.
- `app/globals.css`: scoped order-card and recovery-form containment.
- `app/lib/v6Types.ts`: neutral default price-confirmation label only.
- `tests/qa-r1-presentation.test.ts`: actual-helper behavioral unit regressions.
- `scripts/qa-r1/{entry.tsx,fixtures.ts,harness.mjs,serve.mjs}`: isolated real-App
  runtime, API fixtures, source manifests, external-traffic blocking and local preview.
- `scripts/qa-r1/{wizard,order-states,pro-feedback,recommendations,mobile}-browser.mjs`:
  interaction, error, closure, query-state and measured layout regressions.
- `docs/qa/QA_R1_IMPLEMENTATION_MASTER_TASK.md`: Architect contract and review clarification.
- This report. The original R1 report and triage remain historical reception evidence.

## Product opportunities - recommendations only

1. Carry current state and next actor into the existing Workroom header, always
   using the same authorized order data as the detail. Airbnb exposes reservation
   status within its message thread: [official reference](https://www.airbnb.com/help/article/234).
   This would extend B2 to a new surface, not add a new state or open precontract chat.
2. Validate the new visible-reservation model before adding more professional
   dashboard features. Airbnb distinguishes pending from confirmed:
   [official reference](https://www.airbnb.com/help/article/2810). The concrete R1
   visibility defect is already fixed in B3; do not commission it again as a feature.
3. Evaluate whether the existing closure summary and Workroom need better linking,
   not duplicate summaries or a new ledger. Taskrabbit emphasizes contextual records:
   [official reference](https://support.taskrabbit.com/hc/en-ca/articles/46260518656667-Why-Should-I-Use-the-Chat-Thread).
   Existing contract, extras, evidence and payment records remain authoritative;
   chat text does not approve financial changes. Field/role choices need product review.

Claude challenged treating these as independent features: fix inconsistent states
first and inspect existing summary capabilities before proposing more UI. No
competitor payment, guarantee, deadline or cancellation policy is adopted.

## Delivery boundaries and next gate

No migrations, SQL/RPC/API changes, main integration, push or deployment.
No changes to QA credentials, users, Azul, Auth, PWA logic, branding or economics.
Production remains outside this local delivery. Claude must check the actual
deployed `/pwa-version.json` before a future production retest; until then every
accepted issue is FIXED_LOCAL, never DEPLOYED or RETEST_PASSED.

Next: authorize scoped integration/deployment separately, coordinate the protected
R2 fixture, then independent two-account retest and owner physical Human Test.
