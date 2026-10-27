# M7B2-B0 — Host-safe PromptResource identity and Remote v3

Status: **Draft / implementation in progress**. Baseline: PR #37 merge commit `d6a6a6bd097cf2ab25604567cbb1589585682cb4`. Followed by B2-B1 mutation controller and M8A UI.

## Why this slice exists

Host `createPrompt()` currently resets `revision` to 1; revision-only replace/delete accepts an old draft after an equal-ID delete+recreate (ABA). An attached Prompt Library can also be replaced or rebound while maintaining equal stored numeric revisions. B1-3's `{instanceId,resourceId,revision,source}` is a read stamp, not a Host-enforced write basis.

## Scope and compatibility boundary

Host: enforce separate **Resource Authority**, **per-resource incarnation**, and **per-resource revision** at the operation execution point. Client: retain the current one-authority SnapshotStore and lazy read API while extending Resource DTO/stamp and invalidation. Remote: advance API to v3, regenerate exact Typert declarations, and keep the Profile v2 mutation basis semantics unchanged. No Resource Mutation Controller, Drawer UI, or global polling in B0.

### Identities and fail-closed rules

- `instanceId`: the existing global profile/Host authority; changes on Profile Settings owner replacement.
- `resourceAuthorityId`: the currently opened Prompt Library storage source lifetime, rotated on successful open/reattach and invalidated on teardown; observed independently by ChangeTracker without rotating `instanceId`.
- `incarnationId`: persistent random UUID generated only on create, stored in one reserved extension field; stable through normal edits; regenerated after delete+create of the same ID. Legacy resources missing the field project `null` and are lazily upgraded on their first successful **existing** edit, atomically with that edit. Unknown fields remain intact.
- `revision`: the existing per-resource positive safe-integer mutation counter; never a ChangeTracker cursor.
- `ResourceMutationBasis`: exact `{instanceId,resourceAuthorityId,resourceId,incarnationId,revision}` captured at draft creation. Create uses only `{instanceId,resourceAuthorityId}`. No Save-time recapture and no silent write retries.
- Rejected basis, stale authority, invalid reserved field and malformed document must not modify storage or publish an invalidation cursor.
- Any structural edit must reserve revision/incarnation and preserve unknown siblings. The reserved incarnation field is Host-owned: payloads may not set it.
- For Resource cursor coherence, `resourceAuthorityId` and `incarnationId` must be compared in authoritative read brackets and list↔document invalidation, even when numeric revisions match.
- Respect published StorageDomain table semantics: synchronous `table.update` callback controls update validation; `get`+async `delete` is serialized only within the package's `operationTail`. **No cross-process or foreign-writer atomic CAS guarantee is claimed**.
- The Resource write lane remains separate from Profile Settings, and Provider change does not reset unrelated Profile mutations. Native preset authoring stays M8C.

## Staged implementation

1. Red tests for same-ID ABA and replaced storage source with equal numeric revision. Retain original red run as audit evidence.
2. Host identity persistence & legacy lazy migration; execution-time checks in the existing serialization/Storage update boundary.
3. Remote v3 DTOs, revisions and structured business conflicts, added leaf operations, exact generated declaration test.
4. Client B1-3 resourceAuthority/Incarnation metadata projection, read-stamp capture and bracket invalidation, with no eager body loading.
5. Focused Host + fake Remote/client tests; exact-head Draft Quick CI; strict source review; Ready 86-job retained-generation and packed Chromium matrix; independent main postmerge CI.
