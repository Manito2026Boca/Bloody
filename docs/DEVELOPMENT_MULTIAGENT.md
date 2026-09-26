# MANITO multiagent workflow

Use [root agent rules](../AGENTS.md) on every task. This document governs coordination, not product behavior. Start from a named block, an exact base commit, an owner for shared contracts, and acceptance criteria. The coordinator is the sole integration authority.

## Staffing and ownership

- Default: one coordinator/integrator and one implementer. Use two implementers only when ownership is disjoint, shared interfaces are agreed first, each package can be tested independently, and neither writes the same central file or migration area. Otherwise work sequentially.
- One central file, one writer per cycle. Assign a single owner for shared types, migrations, RPC contracts, central UI/API modules, and generated artifacts. Agree on shared interfaces before parallel work. If a package needs unmerged code from another, run them sequentially in a new cycle/base instead of pretending they are independent.
- Implementers own only their packages. They do not merge each other's branches or change shared remote state. The coordinator resolves cross-package decisions and integrates.
- Use an independent, read-only reviewer when a block changes Auth, permissions, security, economic contracts, concurrency, persistence, PWA, significant migrations, or cross-module behavior. Review commits/diffs, error states, permission boundaries, regressions, and test sufficiency. Do not add a reviewer for trivial changes.

## Branches and worktrees

All branches start at the **same recorded commit**. One isolated worktree per package:

```text
codex/<bloque>/integration   coordinator
codex/<bloque>/a-<tema>     implementer A
codex/<bloque>/b-<tema>     implementer B, only if independent
```

The coordinator owns `integration` and merges one completed package at a time, reviewing each resulting diff. Use merge as the normal integration method; do not routinely mix merge and cherry-pick. Never auto-accept conflicts. Keep unrelated work out of package branches. Do not use a worktree as evidence of an isolated Supabase/Vercel/Resend environment.

## Shared remote operations

Worktrees isolate files, **not** Supabase, Auth, QA accounts, production data, Vercel, DNS, Resend, or other remote services. Name one remote-operations owner for the cycle. No parallel migration application, Auth setting changes, QA-user mutations, deployments, or infrastructure edits. Require explicit task authorization and record what environment and version were changed. Preview and production are distinct; a preview result never proves production behavior.

## Validation and handoff

- Implementer: focused tests for changed behavior; focused TypeScript checks where available; build if the change warrants it. Handoff commit, scoped diff, tests/results, shared interfaces, and risks. No unrequested deploy.
- Coordinator: verify base and ownership; inspect each diff for out-of-scope files, duplicated logic, shared contracts, and dependencies; merge in dependency order; run cross-package checks. On the final candidate, run the full test suite **once**, full TypeScript, full build, relevant SQL/API smoke, and Browser QA for affected flows. Re-run only if fixes change the candidate.
- Human Test is a separate gate. Automated tests, Browser QA, a preview, and a deploy do not approve it. Use actual Cliente/Profesional accounts where the task requires an end-to-end check; preserve persistent QA accounts.
- The coordinator reviews the combined diff, obtains/uses explicit deployment authorization, verifies the deployed commit when deployment is in scope, and writes one final report. Do not silently resolve conflicts, remove failing tests, rely solely on implementer reports, or broaden scope with refactors.

## Model policy

Sol Medium is MANITO's default for coordination, implementation, integration, debugging, and technical review. Do not downgrade automatically to save cost. Focus context, split only independent execution, avoid repeated audits/full suites, and keep reports brief. Astra is optional for architecture, product/UX, or difficult conceptual review; no technical workflow depends on it.

Use the [reusable task templates](templates/MULTIAGENT_TASKS.md). With one implementer, omit Package B and integrate Package A alone.
