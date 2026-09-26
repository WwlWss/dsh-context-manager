# M7B0 — Client contract cleanup

**Status:** implementation complete on PR #25; awaiting exact-head closeout CI and final review.

M7B0 is a presentation-contract cleanup slice. It keeps the M7A loader ABI, generated Remote mount, additive Slot ids/order, Drawer open/close behavior, and same-artifact compatibility while removing the transitional Client architecture debt recorded after M7A.

## Scope

M7B0 owns only shared presentation state, localization, styling, and retained Client contract evidence.

It does **not** call `protocol()`, `changes()`, `profiles()`, `presets()`, or any mutation Remote. It does not add profile selection, loading/error business state, polling, hydration, diagnostics, or profile CRUD. Those remain M7B1/M7B2/M7C work.

## Retained compatibility target

Primary Client target:

- `0.1.5-rc.1`
- `0.1.5-rc.2`
- `0.1.6-alpha.2`

Retained regression where the same narrow public contract remains cheap to preserve:

- `0.1.1-rc.2`
- `0.1.2-rc.1`

DSH `0.1.7-rc.1` is source observation only and is not an implementation or support target for this slice.

## Preflight result

Across the retained lines, Slot stores use the same structural handle:

- `spec.init()`;
- `spec.actions`;
- `create(scopeKey?)`;
- instance `actions`;
- `getSnapshot()`;
- `subscribe()`;
- `clearPersisted()`.

The implementation package moved from `dsh-client-runtime` on 0.1.1 to `dsh-client-store` on 0.1.2+, but the Slot-facing structural contract stayed stable. M7B0 therefore uses a package-owned **narrow structural StoreHandle bridge** for the single `{ open }` presentation fact rather than version detection or a hard runtime dependency on a newer store package.

This bridge is not a second Client store framework: it has no React hooks, persistence, selector engine, middleware, scope registry, or business state. DSH renderer owns hook synthesis and instance lifecycle.

Locale registration/binding and Slot `locale:`/`t` seats are public across the retained lines.

## Implementation phases

### A — public contract evidence

- compile the primary published Client declaration surfaces;
- prove `sidebar.footer.action` and `shell.overlay` registrations accept a shared root store and locale;
- keep the same-built-artifact retained runtime lane.

### B — presentation store migration

- add `createContextManagerPresentationStore()`;
- move `open` state and open/close/toggle actions into the structural Slot store;
- share one handle between Trigger and Drawer;
- delete `ContextManagerInteractionController`;
- remove component `useSyncExternalStore` and manual subscription wiring;
- remove whole-controller injection.

### C — localization

- add the typed Context Manager locale namespace and zh/en dictionaries;
- add Client `locale` injection;
- register dictionaries inside `apply`;
- use the framework `t` seat for component copy;
- use a locale-following label thunk for registration-time copy.

### D — styling

- move presentation CSS into a CSS Module;
- consume retained `--dsw-*` semantic/theme tokens;
- remove literal colors and inline presentation style objects;
- compile module CSS into the existing `client.js` factory and tag injected style ownership with `data-plugin` / `data-plugin-css`;
- do not create a separately loaded runtime stylesheet.

### E — closeout

- update retained runtime tests for the store/locale/style contract;
- keep build-once/consume-many Client evidence;
- verify packed `./client` artifact;
- update compatibility/roadmap status only after exact-head evidence is green.

## Acceptance

- no `ContextManagerInteractionController`;
- no component `useSyncExternalStore`;
- no component manual `subscribe()`;
- no whole controller/service injection;
- one shared presentation StoreHandle for both entries;
- component reads through `useStore` and writes through `actions`;
- Slot names/ids/order stay unchanged;
- locale dictionary owns all product-visible copy;
- registration label follows active locale without Slot re-registration;
- presentation styles are CSS Module + DSH tokens with no literal colors;
- Remote mount and teardown behavior stays unchanged;
- exact same oldest-built `client.js` remains the retained compatibility artifact;
- no 0.1.7 peer/support claim is added.


## Implementation result

M7B0 completed the planned presentation-contract cleanup without adding M7B1 business behavior:

- the M7A interaction controller was deleted;
- Trigger and Drawer share one package-owned structural Slot StoreHandle for the root presentation state;
- components consume the renderer-provided `useStore` / `actions` seats and contain no subscription machinery;
- whole-controller injection was removed;
- product copy moved to one zh/en locale dictionary with a locale-following Slot label;
- presentation styling moved to a tokenized CSS Module compiled into the existing Client factory with DSH-owned style tags;
- the Client loader still has only React as a synchronous module-table external;
- Host Remote, Typert descriptors, profile state, and mutation behavior are unchanged.

The package-owned StoreHandle bridge is directly assignability-checked against the published primary Client contracts. Its `subscribe()` notification semantics are also executed by the retained same-artifact runtime matrix.

## Evidence before closeout

CI run #514 on implementation head `50d21289eb00a2c9916beda21f05f9763f865c41` completed successfully before this documentation closeout.

Evidence includes:

- Linux and Windows verify lanes on Node 22/24;
- primary published Client declaration contracts on `0.1.5-rc.1`, `0.1.5-rc.2`, and `0.1.6-alpha.2`;
- one oldest-built package/Client artifact;
- that exact Client artifact executed against published SlotCore on `0.1.1-rc.2`, `0.1.2-rc.1`, `0.1.5-rc.1`, `0.1.5-rc.2`, and `0.1.6-alpha.2`;
- the retained five-generation Remote matrix;
- packed bundle/file/peer checks;
- published DSH composition smoke on `0.1.2-rc.1`, `0.1.5-rc.1`, `0.1.5-rc.2`, and `0.1.6-alpha.2`.

Because this closeout changes the PR head, the final-review gate still requires the new exact documentation head to be green before Ready/Merge.
