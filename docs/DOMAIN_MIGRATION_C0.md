# DOMAIN-MIGRATION-001: F0 / C0 evidence and ownership

Scope: reversible shared contracts only. This document does not authorize Implementer A/B, remote configuration changes, deployment, or cutover. The approved architecture remains `DOMAIN-MIGRATION-001_MASTER_TASK.md` outside this checkout.

## Base and gates

| Gate | Evidence at C0 | Status |
| --- | --- | --- |
| P0 | `github/main`, clean starting worktree and production `/pwa-version.json` all identified `802f492a39df6fb06f47aebf83e8807f7b40bf5d`; production buildId `91ef96c7-e5f5-4a74-9350-5c45e0a8251f`. | Closed for this cycle; recheck before any later integration. |
| P1 | Local `public-web` matches the 34 source files in commit `861df44c58b0031472fae83ff0840df91b6a127e` (`codex/web-001-public-site`), including pinned package metadata and lockfile. The source is outside this production checkout; approval and deployed provenance are not demonstrated. | `PUBLIC_WEB_SOURCE_PROBABLE`; do not import or rebuild from `out/` yet. |
| P2 | Public DNS resolves with Vercel nameservers; app subdomain resolves but project assignment, aliases, certificates, variables, root directories and rollback deployments are not verified. | Open: Vercel read-only inventory required. |
| P3 | Repo Auth callback/template code is visible; actual Supabase Site URL, redirect allowlist, active templates, expirations and OAuth settings are not verified. | Open: Supabase Auth dashboard evidence required. |
| P4 | Apex manifest uses root scope/start URL; worker, metadata and locally stored keys can be inspected in repo. Installed device versions and old deep links are not inventoried; physical N-to-N+1 test is pending. | Partial. |
| P5 | Live `push_subscriptions` and `notification_deliveries` exist with RLS; register/unregister/claim/finish functions and active delivery Edge Function exist. There are zero current subscriptions/deliveries; no origin column. Live cross-origin delivery and historic endpoint origin cannot be proven. | Partial. |

No values of DNS TXT records, Auth secrets, Push endpoints, VAPID keys, or service credentials belong in this document.

## Frozen C0 interfaces

- `app/lib/domainMigrationContract.ts` owns `PUBLIC_ORIGIN`, explicit `APP_ORIGIN` resolution from `NEXT_PUBLIC_APP_URL`, and the temporary legacy Auth origin allowlist. Production without a configured app origin fails closed. Development may use its local runtime origin.
- `DomainIntent` / `parseDomainIntent` / `buildAppIntentUrl` represent only navigation intent: service (catalogued slug, optional approved mode), professional, order, workroom, notification. IDs are UUID-shaped. Unknown/duplicate/sensitive query keys, fragments, foreign hosts and non-root paths are rejected. Parsing never grants access or executes an operation; destination authorization remains with existing backend rules.
- `authReturnOrigin` accepts only the configured app origin or explicitly listed legacy origins. Implementer A must verify real email/PKCE flows before wiring callbacks; no token, verifier or session may be sent cross-origin.
- `LEGACY_RESERVED_PATHS`, `LEGACY_ENTRY_QUERY_KEYS`, and `isReservedLegacyPath` reserve exact legacy routes, including `/admin`. They do not install redirects or change routes now. Legacy `/auth/*`, worker, version metadata, manifest and offline fallback remain apex concerns.
- No blanket reservation exists for `/_next/static/` or `/brand/`: both apps may emit those paths. Asset ownership, chunk retention, and a non-colliding composed build are explicitly unresolved P8 work. Neither package may assume these namespaces are safe until the combined preview proves them.
- `tests/fixtures/domainMigration.ts` provides shared synthetic origins, services and an opaque order ID for A/B tests. It has no user data.

Current C0 changes only remove the old technical-host fallback from Auth URL construction and metadata, and update `.env.example`. The currently configured production apex remains the expected `NEXT_PUBLIC_APP_URL`; the future `app.` origin is not switched in this cycle.

## Path ownership for future packages

All paths below are repository-relative. New files must remain inside the listed ownership area or be assigned by the integrator before work starts. No package may independently edit a central file.

| Owner | Existing and reserved paths | Boundary |
| --- | --- | --- |
| Integrator / Coordinator | `app/components/ManitoV6App.tsx`, `app/layout.tsx`, `app/page.tsx`, `app/lib/domainMigrationContract.ts`, `.env.example`, `next.config.ts`, `package.json`, `pnpm-lock.yaml`, `docs/DOMAIN_MIGRATION_C0.md`, `tests/domain-migration-c0.test.ts`, `tests/fixtures/domainMigration.ts` | Shared wiring, origin contract, root composition, package config. |
| Implementer A | `app/lib/authCallback.ts`, `app/lib/authMessages.ts`, `app/components/AuthConfirmationScreen.tsx`, `app/auth/callback/page.tsx`, `app/auth/confirm/page.tsx`, `tests/auth-ops-001.test.ts`, `tests/auth-messages.test.ts`; new Auth/intent adapters and their tests assigned to A | Auth/URL/intents behavior. Public-web editorial/CTA files may be assigned only after P1 closes and exact import destination is fixed. `ManitoV6App.tsx` changes are wiring instructions to Integrator. |
| Implementer B | `app/lib/pwaUpdateContract.ts`, `app/lib/pwaUpdateRuntime.ts`, `app/lib/pwaUpdateSafety.ts`, `app/lib/webPush.ts`, `app/components/PwaUpdateProvider.tsx`, `public/sw.js`, `public/manifest.webmanifest`, `public/pwa-version.json`, `public/offline.html`, `supabase/functions/deliver-web-push/index.ts`, `supabase/migrations/20260920153219_blueprint_b07_reliable_response.sql` (read only; any schema delta is a new migration), `tests/pwa-update-001-worker.test.ts`, `tests/pwa-update-001-runtime.test.ts`, `tests/pwa-update-b-safety.test.ts`, `tests/pwa-install-001.test.ts`; new legacy bridge/Push adapters and tests assigned to B | Legacy PWA/Push. B must not edit `ManitoV6App.tsx`, public-web editorial pages, Auth or shared origin config. The existing migration is never rewritten. |
| Infra | No repo write paths in F0/C0. | Single remote reader/operator, read-only this cycle. |
| Reviewer | No write paths. | Independent review after C0 candidate. |

The PWA build generator may regenerate `app/lib/pwaBuildIdentity.ts`, `public/sw.js`, or `public/pwa-version.json`; generated output is not a C0 source change. `public-web` remains outside the checkout until P1 approval, so its final paths cannot be assigned by conjecture.

## Next gate

Do not launch A/B until C0 has independent review and a committed `PACKAGE_BASE`. P1/P2/P3 and remaining P4/P5 evidence must be resolved before any dependent package feature or release. Product decisions PD-01 through PD-04 and physical Human Test remain open.
