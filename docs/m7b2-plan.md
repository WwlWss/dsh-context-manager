# M7B2-A — Profile Mutation Controller Foundation

**Status:** implementation in progress.

## Goal

Add explicit profile mutations on top of the merged B1-1 authoritative Client model without turning mutation responses into a second Client source of truth.

This slice owns profile/settings writes only. PromptResource replace/delete remains blocked on B1-3 resource revision ownership. Native preset authoring remains M8C.

## Dependency boundary

```text
strict generated Remote
        ↓
B1-1 authoritative Client model
        ↓
M7B2-A profile mutation controller
        ↓ later B1-2 hook bridge
M7C Profile Drawer
```

The controller reuses B1-1 for attachment, protocol state, authoritative profile revision, and post-operation reconciliation. It must not duplicate Host-authority, cursor, or surface-ownership state machines.

## Remote contract

M7B2-A advances the Context Manager Remote protocol from API version 1 to **API version 2** because the existing 14 profile mutation parameter contracts change from a bare Settings revision to a Host-lifetime-scoped mutation basis. This is an intentional wire-breaking protocol change guarded by B1-1 `protocol()` compatibility checks; the direct endpoint count remains 31.

The Client keeps read and mutation ports distinct:

- `ContextManagerClientReadRemote` — B1-1 reads;
- `ContextManagerClientProfileMutationRemote` — the existing 14 profile mutation endpoints;
- `ContextManagerClientBusinessRemote` — their structural combination used by the attached model.

Every profile mutation result remains two-layered:

```text
RemoteResult<ContextManagerRemoteResult<ContextManagerRemoteProfilesSnapshot>>
^ transport     ^ package-owned business result
```

Do not flatten those layers.

## Mutation basis contract

A profile write is scoped by an immutable **Profile Mutation Basis**:

```ts
{
  instanceId: string
  revision: number
}
```

The basis is captured from B1-1 when the user action or presentation-local draft is formed, and that same basis is passed unchanged when the operation is committed. Save-time recapture is forbidden because it would silently rebase a stale draft onto newer authoritative state.

- `instanceId` identifies the current **profile-write authority lifetime**, not merely the `ContextManagerChangeTracker` object. It rotates when the current `ContextManagerService` identity or current `SettingsProvider` identity changes; a ChangeTracker remount naturally creates a new ID as well.
- `revision` is the Settings persistence revision associated with the authoritative profile snapshot the user acted on and is interpreted only inside that authority lifetime.

Never use:

- `changes.profiles`;
- global change generation;
- a mutation response revision invented on the Client;
- a newly captured basis at Save time for an older draft;
- an automatic pre-write refresh followed by an implicit retry.

If B1-1 has no fresh authoritative basis, the Client refuses the write locally with `profile-basis-unavailable`. If the caller's basis no longer matches the current authoritative basis, the Client refuses the write locally with `profile-basis-stale`.

A write also requires the currently attached Host protocol to be `compatible`. `unchecked`, `checking`, or protocol-error state is not sufficient proof for a new mutation.

## Authority rotation contract

The ChangeTracker synchronizes the current write-authority tuple before every `changes()` snapshot:

```text
(current ContextManagerService object, current SettingsProvider object)
```

If either object identity changes, `instanceId` rotates immediately. This closes same-revision collisions after Settings-provider or ContextManagerService replacement without adding another wire field or advancing Remote API version beyond v2. Authority synchronization itself does not bump cursors; existing lifecycle/change events retain their original cursor-bump semantics, while `instanceId` replacement is the stronger all-cache invalidation signal.

The Host profile mutation execution path obtains the current instance ID through the package-owned Remote read sanitizer before comparing it with the mutation basis. Unexpected authority lookup/snapshot failures therefore remain sanitized Remote failures rather than leaking Host internals.

## Concurrency contract

All profile mutations share one Settings revision chain and therefore one Client operation lane.

M7B2-A is deliberately single-flight:

