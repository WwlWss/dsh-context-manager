# M7B2-B0 — Host-safe PromptResource identity and Remote v3

Status: **PR #38 review remediation complete; Ready full qualification pending**. Baseline: PR #37 merge commit `d6a6a6bd097cf2ab25604567cbb1589585682cb4`. Followed by B2-B1 mutation controller and M8A UI.

## Why this slice exists

Host `createPrompt()` currently resets `revision` to 1; revision-only replace/delete accepts an old draft after an equal-ID delete+recreate (ABA). An attached Prompt Library can also be replaced or rebound while maintaining equal stored numeric revisions. B1-3's `{instanceId,resourceId,revision,source}` is a read stamp, not a Host-enforced write basis.

## Scope and compatibility boundary

Host: enforce separate **Resource Authority**, **per-resource incarnation**, and **per-resource revision** at the operation execution point. Client: retain the current one-authority SnapshotStore and lazy read API while extending Resource DTO/stamp and invalidation. Remote: advance API to v3, regenerate exact Typert declarations, and keep the Profile v2 mutation basis semantics unchanged. No Resource Mutation Controller, Drawer UI, or global polling in B0.

### Identities and fail-closed rules

- `instanceId`: the existing global profile/Host authority; changes on Profile Settings owner replacement.
- `resourceAuthorityId`: the currently opened Prompt Library storage source lifetime, rotated on successful open/reattach and invalidated on teardown; observed independently by ChangeTracker without rotating `instanceId`.
- `incarnationId`: persistent random UUID generated only on create, stored in one reserved extension field; stable through normal edits; regenerated after delete+create of the same ID. Legacy resources missing the field project `null` and are lazily upgraded on their first successful **existing** edit, atomically with that edit. Unknown fields remain intact.
- `revision`: the existing per-resource positive safe-integer mutation counter; never a ChangeTracker cursor.
- `ResourceMutationBasis`: exact `{resourceAuthorityId,resourceId,incarnationId,revision}` captured at draft creation; Create uses only `{resourceAuthorityId}`. The **Client read stamp** additionally remembers the global `instanceId` for observation/lifecycle fencing, but the **Host Resource write authority is independent from Profile Settings**; replacing the Profile Settings provider must not invalidate an otherwise unchanged Resource Host basis. No Save-time recapture and no silent write retries.
- Rejected basis, stale authority, invalid reserved field and malformed document must not modify storage or publish an invalidation cursor.
- Any structural edit must reserve revision/incarnation and preserve unknown siblings. The reserved incarnation field is Host-owned: payloads may not set it.
- For Resource cursor coherence, `resourceAuthorityId` and `incarnationId` must be compared in authoritative read brackets and list↔document invalidation, even when numeric revisions match.
- Respect published StorageDomain table semantics: synchronous `table.update` callback controls update validation; `get`+async `delete` is serialized only within the package's `operationTail`. **No cross-process or foreign-writer atomic CAS guarantee is claimed**.
- The Resource write lane remains separate from Profile Settings, and Provider change does not reset unrelated Profile mutations. Native preset authoring stays M8C.

## Storage API preflight, safety limits and evidence

This slice does **not** add a new DSH storage-domain dependency or bypass the already-qualified public StorageDomain API. Existing published-package preflights and regression files are `tests/prompt-library-upstream-contract.ts` and `tests/prompt-library-upstream-runtime.mjs`: the native API exposes `open(spec)`, `table(name)`, and `get/entries/put/delete/update`. The `table.update` synchronous callback is the Host's checked replacement point. Delete is `get` + `delete` serialized by this plugin's single `operationTail`; the existing public API has no foreign-process/foreign-writer conditional delete guarantee. Do not claim distributed atomicity.

