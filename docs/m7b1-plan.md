# M7B1 — Authoritative Client Model

**Status:** B1-0 contract normalization is merged. This document freezes the B1-1 implementation contract only.

## Goal

Build one React-free, stable-identity Client business model over the strict Host Remote without adding polling, mutations, or Drawer business UI.

B1-1 establishes:

- the real generated `contextManager` Remote namespace as the data source;
- a narrow read-only Client Remote port;
- transport-level `RemoteResult<T>` handling;
- protocol guarding;
- `changes -> authoritative reads -> changes` hydration;
- per-surface adoption and error isolation;
- Host `instanceId` reset semantics;
- attachment and surface epoch fencing;
- bounded stabilization;
- a B2-ready `reconcile()` and profile persistence revision accessor.

## Ownership

```text
Host authoritative services
        ↓ strict Typert Remote
remote.contextManager
        ↓
React-free Context Manager Client model
        ↓ later B1-2 Slot hook adapter
presentation store / React
```

The Client model is not a second source of truth. It caches only authoritative Remote projections and never persists them to browser storage.

## Lifecycle topology

The top-level Client plugin remains the owner of the generated contribution mount and keeps its existing required injections:

```text
remote
slots
locale
```

After `ctx.remote.$mount()` succeeds, it starts a child Cordis fiber that declares the actual business Remote dependency:

```text
remote
remote.contextManager
```

The child attaches the already-created stable model to `ctx.remote.contextManager`. This avoids making the mount owner depend on a namespace that it must first create.

The child is disposed before the Remote contribution is withdrawn. Detach invalidates in-flight work but does not create a replacement model/store identity.

Once the Remote mount succeeds, model creation and child-fiber setup stay inside the same rollback boundary as Locale/Slot setup. A synchronous child-fiber creation failure or asynchronous startup failure must therefore dispose any child/model state that exists and withdraw the mounted contribution before propagating the error.

## Remote transport

Generated unary Client methods return Typert `RemoteResult<T>`, not raw Host DTOs.

B1-1 handles only the transport result layer:

```text
RemoteResult<T>
  ok:true  -> T
  ok:false -> RemoteFailure
```

A rejected promise is reserved for assembly/topology faults such as an unavailable withdrawn method. It is distinct from a normal `RemoteResult.ok === false` failure.

B2 mutation endpoints later have a second business-result layer:

```text
RemoteResult<ContextManagerRemoteResult<T>>
```

B1-1 must not collapse those concepts.

## Baseline surfaces

B1-1 hydrates only:

- `protocol()`
- `changes()`
- `profiles()`
- `presets()`
- `promptPlacement()`

PromptResource data and Agent/Session diagnostics remain out of scope until B1-3.

## State model

Use `@deepseek-ai/dsh-client-store/createSnapshotStore`. Do not implement listeners, publication, or persistence locally.

The stable snapshot contains:

- attachment state;
- protocol state;
- sync state;
- current Host `instanceId` and latest adopted change snapshot;
- independent surfaces for profiles, presets, and prompt placement.

Each surface owns `status`, `stale`, optional authoritative `data`, and optional read error. A failed read does not poison unrelated surfaces.

Transient refresh failure may retain previous data as stale. A Host `instanceId` change clears all authoritative caches because data from the old Host instance is no longer valid.

## Stable hydration

A reconcile reserves per-surface epochs immediately so a newer refresh of the same surface supersedes older completions, but it does not mark a surface `loading` until the protocol guard and current Host authority have been established.

Protocol compatibility and cursor stabilization are separate loops:

1. guard `protocol()` for the reconcile's current authority epoch;
2. read `before = changes()`;
3. if `before.instanceId` is the first observed Host lifetime or differs from the adopted one, perform a compare-and-swap authority transition that clears every authoritative cache and the old protocol verdict, then restart from `protocol()`;
4. only a reconcile whose captured authority epoch is still current may perform that transition; a stale reconcile exits instead of rebasing itself onto the newer authority;
5. once the same `instanceId` survives the protocol -> `changes()` boundary, adopt the change hint, mark only still-current requested surfaces `loading`, and read those authoritative surfaces in parallel;
6. re-check attachment and authority before issuing the closing `changes()`;
7. if the Host lifetime changes during the bracket, clear the batch and restart from the protocol guard;
8. adopt only reads whose relevant cursor is stable across the bracket;
9. retry only cursor-unstable surfaces, for at most three cursor-stabilization attempts;
10. bound repeated Host-lifetime replacement separately; three consecutive authority restarts become an `unstable-authority` read error rather than an unbounded reconcile loop.

A superseded negative protocol result is retried a bounded number of times before the stale reconcile yields to the newer protocol owner. A positive result may be used as that reconcile's local guard, while global protocol publication remains token-fenced. Protocol failure occurs before surfaces enter `loading`; the reserved surface epochs are then failed directly, retaining any previous data as stale.

Cursor mapping:

- profiles -> `changes.profiles`
- presets -> `changes.presets`
- prompt placement -> `changes.runtime`

Change cursors are invalidation hints only and are never persistence revisions.

## Concurrency

Use four related guards:

- one attachment epoch for Remote attach/detach/replacement;
- one authority epoch for Host `instanceId` ownership;
- one epoch per baseline surface for data adoption;
- reconcile-run bookkeeping for global `sync` / protocol publication.

A surface completion may publish only when:

- the model is not disposed;
- its attachment epoch is current;
- its authority epoch is still current after any Host replacement;
- its surface epoch is current.

A newer refresh of one surface must not cancel unrelated in-flight surfaces. Global `sync` stays `syncing` until the last overlapping reconcile settles, and an older or stale-authority reconcile cannot overwrite the protocol/sync result of a newer authoritative run.

Host identity changes use compare-and-swap semantics: only the reconcile that still owns its captured authority epoch may create the next epoch. A completion from an older authority must exit; it must never assign itself the newer epoch and continue. Protocol verdicts are Host-lifetime facts, so every authority transition clears the old verdict and requires a new guard before business reads.

The latest adopted `changes` snapshot for one `instanceId` must never move backward in `generation`.

## B2 preparation

B1-1 exposes one internal reconciliation path used by both refresh and future mutation recovery:

```ts
reconcile(scopes)
```

It also exposes:

```ts
getProfileRevision(): number | undefined
```

That getter returns only a fresh authoritative `profiles.persistence.revision`. It must never return `changes.profiles`.

PromptResource revision access is deferred to B1-3.

## Explicit non-goals

B1-1 does not add:

- polling or focus refresh;
- automatic reconnect loops;
- PromptResource list/document caches;
- Session/Agent diagnostics;
- Slot business hooks;
- profile/resource/preset mutations;
- Profile Drawer CRUD.

The existing Drawer remains presentation-only in this slice.

## Evidence

B1-1 must add:

- compile proof that generated `TypertRemoteNamespaceMap['contextManager']` satisfies the narrow read port;
- retained Client declaration compilation across 0.1.2 / 0.1.5 / 0.1.6;
- focused runtime tests for protocol mismatch, stable hydration, partial failures, per-surface retry, Host restart, race fencing, detach, bounded churn, and revision-vs-cursor separation;
- existing packed/composition gates unchanged except where necessary to compile the new Client source.

No custom DSH Gateway/Client runtime is to be reimplemented for these tests.
