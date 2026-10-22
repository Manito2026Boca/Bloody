# Claude implementation and independent review cycle

Owner explicitly requested Claude write code and carry more implementation work,
not merely provide opinions while Codex implements everything.
Candidate base: `26abab7650354cb32f46508643d76f04282627f4`.
No deployment, production fixtures, R2 writes or infrastructure authorization.

## Actual packages

Package A - Claude implementer, isolated `codex/qa-cycle-001/claude-tests` worktree.
Exclusive write: `scripts/qa-r1/claude-adversarial-browser.mjs`.
Implement additional real-App browser regressions for invalid/denied preference
storage, intent precedence and absence of in-progress help outside its allowed stage.
Do not duplicate the nine approved product-decision cases or change App/harness APIs.
If existing fixtures cannot cover a case, report the gap instead of editing them.

Package R - separate text-only Claude review of immutable current source excerpts.
Focus: preference/session/intent races and truthful help boundaries. Findings require
an exact event sequence and code evidence; runtime reproduction must not be claimed.
No shared files or writes with Package A. This is not the original Claude Desktop QA.

Codex owns integration: inspect actual diff, enforce write scope, run tests, return
failures for Claude to correct, merge only reviewed changes and report evidence.
Codex does not rewrite Claude's entire solution as an integration shortcut.

## Execution controls

Both CLI rounds verify Claude Pro subscription authentication; no API-key provider
override, no printed credentials. Bounded rounds/timeouts, not an unlimited loop.
Implementer has file tools only in an isolated worktree, allowlisted single-file
write, no shell/browser/MCP/network tools. Reviewer receives sanitized excerpts and
has no tools. No skip-permissions, API-credit fallback or hidden production operator.
Codex inspects generated executable test code before running it.

Runtime records live outside Git under LOCALAPPDATA/ManitoCoordination/rounds:
`CLAUDE-R1-IMPLEMENT-001` and `CLAUDE-R1-REVIEW-002`.
They hold task manifests, sanitized outcomes and response provenance, not credentials.
Reports must distinguish writing tests, executing them, live QA and physical Human Test.

## Subsequent packages

If tests/review reveal a real app defect, freeze a minimal reproduction and acceptance
criteria, then assign Claude a bounded application-fix package with one App writer.
Codex reviews compatibility/security and integrates. Significant product/architecture
changes still require the existing Architect gate. Do not auto-implement every suggestion.
Dead-code cleanup, further UX features and a new support channel are not implicitly
authorized by this test package. Main/deploy and live R2 remain separate owner gates.

## First actual delivery

Claude Code Pro wrote `scripts/qa-r1/claude-adversarial-browser.mjs` using file tools,
with no permission denials and no shell/MCP/remote access. Worker commit `35aa585`.
Codex reviewed the source, checked syntax and ran all nine cases successfully on
the current candidate. Claude's prose said ten cases, but the executable contains
nine; the measured result takes precedence over the prose count.
Coverage: invalid preference, denied storage, service intent versus saved mode,
separate browser storage contexts, help absent outside working (four combinations),
and keyboard experience switching. Synthetic browser evidence is not backend
authorization or physical Human Test proof. No production account was used.

The independent text-only round raised intent/session race concerns. Canonical
notification intents may already be protected by pending session storage; that
claim needs a controlled reproduction, not automatic acceptance. The chat prop
and missing help-panel speculation is contradicted by current prop wiring and
existing runtime panel tests, so it is not a new app-fix task.
Package B1 now assigns Claude the executable reproductions and narrow fixture
controls first; only a demonstrated failure proceeds to a Claude application fix.

## Demonstrated follow-up defects

Claude-authored reproduction commit `65bc88b`, executed by Codex against the
unchanged App, produced three assertion failures and one passing guard case.
No unexpected mock APIs, browser errors or external requests were present.

