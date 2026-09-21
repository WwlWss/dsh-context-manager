# M7A — Client Artifact / Loader ABI / Remote Mount / Slot Skeletons

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

Host and Client typechecking are separate. The normal Host build emits the public `client-contract.d.ts` and generates the strict Remote contribution. Only after that contribution exists does the browser build bundle `scripts/client-entry.ts`.

The browser bundle keeps only `react` external. Generated Remote codecs and package-local code are bundled into the one Client artifact. Package tests scan the emitted artifact and fail if extra synchronous module-table requests or asynchronous chunks appear.

## Deferred to M7B/M7C

- `protocol()` compatibility guard;
- `changes -> reads -> changes` stable hydration;
- change polling / reconnect invalidation;
- profile list and selection;
- Profile CRUD and revision chains;
- preset/profile diagnostics;
- production Drawer styling.

M7A is complete when the same published Client artifact is proven to load, mount the generated Remote contribution, register both additive slots, and unload cleanly across every retained DSH generation.
