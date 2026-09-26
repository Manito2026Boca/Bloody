# MANITO task templates

Fill only relevant fields. Every agent reads [AGENTS.md](../../AGENTS.md) and the [workflow](../DEVELOPMENT_MULTIAGENT.md). An exact base commit and explicit ownership are mandatory. Omit Package B for a one-implementer block.

## MASTER TASK

```text
BLOCK: <ID>
BASE COMMIT: <full SHA; same for all packages>
OBJECTIVE / ACCEPTANCE: <observable outcome>
SHARED CONTRACTS: <API, types, DB, product invariants and their single owner>
OWNERSHIP: Coordinator <areas>; Package A <files/area>; Package B <files/area or none>
DEPENDENCIES / ORDER: <what must land first>
CENTRAL FILES / REMOTE OWNER: <single writer; one operator for Supabase/Auth/deploy>
OUT OF SCOPE: <explicit exclusions>
FINAL QA: <cross-tests, full suite once, TypeScript, build, smoke, Browser QA, Human Test gate>
DEPLOY AUTHORIZATION: <none/preview/production and who authorized it>
```

## PACKAGE A

```text
BASE COMMIT: <full SHA>
BRANCH: codex/<bloque>/a-<tema>
SCOPE / ACCEPTANCE: <one independently testable outcome>
OWNED FILES / CENTRAL OWNER: <paths and shared-file decision>
INTERFACES: <agreed inputs/outputs and dependency on other package>
DO NOT TOUCH: <other package, remote state, unrelated modules>
FOCUSED TESTS: <commands and scenarios>
HANDOFF: <commit, diff summary, tests/results, risks; no integration/deploy>
```

## PACKAGE B

```text
BASE COMMIT: <same full SHA as Package A>
BRANCH: codex/<bloque>/b-<tema>
INDEPENDENCE CHECK: <separate files, agreed interface, independent tests, no shared migration>
SCOPE / ACCEPTANCE: <one independently testable outcome>
OWNED FILES / CENTRAL OWNER: <paths and shared-file decision>
INTERFACES: <agreed inputs/outputs; no dependency on unmerged Package A code>
DO NOT TOUCH: <Package A, remote state, unrelated modules>
FOCUSED TESTS: <commands and scenarios>
HANDOFF: <commit, diff summary, tests/results, risks; no integration/deploy>
```

## REVIEW TASK

```text
BASE / CANDIDATE COMMITS: <SHAs>
RISK FOCUS: <Auth/security/economy/concurrency/persistence/PWA/migration/cross-module>
READ-ONLY SCOPE: <diffs, relevant contracts, tests, permission and error paths>
CHECK: <regressions, authorization, states, data safety, concurrency, test sufficiency>
OUTPUT: <findings first with file/line and severity; gaps/assumptions; no edits or merge>
```

## INTEGRATION TASK

```text
BASE COMMIT / INTEGRATION BRANCH: <SHA; codex/<bloque>/integration>
PACKAGE BRANCHES / COMMITS / ORDER: <A, then B if used>
DIFF REVIEW: <base, scope, ownership, shared contracts, duplicates, dependencies>
MERGE: <one at a time; inspect conflicts manually; combined-diff review>
CROSS TESTS: <interfaces and user journeys across packages>
FINAL QA: <full suite once, TypeScript, build, relevant smoke, Browser QA>
REVIEWER: <required risk areas and findings/resolution, or why not needed>
DEPLOY: <authorized target only; verify deployed commit; otherwise none>
REPORT: <single result, files/migrations, tests, deployment, Human Test status, risks>
```