| ID | Demonstrated failure | Scope qualification |
| --- | --- | --- |
| CQA-001 | Authorized lookup finds no order; saved Professional is ignored and Client remains active. | Mode fallback only, not permission escalation. |
| CQA-002 | A's delayed intent response switches B's UI experience after logout/login. | Stale frontend state proven; backend RLS bypass or actual cross-user disclosure is not claimed. |
| CQA-003 | Notification destination loses its mode to late preference hydration. | Reproduced with pending-intent sessionStorage writes blocked; not claimed for every canonical notification. |

The fourth case, preserving an explicit choice made while the lookup is pending,
already passed on baseline and remains a regression requirement.
Race controls are synthetic per-call snapshots and per-actor fixtures, not real
accounts. Queued responses are released deterministically; unknown APIs still fail.

Architect froze Package B2: Claude is sole App writer, using existing load epochs
and current identity after awaits, account-scoped notification priority and narrow
preference fallback. Later explicit selection must survive. No new abstractions,
API, configuration, PWA mechanism or marketplace rule. Codex reviews and runs tests;
Claude does not receive execution or infrastructure tools. This is an actual
application-fix assignment, not a recommendation for Codex to implement itself.

## Application delivery and review

Claude wrote the App fix and one additional regression in `abf5299`; Codex did
not author or rewrite those App changes. Existing load epoch/current account guards
now reject stale intent/notification responses, notification hydration is reserved
at resolution start and unavailable targets restore the appropriate preference.
A revision counter preserves later explicit choices, including failed storage writes.
The notification marker is account-scoped. No public API or business rule changed.

All five race cases passed after the fix (versus three failures and one baseline
pass before; the fifth is a new no-storage regression). Architect review requested
one extra guard on the originating mark-read rejection; Claude applied it as a
bounded follow-up. No new architecture was invented during integration.

Codex's integration change is limited to updating an older source-contract test:
it assumed the exact former handler signature and uncaptured profile comparison.
The revised assertion scopes the handler and still checks account ownership, stale
identity rejection and navigation. No tests were removed. Full suite: 440/440,
62 files. Explicit TypeScript passed. Final build/browser results recorded below.

## Final local validation

- Production build passed with `NEXT_PUBLIC_APP_URL=https://app.manitoapp.com.ar`.
  Generated PWA identity/worker/version files restored; no PWA mechanism changed.
- Final focused Browser QA: 33/33 PASS (wizard 8, prior approved product decisions 9,
  Claude adversarial cases 9, Claude race cases 5, desktop geometry 2).
- Mobile guide cases cover 360x800 and 390x844; desktop 1280x900 both roles.
- No unexpected API, browser/console/resource errors or external browser requests
  in these runs. App uses real DOM/CSS and synthetic APIs/update port, not live Auth.
- Browser race source manifests and screenshots remain in ignored `outputs/qa-r1`.
  Parent independently executed baseline and fixed candidates; Claude never claimed
  execution. Text review and implementation were separate Pro sessions.
- Evident-secret scan and diff whitespace checks passed. No passwords, tokens, env
  credentials or production account data were added. No migrations or remote writes.

Local commits: `35aa585` adversarial cases, `65bc88b` reproductions/fixtures,
`abf5299` application correction and extra regression. Final integration includes
the narrow legacy-test adaptation and this report; no code was pushed/deployed.
The integrator owns release authorization/security checks, not a parallel remote writer.

| Finding | Final status | Evidence |
| --- | --- | --- |
| CQA-001 | FIXED_LOCAL | unavailable destination restores account preference |
| CQA-002 | FIXED_LOCAL | late A response no longer changes B's UI; originating async errors guarded |
| CQA-003 | FIXED_LOCAL | notification destination survives slower profile hydration with blocked pending-intent storage |

Human Test, real two-account production retest and R2 writes remain pending separate
authorization. Missing in-progress support channel remains the previously recorded
operational gap. No unlimited autonomous loop was created; every Claude round ended.
