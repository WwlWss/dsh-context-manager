# M7B1-2 — Stable Slot Business Bridge

**Status:** current implementation slice.

## Goal

Expose the already-merged authoritative Client model (B1-1) and profile mutation controller (M7B2-A) to future Context Manager components through the retained DSH Slot/renderer business-face contract, without creating a second source of truth, copying business state into presentation storage, or reintroducing package-owned React subscription machinery.

B1-2 is an integration slice only. It does not change Host/Remote semantics, authoritative reconciliation, mutation outcome semantics, or Profile Drawer product behavior.

## Dependency boundary

```text
strict generated Remote v2
        ↓
B1-1 authoritative Client model
        ↓
M7B2-A profile mutation controller
        ↓
B1-2 narrow renderer-facing business face
        ↓ retained Slot inject/hooks binding
future M7C Profile Drawer
```

The existing presentation store remains view-only and independently owned by DSH's Store contract.

## Ownership contract

The top-level Client plugin owns the full `ContextManagerClientModel` lifecycle. The B1-2 adapter receives only the subset it is allowed to project:

```ts
type ContextManagerClientBusinessSource = Pick<
  ContextManagerClientModel,
  | 'state'
  | 'mutations'
  | 'refresh'
  | 'captureProfileMutationBasis'
>
```

The bridge must not receive or expose `attach`, `reconcile`, `getProfileRevision`, or `dispose`. It is not a second lifecycle owner and must not add an epoch, retry loop, transport cache, or subscription registry.

The business face is created once per Context Manager Client plugin `apply()` lifetime. Slot declaration collapse/redeclare may create a new Slot registration, but the same apply-lifetime business-face object is reused. Only a full Client plugin unload/reload creates a replacement face/model lifetime.

## Renderer face

The renderer-facing face contains exactly:

```ts
interface ContextManagerClientBusinessFace {
  readonly hooks: {
    readonly contextManager: ContextManagerClientModel['state']
    readonly profileMutation: ContextManagerClientModel['mutations']['state']
  }
  readonly refresh: () => Promise<ContextManagerClientReconcileResult>
  readonly captureProfileMutationBasis:
    () => ContextManagerClientProfileMutationBasis | undefined
  readonly profileMutations: ContextManagerClientProfileMutations
}
```

The face, its `hooks` object, and the mutation facade are frozen.

Dynamic business state crosses the Slot boundary only as bare observable sources under the reserved `hooks` compartment. Retained DSH renderer code owns conversion of those sources into `useContextManager(selector)` and `useProfileMutation(selector)`. Context Manager must not call `useSyncExternalStore`, implement a selector hook, or manually subscribe from a component.

Plain injected members are stable callbacks. Do not inject a snapshot such as `model.state.getSnapshot()`: root inject results are cached for a registration lifetime, so doing so would freeze stale business values.

## Explicit mutation facade

Never expose `model.mutations` directly because the controller also owns its internal `state` observable and may gain additional implementation members later.

Project all fourteen `ContextManagerClientProfileMutations` methods explicitly through one frozen facade. Use a compile-time `satisfies ContextManagerClientProfileMutations` check so a future mutation-contract change requires an explicit bridge decision.

Do not use object rest/spread to strip `state`; that would make future controller members leak through implicitly.

## Mutation basis ownership

The bridge keeps basis capture and mutation commit separate.

```text
presentation action/draft formation
        ↓
captureProfileMutationBasis()
        ↓
presentation keeps { value, basis }
        ↓ later explicit commit
profileMutations.<method>(capturedBasis, ...)
```

A mutation wrapper must never call `captureProfileMutationBasis()`, refresh first, or replace the caller's `{ instanceId, revision }` with a newer basis. This preserves M7B2-A stale-write/conflict semantics.

The contract is semantic value preservation, not JavaScript reference identity. Tests assert that the exact captured `instanceId` and `revision` values reach the mutation controller and that mutation wrappers perform zero basis recaptures.

## Presentation-state boundary

B1-2 does not add authoritative data to the presentation store. Profiles, presets, protocol state, revisions, mutation results, and change cursors stay in the Client business model.

The presentation store remains responsible only for view-local state. M7C may later add selection, tabs, drafts, confirmation state, and the basis associated with an edit, but those are not part of B1-2.

The footer trigger receives no business face. Only the Drawer registration receives the B1-2 face.

## Slot lifecycle

The business face is created outside both `ctx.slots.inject(...)` callbacks and reused by every declaration lifetime:

```text
Client apply lifetime
  ├─ model X
  └─ business face X
       ├─ shell.overlay StoredEntry A
       └─ after collapse/redeclare: StoredEntry B
```

Both A and B inject the same face X.

Disposal remains owned by existing Client/plugin/model lifecycle code. A retained stale face after plugin disposal must naturally observe the model's existing detached/disposed fences; B1-2 does not add a second teardown state machine.

## Component boundary

B1-2 wires the face into `ContextManagerDrawer`'s `ComposedProps` contract but deliberately does not make the production Drawer consume `useContextManager` or `useProfileMutation` yet. Creating unused subscriptions solely for evidence would be production churn.

M7C is the first product slice that consumes the business selectors and renders profile state.

## Retained compatibility evidence

The supported Client generations remain:

- `0.1.2-rc.1`;
- `0.1.5-rc.1`;
- `0.1.5-rc.2`;
- `0.1.6-alpha.2`.

For those generations, CI must compile production `ComposedProps` against the real retained `inject.hooks` contract and execute a real retained renderer bridge proving that the production business face becomes live selector hooks.

The existing five-generation same-built-artifact `SlotCore` lane remains deliberately narrower evidence and still includes `0.1.1-rc.2`. It proves structural Slot ABI continuity only; it does not lower the M7 Client minimum or claim full 0.1.1 renderer support.

Real-renderer runtime evidence must exercise the actual retained renderer binding path rather than copying `bindInjectSources`, `observableHook`, or any private framework implementation into this repository.

## Evidence

B1-2 is complete only when focused evidence proves:

1. the bridge dependency is the narrow business-source subset, not the full model lifecycle face;
2. the business face exposes exactly two observable hook sources plus refresh/basis/mutation callbacks;
3. the fourteen mutation callbacks are explicit and no controller `state` member leaks through the mutation facade;
4. a caller-supplied mutation basis reaches the controller with identical `instanceId` / `revision` values and mutation wrappers perform zero basis recaptures;
5. `refresh()` and `captureProfileMutationBasis()` remain live callbacks over the apply-lifetime model;
6. the footer receives no business face while the Drawer does;
7. declaration collapse/redeclare creates a new Slot entry but reuses the same apply-lifetime business face;
8. current Remote fixtures use API v2 rather than a stale M7A/B0 protocol v1 value;
9. the retained declaration matrix derives `useContextManager` / `useProfileMutation` through real `ComposedProps` / `InjectFace` types;
10. the retained 0.1.2+ runtime matrix runs the actual renderer binding and observes selector-driven updates;
11. plugin disposal prevents stale business callbacks from restarting Remote work through the existing B1-1/B2-A lifecycle fences;
12. existing packed artifact, loader, SlotCore, Remote, and published-bundle gates remain green.

## Explicit non-goals

B1-2 does not add:

- Profile Drawer list/forms/diagnostics;
- profile selection or presentation drafts;
- PromptResource Client state or resource revision ownership;
- PromptResource mutation;
- native preset copy/remove;
- polling, focus refresh, or reconnect loops;
- optimistic updates;
- a new Remote endpoint or Remote API version;
- package-owned React subscription machinery;
- a new Client lifecycle state machine.
