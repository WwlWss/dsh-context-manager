# M7B0 — Client contract cleanup

**Status:** implementation complete on PR #25; focused closeout fixes landed and the final exact-head CI is the remaining merge gate.

M7B0 is a presentation-contract cleanup slice. It keeps the M7A loader ABI, generated Remote mount, additive Slot ids/order, Drawer open/close behavior, and same-artifact compatibility while removing the transitional Client architecture debt recorded after M7A.

## Scope

M7B0 owns only shared presentation state, localization, styling, and retained Client contract evidence.

It does **not** call `protocol()`, `changes()`, `profiles()`, `presets()`, or any mutation Remote. It does not add profile selection, loading/error business state, polling, hydration, diagnostics, or profile CRUD. Those remain M7B1/M7B2/M7C work.

## Retained compatibility target

Client minimum and primary published contract target:

- `0.1.2-rc.1` — minimum Client generation for the DSH-owned `dsh-client-store` engine;
- `0.1.5-rc.1`;
- `0.1.5-rc.2`;
- `0.1.6-alpha.2`.

`0.1.1-rc.2` remains a supported **Host** regression line. M7 additionally keeps a same-artifact `SlotCore` ABI regression against 0.1.1, but that regression does not lower the M7 Client minimum below 0.1.2.

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

The implementation package moved from `dsh-client-runtime` on 0.1.1 to the standalone `dsh-client-store` on 0.1.2+. M7B0 therefore sets the Client minimum to `0.1.2-rc.1` and uses the published `defineStore` implementation directly. Context Manager owns only the `{ open }` store specification and its actions; it does not implement a snapshot/store engine.

DSH continues to own store creation semantics, subscriptions, hook synthesis, and renderer instance lifecycle. The 0.1.1 line remains a Host compatibility target and a narrow same-artifact SlotCore regression only.

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
- Trigger and Drawer share one DSH `defineStore` StoreHandle for the root presentation state;
- components consume the renderer-provided `useStore` / `actions` seats and contain no subscription machinery;
- whole-controller injection was removed;
- product copy moved to one zh/en locale dictionary with a locale-following Slot label;
- presentation styling moved to a tokenized CSS Module compiled into the existing Client factory with DSH-owned style tags;
- the Client loader still has only React as a synchronous module-table external;
- Host Remote, Typert descriptors, profile state, and mutation behavior are unchanged.

The production Trigger/Drawer props are compiled through upstream `ComposedProps<...>` (including owner/runtime, Store, and Locale shares), while the production `slots` face is derived from `Pick<SlotRegistry, 'inject' | 'register'>`. The primary matrix installs the real `dsh-client-store`, `dsh-client-locale`, layout, sidebar, and Slot packages for every supported Client generation.

## Evidence and closeout gate

The source-level review baseline was CI #519 on `0acc111138571227a1f13381f53d5f4f75477030`. That green run established the pre-fix baseline but did not cover the P2/P3 architecture gaps addressed by this cleanup.

The corrected closeout evidence is intentionally **not pinned to a historical run number in this document**. The authoritative gate is the GitHub Actions run attached to the final PR exact head after these source, lockfile, lifecycle-test, CI-matrix, and documentation changes. Ready/Merge requires that exact-head run to be green.

The final matrix includes:

- Linux and Windows verify lanes on Node 22/24;
- primary published Client declaration contracts on `0.1.2-rc.1`, `0.1.5-rc.1`, `0.1.5-rc.2`, and `0.1.6-alpha.2`;
- real published `dsh-client-store` and `dsh-client-locale` packages in the primary Client contract lane;
- one built Client artifact exercised against published SlotCore on `0.1.1-rc.2`, `0.1.2-rc.1`, `0.1.5-rc.1`, `0.1.5-rc.2`, and `0.1.6-alpha.2`;
- declaration collapse/redeclare coverage through the real published `SlotRegistry`, including shared root-instance caching, last-holder release, and fresh instance resolution after redeclare;
- the retained five-generation Remote matrix;
- packed bundle/file/peer checks and published DSH composition smoke.
