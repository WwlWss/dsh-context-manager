# M7B1 — Authoritative Client Model

**Status:** B1-1 is complete in merged PR #27. B1-2 Slot business bridging is the current slice and is specified separately in [m7b1-2-plan.md](m7b1-2-plan.md); B1-3 PromptResource/keyed lazy Client surfaces remain pending.

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
        ↓ B1-2 retained Slot inject/hooks bridge
renderer-facing business face
        ↓
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

Whenever an accepted `changes` snapshot advances the cursor for a baseline surface, cached fresh data for that surface becomes stale in the same store publication, even when the surface is not part of the current reconcile. The data is retained; only a stable authoritative read at the latest cursor restores `stale: false`. A newer global generation alone does not stale a surface whose own cursor is unchanged.

Transient refresh failure may retain previous data as stale. A Host `instanceId` change clears all authoritative caches because data from the old Host instance is no longer valid.

**M7B2 semantic strengthening:** B1-1 originally consumed `instanceId` as a Host-authority lifetime. M7B2 keeps the B1-1 reconciliation algorithm and wire field unchanged but broadens the producer semantics: ChangeTracker now rotates `instanceId` when the profile-write-authority token changes, including Settings-provider or `ContextManagerService` replacement. B1-1's existing full-cache invalidation therefore applies to those replacements without adding Client state.

## Stable hydration

Starting a reconcile records refresh intent but does not immediately claim surface publication ownership. After a locally usable protocol guard and confirmation of the current Host authority, the reconcile claims requested surfaces in reconcile-run order. A later run may supersede an earlier surface owner; an earlier delayed run may never reclaim a surface from a higher run. Surface ownership is reset only at attachment or Host-authority lifetime boundaries, not when an owner merely completes.

Protocol compatibility and cursor stabilization are separate loops:

1. guard `protocol()` for the reconcile's current authority epoch;
2. read `before = changes()`;
3. if `before.instanceId` is the first observed Host lifetime or differs from the adopted one, perform a compare-and-swap authority transition that clears every authoritative cache and the old protocol verdict, then restart from `protocol()`;
4. only a reconcile whose captured authority epoch is still current may perform that transition; a stale reconcile exits instead of rebasing itself onto the newer authority;
5. once the same `instanceId` survives the protocol -> `changes()` boundary, adopt the change hint, atomically marking any cached baseline surface stale when that surface's accepted cursor advanced, even if the surface was not requested by this reconcile;
6. claim only requested surfaces whose latest owner run is not newer than this reconcile; the claim issues the surface completion token, then those claimed surfaces enter `loading` and are read in parallel;
7. re-check attachment and authority before issuing the closing `changes()`;
8. if the Host lifetime changes during the bracket, clear the batch and restart from the protocol guard with surface ownership reset for the new authority;
9. adopt a read only when its relevant cursor is stable across its own bracket and still equals the latest adopted cursor for that surface; a newer unrelated generation does not invalidate a surface whose own cursor is unchanged;
10. apply the same current-cursor fence before publishing either successful data or a read error, so a failure from an already superseded cursor is retried instead of becoming the current surface error;
11. retry only cursor-unstable or no-longer-current surfaces, for at most three cursor-stabilization attempts;
12. bound repeated Host-lifetime replacement separately; three consecutive authority restarts become an `unstable-authority` read error rather than an unbounded reconcile loop.

Global protocol publication is owned by the newest reconcile run for the current attachment and Host authority, not by the physically latest RPC attempt. A superseded older run may retry negative protocol results locally for at most three attempts and may use a later compatible result as its own local proof, but it cannot publish `checking`, `compatible`, `error`, or `incompatible` over a newer run. If ownership changes in the helper-to-consumer continuation gap, the older negative result yields instead of restarting an unbounded outer loop. A superseded protocol run never claims surface ownership. A current terminal protocol/read failure claims its requested surfaces in run order before publishing errors, so older same-surface completions cannot overwrite the terminal outcome.

Cursor mapping:

- profiles -> `changes.profiles`
- presets -> `changes.presets`
- prompt placement -> `changes.runtime`

Change cursors are invalidation hints only and are never persistence revisions.

## Concurrency

Use four related guards:

- one attachment epoch for Remote attach/detach/replacement;
- one authority epoch for Host `instanceId` ownership;
- one epoch plus a latest-owner reconcile run per baseline surface for data adoption;
- reconcile-run bookkeeping for global `sync` / protocol publication.

A surface completion may publish only when:

- the model is not disposed;
- its attachment epoch is current;
- its authority epoch is still current after any Host replacement;
- its surface epoch is current;
- its own before/after cursor is stable;
- the latest adopted `changes` snapshot still carries the same cursor for that surface.

A newer refresh of one surface must not cancel unrelated in-flight surfaces. A reconcile that has not yet passed its protocol/authority gate cannot cancel an existing same-surface owner merely by starting, and an older delayed reconcile cannot reclaim a surface after a higher run has claimed it. Because the SnapshotStore may notify subscribers synchronously, a reconcile re-checks attachment, authority, and claimed surface tokens after publishing `loading` and before starting any surface Remote call; synchronous detach/dispose/replacement therefore cannot start new work on the stale attachment. Global `sync` stays `syncing` until the last overlapping reconcile settles. Global protocol state is similarly run-owned: once a newer reconcile has taken protocol ownership for the current authority, an older reconcile may finish local work but cannot reclaim protocol publication through a later retry. An older or stale-authority reconcile therefore cannot overwrite the protocol/sync result of a newer authoritative run.

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
