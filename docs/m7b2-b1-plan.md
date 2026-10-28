# M7B2-B1 — Client PromptResource Mutation Controller and Authoritative Recovery

**Status:** Draft implementation. **Base:** merged B2-B0 PR #38, `main` `668b00bd715149527fb1ad72f942bc370a8e7080`; independent 86/86 main full qualification run #40687358828 succeeded.

## Goal and user-facing result

Expose six existing Remote v3 PromptResource mutations through an independent Client resource-operation lane with immutable authoring bases, explicit outcome classification, authoritative B1-3 lazy-read recovery, and the retained renderer Business Face. M8A owns the future Resource/Binding editing UI and its local drafts; this PR owns no UI.

## Exact scope and compatibility

No Host/Remote protocol changes, new persisted fields, remote polling, alternate authoritative cache, automatic retries, second Client lifecycle owner, or modification to the B2-A Profile mutation controller. Keep the Remote v3 generated 34-method namespace, published Host/Client peer ranges, packed artefact, Slot ABI, React-free model, and retained Chromium compatibility. One Draft branch and PR through all repairs; Ready/Full qualification only after focused source review.

The Client's existing `ContextManagerClientResourceMutationRemote` is merged structurally into `ContextManagerClientBusinessRemote`, and the existing six Remote v3 signatures are reused unchanged. Profile and Resource operation lanes are independent: global single-flight *within* Resource, no cross-domain blocking.

## Ownership and identity

- Host owns actual storage, immutable Resource write basis and conflict checking: Create `{resourceAuthorityId}`; update/delete `{resourceAuthorityId,resourceId,incarnationId,revision}`. Remote v3 remains the sole final arbiter.
- B1-3's read stamp additionally contains `instanceId` and `source: 'list'|'document'` for observation only. Resource mutation basis equality uses **resourceAuthorityId + resourceId + incarnationId + revision**, never Profile `instanceId`. Captured stamp remains immutable and is passed without Save-time recapture/rebasing.
- Model owns the single authoritative `ContextManagerClientSnapshot` plus lazy reads, bounded document map, `keyedOwners`, and resource invalidation. Controller owns only its operation state/epoch/observed Resource source identity, and must not construct authoritative Resource snapshots from Host mutation receipts.
- A Profile `instanceId` rotation clears B1-1 read observations and requires fresh Resource verification, but **does not itself supersede** a Resource operation if the Resource source persists. A *confirmed accepted* `resourceAuthorityId` change, Client detach/dispose, or confirmed protocol incompatibility supersedes old Resource operation publication.
- Use B1-3 monotonic accepted `changes.generation` ordering, then fence Resource controller source identity before synchronous Model snapshot publication. The fence only rejects stale writes, never grants permissions independently. Profile-only baseline recovery must not recapture the original Resource basis.

## Controller contract

Expose immutable `ContextManagerClientResourceCreateBasis` and reuse `ContextManagerClientPromptResourceReadStamp`. Six basis-first Client methods: `createPromptResource(createBasis,id,input)`, `replacePromptResource(stamp,input)`, `deletePromptResource(stamp)`, `setPromptResourceName(stamp,name)`, `setPromptResourceDescription(stamp,description|null)`, `setPromptResourceContent(stamp,content)`. Controller strips `instanceId/source` from the Host wire mutation basis. Source-aware currently fresh List/Document observations are checked against the original stamp. Create requires current Resource Authority only. An unavailable current observation blocks without silently refreshing/rebasing.

One global Resource lane, `idle -> running(mutating) -> running(rehydrating) -> settled`. Result statuses: `applied(refresh: fresh|degraded)`, `rejected(refresh: not-requested|fresh|degraded)`, `unknown(refresh: fresh|degraded)`, or `superseded|detached|disposed|incompatible`. Local preconditions distinguish busy/protocol-unavailable/resource-authority-unavailable/resource-basis-unavailable/resource-basis-stale/invalid-resource-basis. Transport failures are **outcome unknown** even if recovery later finds equal content. Host success remains applied if recovery degrades. Never retry writes.

The controller must verify operation ID/epoch, attachment/Remote instance, protocol, observed Resource Authority and basis both before and after synchronous SnapshotStore publication, before issuing the single RPC, after receipt, and around recovery publication. A stale completion never overrides current state. When the lane is active, another Resource write rejects busy without clobbering running state. Profile writes may proceed independently.

## Authoritative read and recovery contract

Add a narrow model-owned Resource mutation invalidation/recovery bridge; never introduce a second Resource cache. At start of the write, invalidate cached List and target Document and revoke their prior keyed-read publication owners before dispatch; after every outcome where Host may have changed resource state, invalidate again before directed recovery, including on conflict and unknown. A pending/out-of-order read never resurrects a fresh old revision. Read-only recovery must use B1-3's existing `loadPromptResourceList` and `loadPromptResource` paths, with no background polling and no second mutation RPC.

Create refreshes metadata List; name/description refresh List plus already-cached target Document; content/replace refresh List and target Document; delete refresh List and leaves deleted old Document stale (do not require a not-found read). Conflict/unknown refresh targeted surfaces according to operation kind. Unrelated documents are not eagerly loaded. Successful recovery is proved by real fresh `ContextManagerClientSurface` states with matching Resource Authority and mutually consistent List/document incarnation+revision, **not** by `LazyReadResult.status='completed'`, a mutation receipt, or profile revision. A fresh List can legitimately show an externally deleted or newly recreated resource; no inference that our RPC caused that state. Legacy null incarnation upgrades on first successful Host update; old stamp stays unchanged.

## Business Face

The same apply-lifetime frozen face exports `hooks.contextManager`, `hooks.profileMutation`, new `hooks.resourceMutation`, existing Profile APIs, `loadPromptResourceList`, `loadPromptResource(id)`, `capturePromptResourceCreateBasis`, `capturePromptResourceReadStamp(id,source)`, and a frozen six-method `resourceMutations` explicit forwarding facade checked by `satisfies`. No controller reset/dispose, Remote, lifecycle, direct snapshot injection or package-owned React subscription is exposed. Existing `plugin.ts` and Profile Drawer should remain unchanged.

## Planned files and evidence

New `src/client/resource-mutation-types.ts`, `src/client/resource-mutation-controller.ts`, `tests/client-resource-mutation.test.ts`. Extend `src/client/remote-port.ts`, `src/client/model.ts`, `src/client/business-face.ts`, Client test TS/build/config and existing business-face/model/real renderer tests. No Host, Remote, storage, `profile-drawer.ts` or B2-A production edits.

Focused tests must prove six exact wire calls; single-flight and Profile-independent writes; immutable stamp; stale/unavailable/invalid basis; Resource A→null→B or direct B rebind; Profile instance rotation with unchanged Resource Authority; synchronous publication detach/reentry; stale in-flight list/document; equal-revision ABA; legacy null→UUID upgrade; deterministic business conflicts vs transport unknown; success+degraded; true surface freshness; frozen renderer face and retained real Hook binding. The new tests must be both strictly typechecked and executed, never transpile-only.

Qualification flow: executable published-upstream preflight (type + real loader), RED regression and recorded workflow, focused GREEN with `pnpm run check`/real runtime probe and Draft Quick CI, independent source review, Ready 86-job Full qualification on **exact head**, final review, merge, post-merge independent `main` check. Preserve previous support declarations and required CI check names.
