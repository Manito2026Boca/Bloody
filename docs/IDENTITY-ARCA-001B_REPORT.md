# IDENTITY-ARCA-001B

## Scope and release base
Approved local base 33196de; App production before release e85d3f9, deployment dpl_338eqsjfkFgefVjgZKvrY6wNRw6g. Remote main was 802f492: the domain migration already deployed outside main is an ancestor of this candidate. Public web remains in its separate project. No domain, Auth, SMTP, Push or branding configuration changes.

## Approved matrix
20 LEVEL_1 services, 3 LEVEL_2 (gas, mudanzas, fumigacion), 2 LEVEL_3 (arquitectura, ingenieria). Existing catalogue names/slugs are unchanged. Electricidad / Instalaciones is LEVEL_2 with electrical_installer_registration; the other existing electrical specialties and all plumbing specialties are LEVEL_1. Unknown future activities fail closed.

## Sector review
Reuse professional_documents upload/review. Additional private provider_activity_reviews records document reference, registry/number, manual decision, server timestamp, reviewer and limited observation. Only actual Admin writes; owner/Admin read via scoped RPC; no direct client grants. Gate requires approved document AND corresponding approved sector review. Document replacement/revocation invalidates review, including when later reapproved. Admission and sector review serialize through the canonical identity lock.

Gas uses gas_installer_registration. Fumigation uses pest_control_authorization with municipal framework and technical-responsible applicability/reason, not a universal agronomist requirement. Mudanzas uses a manually reviewed transport_vehicle_review dossier: vehicle/scope plus applicability, verification and evidence reference or non-applicability reason for PBA cargo, vehicle-dependent licence, vehicle documentation, motor insurance and VTV. No LiNTI or national RUTA requirement; no fleet system or external registry integration.

## Insurance
Remove only insurance from universal settings and blocking onboarding count. Optional historical/general insurance remains uploadable and visible, with no deletion or invalidation. Motor insurance is evaluated explicitly within transport review.

## Pilot scope limits
Plumbing LEVEL_1 does not cover new public-network connections or formal sanitation works; gas installations belong to Gasista LEVEL_2. Masonry LEVEL_1 covers plastering, floors, repairs and non-structural walls/partitions, not structural alterations/extensions or building projects. These are operational review rules, not an automatic free-text classifier. Air-conditioning has no new universal state registration or manufacturer-warranty requirement. Architecture/engineering remain outside pilot.

## Migrations
Apply 20260929194755_identity_arca_001.sql then 20260930033618_identity_arca_001b_activity_matrix.sql. Historical migrations unchanged. Matrix IDs resolve from catalogue slug/name. Existing profiles, ratings, jobs and documents untouched. Existing 16 Pro + 2 Client QA accounts retained; private allowlist and server app_metadata remain required. Never edit Azul.

## Verification
Focused identity/onboarding/activity tests; isolated SQL suite includes matrix, private access, LEVEL_1 without insurance, LEVEL_2 document-only denial, approved review, revocation/reapproval and conditional transport. PostgreSQL 17 concurrency includes 12 independent sessions and sector revocation/admission. Browser fixtures cover actual identity and sector-review components at 360x800, 390x844 and desktop; not real Supabase or Human Test. Full suite, TypeScript/build and remote preservation/security checks are required before release readiness.

## Rollback
Previous App deployment dpl_338eqsjfkFgefVjgZKvrY6wNRw6g is the application rollback target. Do not remove private identity/review/events, delete claims, undo canonical links or relax the admission gate as an automatic rollback. The old frontend cannot complete the new identity workflow; an App rollback therefore restores old presentation, NOT old admission rules. If backend repair is needed, use a reviewed incremental forward fix and preserve audit/history. No reverse migration is executed.

## Human Test pending
1. New LEVEL_1 professional: submit own CUIT and base identity/tax documents without generic insurance.
2. New Gasista: submit sector evidence; Admin reviews registry/number, document, fiscal identity and ownership.
3. Second account submits same own-test CUIT: neutral response, no third-party identity disclosure or duplicate canonical profile.
4. Admin records FOUND, checks ownership, links identity, approves profile and enables operation as separate decisions.
5. Admin tests REJECT / NEEDS_REVIEW and checks restricted operation.
6. Pending identity cannot accept new work; existing contracted execution remains available.
7. Verified/enabled professional with approved activity requirements accepts compatible work; LEVEL_3 cannot enter pilot.
8. Client/another professional cannot read fiscal identity or sector details of someone else.

## Accepted limitations
No automatic registry checks/expiry detection. Sector verification must be rechecked manually when circumstances change. Transport verification covers the declared vehicle/scope; a changed vehicle requires renewed Admin review. Operational scope exclusions require human review; no classifier has been introduced. Human validation is not marked approved by technical tests.
