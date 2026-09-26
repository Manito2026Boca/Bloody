# MANITO agent rules

Read this file before work. Use [multiagent workflow](docs/DEVELOPMENT_MULTIAGENT.md) and [task templates](docs/templates/MULTIAGENT_TASKS.md) for coordination. The current code, applied migrations, and deployed product take precedence over historical reports or an outdated README. Confirm the task's base commit and scope before editing.

## Product and architecture

- MANITO is a mobile-first services marketplace with distinct Cliente, Profesional, and Admin experiences. Capabilities are independent; never infer Admin from a UI mode or client-editable metadata.
- React/TypeScript app: `app/`, with `app/components/ManitoV6App.tsx` as a central UI surface and `app/lib/v6Api.ts` for the Supabase boundary. Database/RPC/RLS: `supabase/migrations/`; SQL checks: `supabase/tests/`; app tests: `tests/`. Inspect the relevant current code before changing it.
- The currently deployed branding and repository assets are the visual source of truth. Do not revive older brand proposals or alter identity without an explicit task.
- Preserve marketplace invariants: backend-authorized eligibility and state transitions; client and professional privacy; professional PINs never exposed; accepted economic contracts and pricing-policy snapshots frozen; approved extras recorded separately; payment does not set the contract price. Keep Proteccion MANITO rules and evidence intact.

## Safety and environments

- Scope changes to the assigned block. No opportunistic refactors, unrelated fixes, test deletion to obtain green, or silent product-rule changes. Escalate decisions that change contracts, monetization, permissions, or marketplace rules.
- Treat real users and the persistent QA accounts as shared data. Do not delete, reset, impersonate, or autoapprove them without explicit task authorization. Never commit passwords, tokens, service-role keys, SMTP credentials, or real `.env` files; never print secrets in logs or reports.
- Keep authorization on the backend. Do not weaken RLS/grants, use client-side hiding as security, or expose privileged Supabase credentials in `NEXT_PUBLIC_*`.
- Add incremental migrations; do not rewrite applied migrations. Check remote migration history and schema before applying anything. Supabase, Auth, QA users, Vercel, DNS, Resend, and production data are shared across worktrees: one designated operator per cycle may change remote state.
- Preserve Auth confirmation, recovery, redirects, and session behavior; do not disable confirmation to unblock tests. Preserve PWA install/update/session behavior and avoid reloads that discard unsaved work. Do not touch either subsystem outside its assigned scope.

## Delivery

- Implementers run focused tests; the integrator checks cross-package behavior, then runs the final full suite once, TypeScript, build, relevant smoke and Browser QA. A passing build does not replace a real two-account or human test. Mark Human Test pending until a person completes it.
- Preview is not production. Do not push, deploy, migrate a remote database, change infrastructure, or claim a deployed commit without task authorization and verification. Commit only scoped changes; preserve unrelated work.
- Report: scope and result, files/migrations, security or product decisions, tests and their limits, preview/production deployment with verified commit if any, Human Test status, and remaining risks. Say plainly when something could not be verified.