The reserved storage field is `__dshCmResourceIncarnation` (UUID). It is omitted from Client DTOs except for a separately projected browser-safe `incarnationId`; invalid stored field values isolate the record as invalid and are not silently rewritten. Existing valid legacy rows with no field project `incarnationId:null`; first *successful* leaf/replace update adds an incarnation in that same `table.update` commit. The storage Domain version remains 1 because the payload table remains opaque, forward-compatible JSON.

**RED evidence:** [workflow #40526267595](https://github.com/WwlWss/dsh-context-manager/actions/runs/40526267595) on `d95db05a520c`: both unguarded ABA/remount scenarios failed, showing an unsafe old write was accepted.

**GREEN focused evidence:** [workflow #40530368505](https://github.com/WwlWss/dsh-context-manager/actions/runs/40530368505) passed for the v3 Host/Client contract; later regression expansions cover legacy migration, reserved-field refusal, duplicate IDs, revised source-aware Resource read stamps, and changed Resource Authorities with equal numeric cursors.

This PR is **B0 only**: Host/Remote safety and B1-3 read adapter; B1 will separately add a production Client Resource Mutation Controller, presentation Business Face and explicit recovery flows.

## Review remediation after 86-job baseline

Independent source review on `444edd83c5eef557fe6998e0a76fa4de12a0be77` found three P2 issues/gaps. Changes are deliberately limited to the existing B0 scope:

1. **Resource Authority chronology:** `ContextManagerChangeTracker.syncResourceAuthority()` observes each storage-source lifetime transition. The first observation establishes a baseline without bump. A subsequent `A → null → B` or direct `A → B` transition increments `generation`, `promptResources`, and `runtime` in one `bump()`, while preserving `instanceId`, `profiles`, and `presets`. The existing Client `adoptChanges()` check now rejects delayed older generations without a second protocol or authority state machine.
2. **Executable Client-test type safety:** `test:client-model` now runs `tsc -p tsconfig.client-model-test.json --noEmit` before `tsdown`. All three Client tests are included, including Profile Editor fixtures. Scripted Resource fixtures additionally assert positive safe revision and `string | null` incarnation. No `any` escape or relaxed compiler options are used to hide errors.
3. **Remote v3 leaf acceptance:** actual `setPromptResourceName`, `setPromptResourceDescription` (text and explicit `null` removal), and `setPromptResourceContent` calls are verified through `ContextManagerRemoteService`, strict `TypertGatewayService`, and real `ContextManagerPromptLibrary` + `MemoryStorage`. Success increments revision exactly once, does not change incarnation, preserves unknown extensions, and returns distinct authority/incarnation/revision conflict codes without mutating stored content.

**RED evidence**: [#40672392676](https://github.com/WwlWss/dsh-context-manager/actions/runs/40672392676) demonstrates the Host Authority transition cursor failure; [#40672693995](https://github.com/WwlWss/dsh-context-manager/actions/runs/40672693995) demonstrates that strict test TypeScript detects the previously invalid fixture and historical Profile Editor typing. **Focused GREEN evidence**: [#40673438195](https://github.com/WwlWss/dsh-context-manager/actions/runs/40673438195), successful Draft Quick CI with the real Host + Gateway leaf tests and TypeScript checking.

This does **not** change Resource write Basis, published v3 DTO/34-method count, native StorageDomain semantics, B1-3 eager/lazy loading boundaries, or B2-A Profile Mutation. Requalification on the final Ready HEAD is required before merge.

## Staged implementation

1. Red tests for same-ID ABA and replaced storage source with equal numeric revision. Retain original red run as audit evidence.
2. Host identity persistence & legacy lazy migration; execution-time checks in the existing serialization/Storage update boundary.
3. Remote v3 DTOs, revisions and structured business conflicts, added leaf operations, exact generated declaration test.
4. Client B1-3 resourceAuthority/Incarnation metadata projection, read-stamp capture and bracket invalidation, with no eager body loading.
5. Focused Host + fake Remote/client tests; exact-head Draft Quick CI; strict source review; Ready 86-job retained-generation and packed Chromium matrix; independent main postmerge CI.
