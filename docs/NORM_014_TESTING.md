# NORM-014 testing runbook

Use a dedicated staging project where possible. These scripts write real data.
Do not run them against arbitrary production users. Never put credentials in git.

## Prerequisites

- pnpm install --frozen-lockfile
- Playwright installed in the runtime (PLAYWRIGHT_MODULE may point to its directory).
- Microsoft Edge for the browser harness.
- NORM014_PUBLISHABLE_KEY: publishable/anon key, never service_role.
- SQL connection with authorized bootstrap access.
- Local app URL through NORM014_APP_URL, default localhost:3017.

## Controlled sequence

1. Review scripts/norm014-live.mjs target URL before prepare; it currently names MANITO's project.
2. Run node scripts/norm014-live.mjs prepare ONCE. It writes ignored fixture.json/bootstrap.sql with ephemeral passwords.
3. Review and execute bootstrap.sql through the authorized SQL connection. Seeded confirmed users are NOT evidence of email delivery.
4. Run node scripts/norm014-live.mjs run.
5. Run node scripts/norm014-flows.mjs.
6. To exercise actual recurring cron, accelerate ONLY this fixture's plan/source recurrence dates; never change contracted timestamps or global cron. Verify real generation before running node scripts/norm014-recurring.mjs.
7. Run node scripts/norm014-mobile.cjs against the local app. It uses real backend actors and separately injects a profile-load503 to test recovery.
8. Run pnpm test, pnpm exec tsc --noEmit, pnpm run vercel-build, pnpm audit --prod.
9. Execute supabase/tests/norm_014_security_smoke.sql and the NORM010/012 smoke files. Each uses rollback.

## Cleanup, explicit review required

1. node scripts/norm014-live.mjs cleanup-orders-sql prepares SQL; review exact UUIDs, run prefix and scope.
2. Run the prepared SQL with rollback first. It removes only this fixture's linked complaint records/orders/plan. It takes an exclusive complaints lock and temporarily disables ONLY the immutable DELETE guard inside that transaction, then re-enables it before commit. No concurrent complaint mutation can enter during the lock.
3. Execute the reviewed transaction. If a foreign key or identity mismatch occurs, stop; do not disable unrelated guards.
4. node scripts/norm014-live.mjs cleanup-storage removes the exact recorded fixture paths via Storage API. Verify no remaining objects owned by the fixture actors.
5. node scripts/norm014-live.mjs cleanup-users-sql prepares the final SQL. It refuses deletion if Storage remains and revokes sessions before deleting exact UUID+email matches.
6. Verify zero fixture users/orders/service, complaint guard enabled. Remove ignored fixture.json/bootstrap.sql containing temporary credentials.

The finished run was cleaned up; scripts cannot be rerun with its deleted identities.
Keep sanitized result JSON and screenshots, not passwords or JWTs.

## Limitations

These checks do not certify actual signup email delivery, native mobile permissions,
exhaustive matching/ranking, or PIN brute-force resistance. See the final NO-GO report.
