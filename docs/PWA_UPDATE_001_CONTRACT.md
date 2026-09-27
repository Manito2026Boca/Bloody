# PWA-UPDATE-001 shared contract (C0)

Base: `30a1c062f42fd94b53ff89fdf2525c0731ca93ad`. Package A and B branch from this C0 commit, not from each other. Types and wire message names live in `app/lib/pwaUpdateContract.ts`. This document fixes behavior and ownership; it implements neither package.

## Diagnosis that permits C0

Two production Next builds from commits `283ac37` and `30a1c06` were served successively on `http://localhost:3015` while one Chromium tab remained open. Their Next build IDs and HTML ETags differed; the bytes of `public/sw.js` were identical. Explicit `registration.update()` produced no waiting worker. The open tab kept the original document. Cache Storage retained `/` with the original ETag, and an offline reload served it; an online reload received the new ETag. Thus the current update failure is reproducible without changing product logic. This test does not prove which additional caches or CDN headers contributed to particular production devices.

## Identity and protocol

- Generate one immutable `PwaBuildIdentity` per build and embed it in the application bundle, worker, and a public version resource. An active tab reports its bundled `runningBuild`; the version resource reports the latest published build. Different rebuilds of the same commit may have different `buildId` values.
- The worker URL stays relative to the current origin and stable. Its bytes must change with `buildId`; version and worker requests must revalidate. Do not compare opaque build IDs lexically.
- Use only `PwaWireMessage` on the channel. Every activation attempt has a fresh `attemptId` and a candidate `targetBuildId`. Ignore messages for other targets, expired attempts, or mismatched protocol versions. No message may carry user data, credentials, form content, files, or PINs.
- A runtime implements `PwaUpdatePort`; UI code consumes only this port. `snapshot()` and `subscribe()` report state. `start()` installs listeners and schedules checks; `stop()` removes them. `activate()` asks the candidate worker to negotiate with all relevant clients. Its result does not itself authorize a page reload.
- The coordinator owns final composition. Package B exposes the local safety and reload coordinator through `PwaUpdateHandlers`; Package A provides the port. Both packages compile and test against this contract independently.

## Safe points and failure behavior

- Each writable surface registers an independent reason with precedence `critical > saving > dirty > clean`; unregistered or uninitialized surfaces are `unknown`, never implicitly clean. A successful save releases only its own reason. A failed or uncertain mutation remains protected until reconciled.
- On `PREPARE`, B synchronously prevents a new edit or submission, checks current reasons, and replies `ready` only while visible, initialized, online, and clean. It holds that guard until `RELEASE`, activation, or a bounded timeout. If a client is silent, old, or blocked, activation is deferred; no timeout converts it to ready.
- The worker validates the candidate and gathers readiness from relevant clients immediately before `skipWaiting()`. The runtime reports `ready-to-reload` only after the target worker controls the page. Each page independently rechecks its reasons before reloading. A new or uncontrolled window never gains permission by another window's response.
- The local reload authority stores a one-per-target marker before reloading; failure to store it disables automatic reload. A startup failure or version mismatch shows a recoverable error rather than another automatic reload. Do not replay in-flight business mutations.
- A legacy client lacking this protocol cannot vote ready in the first rollout. Preserve normal browser activation after old clients close; do not force a reload or clear storage to move them.

## Cache and session boundary

- Navigations are network-first with fallback only to an explicitly safe public shell of the matching build. Never cache personalized HTML, RSC, Auth, API, or Supabase responses. Hash-addressed JS/CSS may use exact-URL cache-first; missing chunks must never receive HTML.
- Keep resources for active and previous builds until they are no longer needed. Do not delete all caches on activation. Version, worker, and mutable assets must revalidate. Preserve current install identity and push/notification handling.
- Existing Supabase session persistence remains authoritative. No auth token copying, logout, or login redirect is part of an update. Routes without a safety handler, including Auth and Admin until instrumented, block early activation rather than claim to be clean.
- Relative URLs and registration scope must work on a later app subdomain without changing the current domain or moving storage across origins.

## Exclusive ownership

| Owner | May write | Must not write |
| --- | --- | --- |
| Coordinator | This contract, final composition in `app/page.tsx` or `app/layout.tsx`, combined integration tests | Package internals during parallel work |
| A | `public/sw.js`, build/version generation, service worker runtime adapter, required build/header config, focused tests | UI components, local safety registry, reload authority |
| B | Safety registry, update UI/version diagnostics, reload authority, `ManitoV6App.tsx`, `Workroom.tsx`, necessary form guard adapters, styles, focused tests | Worker, cache logic, build config, protocol types |
| Reviewer | None; read-only review of C0 and integrated diff | All implementation files |

Package A and B do not merge each other. If either needs to change this contract or a file owned by the other, stop that part and report `ARCHITECT_DECISION_REQUIRED` if the approved design is invalidated; otherwise the coordinator handles a narrow interface correction before parallel work proceeds.
