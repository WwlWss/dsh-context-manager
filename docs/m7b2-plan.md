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

## Revision contract

Every profile write captures exactly one fresh `profiles.persistence.revision` from B1-1 at operation start.

Never use:

- `changes.profiles`;
- global change generation;
- a mutation response revision invented on the Client;
- an automatic pre-write refresh followed by an implicit retry.

If no fresh profile persistence revision is available, the Client refuses the write locally with `profile-revision-unavailable`.

A write also requires the currently attached Host protocol to be `compatible`. `unchecked`, `checking`, or protocol-error state is not sufficient proof for a new mutation.

## Concurrency contract

All profile mutations share one Settings revision chain and therefore one Client operation lane.

M7B2-A is deliberately single-flight:

- while one profile mutation is active, another profile mutation returns `busy`;
- the controller does not queue and rebase a second operation onto a later revision;
- attachment or Host-authority replacement resets operation publication ownership;
- a late completion from an older lifecycle cannot publish over the new lifecycle.

This is UI-control-plane work, not a throughput hot path.

## Outcome contract

Known business failure means the Host explicitly rejected the write.

- `profile-conflict` is never retried. The Client performs read-only authoritative recovery and returns the original conflict including expected/actual revisions.
- read-only, unavailable, invalid-path, invalid-profile, and other stable business errors do not poison B1-1 read surfaces.

Transport failure or a rejected unary call is outcome-unknown: the Client cannot prove whether the Host committed before the reply was lost. It must not retry the write. It performs a safety rehydrate when the operation still belongs to the current lifecycle.

Confirmed mutation success is always reported as applied, even if post-success rehydration is degraded.

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

1. the generated `contextManager` Remote satisfies both read and profile-mutation Client ports;
2. mutations use persistence revision rather than a change cursor;
3. no fresh revision means no Remote write;
4. profile mutations are single-flight and not silently queued/rebased;
5. success ignores the returned snapshot for direct cache adoption and rehydrates through B1-1;
6. conflict is exactly-once, preserves expected/actual revisions, and performs read recovery only;
7. stable business refusal does not poison read surfaces;
8. outer Remote failure and rejected calls are outcome-unknown and never auto-retried;
9. confirmed success remains applied when rehydration degrades;
10. attachment/authority replacement prevents late operation-state publication;
11. retained Client declaration and packed artifact matrices remain green.
