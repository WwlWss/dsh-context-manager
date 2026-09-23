# M7A — Client Artifact / Loader ABI / Remote Mount / Slot Skeletons

**Status: complete — merged in PR #23.** The loader/Remote/Slot foundation is retained. M7B0 owns the presentation-contract cleanup identified by the post-merge source review.

Status: **implementation in progress**.

M7A establishes the browser artifact and lifecycle boundary only. Profile state, Remote reads, CRUD, cursor polling, diagnostics, and rich editors remain M7B/M7C.

## Scope

M7A ships exactly one browser bundle:

```text
lib/client.js
lib/client.js.map
```

The package exposes it through `./client` and declares a Web `dsh.client` graph row. The bundle uses the retained DSH loader ABI:

```text
window.__ModuleLoader__.load({ id: 'dsh-context-manager', factory(require) { ... } })
```

No package-local Client chunks or `require.async()` are allowed in M7A.

## Retained-generation seams

The implementation intentionally uses only seams observed across the retained DSH lines
`0.1.1-rc.2`, `0.1.2-rc.1`, `0.1.5-rc.1`, `0.1.5-rc.2`, and `0.1.6-alpha.2`:

- Client loader factory ABI;
- `ctx.remote.$mount()`;
- root-scoped additive `sidebar.footer.action`;
- root-scoped additive `shell.overlay`;
- React from the shell module table.

M7A does not use `main` or `sidebar.panellist`, because that global-panel pair did not exist on the oldest retained line. It never replaces `root`, `details`, or another single-occupant stock subtree.

## Lifecycle

```text
Client plugin apply
  -> mount generated TYPERT_REMOTE
  -> create one apply-lifetime interaction controller
  -> register sidebar.footer.action trigger
  -> register shell.overlay Drawer skeleton

dispose
  -> withdraw overlay
  -> withdraw trigger
  -> withdraw Remote contribution
```

The interaction controller owns only `open/closed` presentation state. It is not a browser business cache and does not read Host data.

## Build boundary

Host and Client typechecking and bundling use separate TypeScript programs. Host work uses `tsconfig.json`; Client typecheck and `tsdown.client.config.ts` both use `tsconfig.client.json`. The normal Host build emits the public `client-contract.d.ts` and generates the strict Remote contribution. Only after that contribution exists does the browser build bundle `scripts/client-entry.ts`.

The browser bundle keeps only `react` external. Generated Remote codecs and package-local code are bundled into the one Client artifact. Package tests scan the emitted artifact and fail if extra synchronous module-table requests or asynchronous chunks appear.

## Post-merge contract debt and handoff

M7A proved the package artifact, loader ABI, generated Remote mount lifecycle, additive Slot registration, teardown, and same-oldest-built Client artifact across the retained production `SlotCore` generations.

The source-level closeout also found presentation code that must **not** become the pattern for later M7 work:

- `Trigger` and `Drawer` currently call React `useSyncExternalStore` against a package-owned interaction controller;
- the Slot injection face passes the whole controller object into presentation components;
- production styling still contains literal fallback colors and product copy is hard-coded English.

Retained DSH Client rules consistently require business components to contain no manual subscription machinery, use owner props/local state/declared stores for the three supported reactive channels, and keep whole business/service objects out of presentation injection. M7B0 must remove this debt without regressing M7A's proven loader, Remote, Slot, or unload/HMR behavior.

The exact cross-generation presentation-store/localization seam remains a **preflight question**, not an implementation assumption. In particular, a newer standalone Client store package must not be imported unconditionally if the minimum retained generation exposes only an older public structural/runtime seam.

## Deferred after M7A

### M7B0 — Client contract cleanup

- retained store/hook/Slot seam preflight;
- remove component `useSyncExternalStore` and manual subscribe wiring;
- replace whole-controller injection with plain props/callbacks and the supported reactive channel;
- move shared Drawer state to the proved presentation-store/hook seam;
- token/style cleanup and localization-contract preflight.

### M7B1 — Authoritative Client model

- `protocol()` compatibility guard;
- `changes -> reads -> changes` stable hydration;
- `instanceId` reset and change polling/reconnect invalidation;
- profile/preset/runtime-diagnostic pulls;
- React-free business loading/error/cursor state.

### M7B2 — Mutation controller

- Profile CRUD and revision chains;
- conflict/read-only/unavailable operation state;
- no silent stale-write retry;
- mutation followed by authoritative rehydrate.

### M7C/M7D

M7C owns the production Profile Drawer. M7D owns assembled browser/package/compatibility closeout, including repeated mount/unmount, same-artifact Client execution, packed install/load checks, and final source-forward review.
