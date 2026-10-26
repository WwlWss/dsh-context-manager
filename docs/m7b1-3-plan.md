# M7B1-3 — Lazy PromptResource and keyed Runtime Client reads

**Status:** implementation in progress. Parent: [M7B1](m7b1-plan.md). Dependency for M7B2-B and M8A.

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

## Revision ownership and deferred mutations

The storage-backed PromptResource revision on a fresh list row or document is the only available `expectedRevision` for its respective future operation. The Client exposes a source-aware read stamp `{instanceId,resourceId,revision,source}` as a **read observation**, not as a Host-enforced mutation basis. Draft creation must preserve that particular stamp; Save-time recapture is forbidden.

Host PromptResource mutations currently compare per-resource revisions only. Delete/recreate under the same ID can reuse a revision (ABA), and a Prompt Library provider replacement may require a dedicated invalidation event if shown unobserved by existing hints. Review both before B2-B; do not claim cross-incarnation mutation safety in B1-3.

## Verification

Verify exact generated namespace typing, both result envelopes, strict resource laziness, invalid IDs, fresh stamp ownership, same-key and disjoint-key races, unrelated cursor stability, read failure isolation, bounded churn, Host instance restart and lazy-first discovery, detach/reattach/dispose, and retained Client/Gateway/packed Chrome matrices. The implementation must not touch M7B2-A profile mutation logic or claim to implement M8 editing.
