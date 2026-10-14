# M7D — Packed Web, lifecycle and compatibility closeout

**Status:** packed-Web qualification candidate in PR #35; prior full CI #38279362541 passed at `ec35e246`. Hardening in PR #35 is implementing per-generation CLI lockfiles, fixed scenario evidence and public-transport pending-RPC proof. Completion remains conditional on fresh exact-head CI, artifacts and final source review. **Milestone 7 is not complete.**
**Baseline:** M7C Core merged in PR #33; M7C docs PR #34 merged into `main` at `8230f3446294d01c02bdae4ac6a3c326a7b058b7`, included as the second parent of M7D's sync commit.

## Scope

Qualify the already-built M7C Profile editor in real, installed DSH Web hosts; do not add new Profile/Prompt/Skill functionality. Preserve Remote API v2, exact captured `{instanceId,revision}` mutation bases and fail-closed writes. No Host Settings redesign, no private Loader or DOM hooks, no unsupported DSH 0.1.7+/0.2.x support.

## D0 — public published preflight

Four approved Client versions: `0.1.2-rc.1`, `0.1.5-rc.1`, `0.1.5-rc.2`, `0.1.6-alpha.2`. `0.1.1-rc.2` remains a Host/narrow SlotCore regression only. Initialize a **unique temporary `DSH_HOME`** and auto-create its shipped `web` profile through the public `dsh web --dump-config` path **before** installing the exact `.tgz` with `dsh plugin --profile web add`. This is compatible even with retained `0.1.2-rc.1`, which does not yet support the later `--from-default-profile` flag. A custom base-only profile cannot substitute for Web. Install via the published DSH CLI only after Web-profile initialization. For legacy 0.1.2/0.1.5, first run clean bare-Web/explicit-HMR controls and retain an explicitly enabled `hmr` patch for the qualified installed-Web run; do not pretend default startup passed if the control fails. Start `dsh web --no-open --host 127.0.0.1 --port 0`. Parse the authenticated readiness URL in memory, monitor Host exit and verify live read-only HTTP response before Chromium; capture sanitized browser console and import failure diagnostics. Never touch a user's real DSH profile.

## D1 — real packed Web E5/E6

Build once in the existing `package` job, upload the one tarball plus SHA-256 evidence. Install that identical tarball into each supported DSH Web generation. Use a pinned Chromium Playwright browser and the real Host / Remote / Client Modules / Renderer / DOM path. Verify one trigger and Drawer, create and edit with explicit saves, authoritative reread after browser reload and host restart, and a stale concurrent edit rejected without silent rebase. The production build must also materialize the original tarball Client factory in a VM without Node `process`, `require`, or `Buffer` globals, catching bundled dependencies that mistakenly expect Node. Existing React Test Renderer tests are not described as browser E2E.

## D2 — lifecycle and HMR

Verify ordinary Drawer close/reopen (draft preserved), plugin graph disable/re-enable (new presentation lifetime), repeated mount/unmount and removal of plugin-owned style tags. The published Web Plugins manager UI is present on the retained `0.1.6-alpha.2` line but absent in the `0.1.2`/`0.1.5` source trees; run that UI graph scenario only on 0.1.6. Earlier generations use the shipped public live Web profile patch (`$DSH_HOME/profiles/web/cordis.patch.yml`) for five disabled/enabled cycles while retaining the HMR-enabled prerequisite. A test-owned two-flag renderer creates atomic replacements; no real, preconfigured, or symlinked user Profile Patch may be overwritten. The runner and test home are disposable. Keep code hot replacement separate from npm package replacement: development rebuild may use an explicitly mutable temporary copy, not the immutable candidate tarball. Do not simulate the production loader by calling its private methods. The M7C Controller's epoch/operation-id guards cover obsolete in-flight outcomes in deterministic model tests. The native 0.1.6 Web generation exercises a real Host RPC response held at Playwright's public transport layer across whole-plugin unload and reattachment, then a newer Client write. Its qualification must fail if the old result overwrites that new lifetime, if the targeted request is not actually intercepted or if a write is retried. Retained 0.1.2/0.1.5 graph behavior continues to require navigation and is not claimed to be native no-navigation HMR.

## D3 — CI ownership

Keep existing Host, Remote, Renderer and package evidence. Add a matrix of four Ubuntu/Node 22 packed Chromium tests and one Windows stable-generation smoke when feasible. New required jobs must be listed in CI `needs`, `scripts/verify-full-qualification.mjs` and `tests/full-qualification.test.mjs`. Draft = Quick only; Ready PR = exact-head Full; no retry of user mutations. Failures classified product (P), harness (H), upstream (U), infrastructure (I).

## D4 — final review gate

Store only synthetic-session screenshots and sanitized CI evidence with version, exact tarball SHA-256, supported scenario and result. Retain fixed-schema, sanitized successful qualification manifests separately from failure-only diagnostics. No Web tokens, raw traces, personal Profiles or secret values as public artifacts. Require full real-browser and lifecycle results in every claimed version, then exact-head final source review, no P1/blocking P2, and a precise compatibility/roadmap closeout. Until then M7 remains open.