- while one profile mutation is active, another profile mutation returns `busy`;
- the controller does not queue and rebase a second operation onto a later revision;
- attachment or Host-authority replacement resets operation publication ownership;
- a late completion from an older lifecycle cannot publish operation state **or return an applied/rejected/unknown result as if it belonged to the new lifecycle**;
- same-lifecycle recovery failure remains `degraded`, while lifecycle replacement returns `superseded` (or detached/disposed/incompatible when that state is directly observable).

This is UI-control-plane work, not a throughput hot path.

## Outcome contract

Known business failure means the Host explicitly rejected the write.

- `profile-conflict` means the Settings revision changed within the same Host lifetime. It is never retried.
- `host-instance-conflict` means the Host lifetime changed. The Host checks this at the mutation execution point even when the numeric Settings revision happens to match.
- both conflict classes perform read-only authoritative recovery and never retry the write;
- read-only, unavailable, invalid-path, invalid-profile, and other stable business errors do not poison B1-1 read surfaces.

Transport failure or a rejected unary call is outcome-unknown: the Client cannot prove whether the Host committed before the reply was lost. It must not retry the write. It performs a safety rehydrate when the operation still belongs to the current lifecycle.

A confirmed mutation success is reported as applied when the operation still belongs to the same Client/Host lifecycle, even if post-success rehydration is degraded. If lifecycle/authority replacement occurs during terminal publication or recovery, the stale operation returns `superseded` (or detached/disposed/incompatible when directly observable) instead of publishing current success.

## Authoritative recovery

Mutation response snapshots are acknowledgement payloads, not direct Client cache writes.

After a confirmed success, run the existing B1-1 baseline reconciliation. The same safety refresh is used for conflict and transport-unknown recovery where appropriate.

```text
mutation
  ↓
confirmed applied / conflict / uncertain transport
  ↓
B1-1 reconcile()
  ↓
authoritative Client state
```

Never optimistic-patch `model.state` from mutation arguments or mutation response payloads.

## Operation state

The mutation controller owns a separate SnapshotStore from B1-1 read state.

The profile lane exposes only:

- idle;
- running / mutating;
- running / rehydrating;
- the last settled result.

It does not retain an unbounded operation history.

One failed mutation must not turn unrelated read surfaces into errors.

## Performance

Do not debounce inside the mutation controller; that changes business semantics.

M7C presentation drafts are local UI state. Text input must mutate the Host only at an explicit commit boundary such as Save, Enter, or an equivalent committed edit. Do not issue one mutation plus full reconciliation per keystroke.

## Explicit non-goals

M7B2-A does not add:

- PromptResource list/document caches or resource mutations;
- native preset copy/remove;
- B1-2 Slot/hook business bridge;
- Profile Drawer UI;
- polling/focus/reconnect loops;
- optimistic Client writes;
- mutation batching/automatic queues;
- automatic stale-write retry.

## Evidence

Required focused evidence:

1. the generated `contextManager` Remote satisfies both read and profile-mutation Client ports under Remote API version 2;
2. a captured basis contains Host `instanceId` plus Settings persistence revision, never a change cursor;
3. wrong Host instance with the same numeric Settings revision is rejected at the Host execution point without mutation;
4. no fresh basis means no Remote write;
5. a stale draft basis is rejected locally without silently rebasing to a newer revision;
6. profile mutations are single-flight and not silently queued/rebased;
7. all 14 wrappers forward exact business arguments plus the unchanged basis;
8. success ignores the returned snapshot for direct cache adoption and rehydrates through B1-1;
9. revision conflict is exactly-once, preserves expected/actual revisions, and performs read recovery only;
10. Host-instance conflict performs read-only recovery and never retries the write;
11. stable business refusal does not poison read surfaces;
12. outer Remote failure and rejected calls are outcome-unknown and never auto-retried;
13. confirmed success remains applied when same-lifecycle rehydration degrades;
14. SettingsProvider and ContextManagerService replacement rotate `instanceId`; an old basis is rejected even when the new Settings registration reuses the same numeric revision;
15. unexpected write-authority lookup failures are sanitized through the package-owned Remote error boundary;
16. attachment/authority replacement, including synchronous reentrancy during the final settled/precondition publication, prevents stale operation results from returning as current applied/rejected/unknown results;
17. retained Gateway, Client declaration, packed artifact, and published bundle matrices remain green.
