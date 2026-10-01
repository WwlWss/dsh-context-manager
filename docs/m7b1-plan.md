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

For each requested surface set, bounded to three stabilization attempts:

1. guard `protocol()`;
2. read `before = changes()`;
3. reset all authority if `before.instanceId` differs from the adopted instance;
4. read requested authoritative surfaces in parallel;
5. read `after = changes()`;
6. if the instance changed during the bracket, clear the batch and restart from the protocol guard;
7. adopt only reads whose relevant cursor is stable across the bracket;
8. retry only cursor-unstable surfaces;
9. surface read failures remain isolated and are not automatically retried;
10. persistent cursor churn becomes an `unstable-snapshot` error after three attempts.

Cursor mapping:

- profiles -> `changes.profiles`
- presets -> `changes.presets`
- prompt placement -> `changes.runtime`

Change cursors are invalidation hints only and are never persistence revisions.

## Concurrency

Use one attachment epoch plus one epoch per baseline surface.

A completion may publish only when:

- the model is not disposed;
- its attachment epoch is current;
- its surface epoch is current.

A newer refresh of one surface must not cancel unrelated in-flight surfaces.

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
