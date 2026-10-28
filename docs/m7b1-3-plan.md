# M7B1-3 — Lazy PromptResource and keyed Runtime Client reads

**Status:** complete in merged PR #37; independent `main` post-merge full qualification #40520448305 passed 86/86. Parent: [M7B1](m7b1-plan.md). Foundation for M7B2-B and M8A. B2-B0's Resource Authority/Incarnation expansion is a subsequent Draft PR #38, not a feature of the merged B1-3 baseline.

## Scope

Extend the existing React-free, stable-identity authoritative Client model with a lazy metadata-only PromptResource list, lazy per-resource document reads, and keyed live Session / Agent Prompt / Skill / Pinned diagnostics. Reuse the existing Remote API v2 and its exact public Typert generation. No Host mutation endpoint, UI editor, automatic polling, event-forwarding assumption, or new persistence owner is introduced.

## Authority and data model

- Keep exactly one model-owned `createSnapshotStore`. Extend its snapshot with separate `resources` and `diagnostics` domains; preserve B1-1's baseline three-surface `reconcile()` and `sync` ownership.
- The resource list is metadata-only. Only an explicit `loadPromptResource(id)` fetches content. Runtime reads require caller-provided exact Session or Agent identity; no roster discovery.
- Cache by exact ID and diagnostic kind, with fresh/stale/error status independently per key. Published Map state is copy-on-write, bounded (documents 32, each diagnostic family 64), and never treated as a secondary authority.
- `listPromptResources` and `getPromptResource` have **two** nested result envelopes: Typert transport and Context Manager business success/refusal. Runtime diagnostics have only the Typert envelope; `not-live`, `unavailable`, and `assembly-bypassed` remain authoritative data states.
- `changes.promptResources` invalidates list and documents, `changes.runtime` invalidates all keyed diagnostics. Cursor equality is a freshness hint, **never** a write revision. Global generation changes alone must not stale unrelated caches.
- Bracket requested reads with `changes()`; compare current `instanceId`, relevant cursor and caller/read publication ownership. Retry only affected unstable reads (bounded attempts). A newer same-key read owns publication over an older result, while different keys can proceed concurrently.
- A Host authority transition clears all authoritative caches, invalidates in-flight work, rechecks protocol and ensures baseline reconciliation is scheduled when first observed by a lazy reader. Detach retains data only as stale read-only presentation; dispose discards it.
- `Remote protocol()` is locally guarded in lazy reads; it does not claim B1-1's global reconcile protocol-owner token or turn its global `sync` into a keyed-read indicator.

## P1/P2 concurrency closeout (exact owner contracts)

The independently reproducible pre-fix regressions were captured in test-only commit `413369aff114` (Quick CI run #40293127743: four expected failures). They are fixed in `172eb5d9c9bb` (Host recovery) and `32fb3d7ee05f` (protocol arbitration); focused CI run #40293674533 passed. The post-fix tests exercise both before/after authority brackets, synchronous SnapshotStore reentrancy, recovery cancellation and deduplication, same-key supersession, newer baseline protocol proof, and detach/reattach.

1. **Keyed owner** gates only a Resource/Session/Agent result. It cannot cancel a model-wide recovery or an already-owned global protocol verification. A keyed read still rechecks its owner after every synchronous state publication before invoking a business Remote call.
2. **Authority owner** is an attachment+authority epoch. A successful keyed Host transition schedules recovery **before** checking whether that local key has been superseded. A single pending recovery ticket carries both epochs; an older ticket cannot block a newer Host or run after detach/dispose. A recovery never polls or loops automatically on error.
3. **Protocol owner** is the existing B1-1 `protocolOwnerRun`. Normal lazy reads keep their local `protocol()` probe, leaving baseline `sync` untouched. An initial incompatible answer is not a global verdict: if a newer global check began during the probe, the stale negative result yields. Otherwise, only the negative anomaly promotes to a new monotonic guarded `guardProtocol()` verification run (not registered as a baseline reconcile). No global `clearAuthority(undefined, incompatible)` is permitted without confirming that the verifying run still owns the current attachment, authority, and global protocol publication.
4. Once a global verification owns its verdict, same-key replacement does **not** cancel that global verdict. Its result may block future mutations by setting `checking`, `error`, or a confirmed `incompatible`. Only the original surviving keyed owner can continue to read and publish that key's data. Global `checking` publication is followed by another lifecycle check before starting a verification RPC, as synchronous subscribers may detach or replace the Host.
5. No rebase of persistence/resource revisions occurs as part of this repair. The Host-side PromptResource delete/recreate ABA concern remains deferred to B2-B.

The focused contract tests also cover rapid A→B→C Host changes, disjoint in-flight keys, bounded document/session caches, and cursor exhaustion. Quick CI success does not substitute for the Ready PR's full retained-generation and packaged Chromium qualification.

## Revision ownership and deferred mutations

The storage-backed PromptResource revision on a fresh list row or document is the only available `expectedRevision` for its respective future operation. The Client exposes a source-aware read stamp `{instanceId,resourceId,revision,source}` as a **read observation**, not as a Host-enforced mutation basis. Draft creation must preserve that particular stamp; Save-time recapture is forbidden.

Host PromptResource mutations currently compare per-resource revisions only. Delete/recreate under the same ID can reuse a revision (ABA), and a Prompt Library provider replacement may require a dedicated invalidation event if shown unobserved by existing hints. Review both before B2-B; do not claim cross-incarnation mutation safety in B1-3.

## Verification

Verify exact generated namespace typing, both result envelopes, strict resource laziness, invalid IDs, fresh stamp ownership, same-key and disjoint-key races, unrelated cursor stability, read failure isolation, bounded churn, Host instance restart and lazy-first discovery, detach/reattach/dispose, and retained Client/Gateway/packed Chrome matrices. The implementation must not touch M7B2-A profile mutation logic or claim to implement M8 editing.
