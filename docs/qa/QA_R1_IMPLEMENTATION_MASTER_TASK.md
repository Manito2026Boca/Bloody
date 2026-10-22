# QA R1 implementation MASTER TASK

Date: 2026-10-22. Architect: Astra Medium (Poincare); integrator: Codex.
Functional base: `9366f2ab2d4f864e1e2b5e3c64e5445d7f0a972f`.
Documentation base: `e8a37d3069dbf77662624dc36f9f7e82efce5325`.

## Authority and boundaries

The continuation authorizes local accepted R1 corrections and independent tests.
No push, deploy, remote SQL writes, QA credential changes or production fixtures.
Preserve the October 22 17:22 R2 order and September 14 direct-request evidence.
N8 and PD-CANCEL-001 require the owner; N10 has no proven delivery defect.
No new marketplace, economic, timeout, PIN, Auth, PWA or branding rules.

## Ownership and order

One writer owns application TSX, helpers, CSS and unit tests. Sequential blocks:
B1 -> B2 -> B3 -> B4 -> B5. Independent QA owns only new `scripts/qa-r1/**`.
Claude supplies read-only independent review and recommendations, not remote writes.
No Package B: these fixes share the central application file.

## Frozen behavior and interfaces

### B1: N1 explicit publication intent

Continue and Publish have distinct DOM identities. Only an explicit final review
CTA may create/edit an order; implicit submit is not publication intent. Preserve
native validity, drafts/back navigation, PWA guards and duplicate guards. Do not
store stale intent across back/error. Reproduce baseline before modifying footer.
Test real rendered form with mocked API: mouse/touch Continue, earlier-step Enter
produce zero writes; final mouse/touch/keyboard produces one; double activation,
error/retry and precontractual editing remain safe.

### B2: N2/N7/N9 and N4 role copy

Extend existing helpers, not a new presentation architecture:
`orderStatusText(order, proposalsCount = 0, role?)` has a neutral default;
`orderNextStepText(order, role, completionContext?)` accepts already loaded closure
facts. Missing/failed payment or rating loads mean unknown, not unpaid/unrated.
Reuse `manualRequestNeedsClientDecision`, including expiry by clock, as presentation
only. Direct-request recovery outranks generic searching. Pending reservation copy
must use the viewer's role. Translate all manual-response enum values. Without an
assigned professional do not invite chat/tracking. Preserve historical authorized
Workroom access. Terminal copy must not imply active coordination; confirmed paid
and rated work must not request those tasks again. Disputed payments remain clear.
ETA only when assigned, positive/valid and in accepted/en_camino, explicitly estimated.

### B3: N3 and N4 persistent context

Render `advancing` before the first await until action and refresh complete; keep
the existing ref, errors and PIN validation. Disable CTA with Procesando feedback.
Derive own pending-client-confirmation reservations from existing activeOrders and
`price_confirmation_professional_id`. Show separately in Hoy with existing detail
access, not as contracted execution. Foreign/resolved/expired data must not appear
as actionable; do not duplicate once contracted. Preserve Trabajos and existing notice.

### B4: N6 measured containment

Measure the actual overflowing descendant/min-content chain before changing CSS.
Use local containment, never hide important overflow. Verify both roles, long price,
copy/actions at 360x800, 390x844 and desktop. No redesign.

### B5: N5 eligibility presentation

Add local query status unevaluated/loading/success/error while retaining key/ids.
Zero availability is true only for a successful current-key result. Stale, failed
or different-service results do not mean zero. Recommendation notices must not
claim backend compatibility from ranking alone. Review describes effective existing
assignment and selected person; do not invent a response deadline before publication.
Preserve ranking, preselection, filters, automatic fallback and payload. If changing
them becomes necessary, stop that part with ARCHITECT_DECISION_REQUIRED.

## Validation and return

Focused tests per block; independent final review; full suite once, TypeScript,
build and local mocked Browser QA on final candidate. Human/two-account production
test remains pending. Report N1-N10 decisions separately from local/deployed/retest
status, with commits and test limits. Product benchmark ideas are recommendations,
not authorization to implement features or policies.
