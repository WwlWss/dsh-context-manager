# Context Manager Roadmap

This roadmap turns the architectural goals in [architecture.md](architecture.md) into an implementation sequence. It is intentionally capability-first: a UI milestone may expose only behavior that the Host/runtime layer can already implement and test against a public DeepSeek Harness seam.

The roadmap is directional rather than a promise of exact PR numbers. If DSH changes a public contract, update [compatibility.md](compatibility.md) and adjust the implementation milestone rather than preserving an obsolete design for the sake of numbering.

## Product target

Context Manager should eventually provide a SillyTavern-style advanced context workspace for DSH while remaining additive to the native Harness runtime.

The end-state includes:

- reusable context profiles built on native DSH AgentPresets;
- modular prompt/context resources with explicit placement and ordering;
- a LoreBook-like skill/resource manager with Pinned / Auto / Manual / Off policy;
- diagnostics and a final-context preview;
- project/session bindings and overrides without rewriting shipped presets;
- regex/transform pipelines separated by model-facing versus display-only semantics;
- durable user-authored old-history replacement/shadowing using DSH Session Surface semantics where the current public lifecycle seam permits it;
- an enhanced conversation view capable of summary disclosure and rich helper rendering;
- isolated HTML/CSS/JavaScript helper execution with an explicit bridge back to allowed DSH operations;
- import/export and advanced stored-payload editing without silent normalization.

## Guiding dependency order

Build from the inside out:

```text
Persistence / Domain
        ↓
Native capability discovery
        ↓
Runtime adapters
        ↓
Remote contracts
        ↓
Client state
        ↓
UI and rich presentation
```

Never reverse this order by creating a UI promise first and inventing runtime semantics afterward.

---

## Milestone 1 — Installable plugin foundation

**Status:** complete.

Delivered:

- installable DSH bundle patch;
- standalone TypeScript build;
- git-install `prepare` path;
- package-contract tests;
- Node 22/24 Windows/Linux CI;
- packed-artifact verification;
- published DSH CLI composition smoke test.

Exit criterion was simply: the plugin can be installed/uninstalled without changing stock DSH behavior.

---

## Milestone 2 — Settings-backed Host profile Domain

**Status:** complete in merged PR #2.

Purpose: establish persistence semantics before any model behavior changes.

Domain:

- reusable profile library;
- optional default profile reference;
- `ContextProfile` parsed view;
- extensible object-shaped `SkillBinding` with `mode`;
- Stored -> Domain -> future Runtime separation;
- malformed-resource diagnostics;
- detached advanced payload reads/writes;
- explicit whole-binding deletion;
- forward-compatible unknown-field preservation.

Persistence:

- native DSH Settings namespace;
- optional Settings capability attachment;
- revision-fenced semantic writes;
- path-local structural guards;
- last-good/raw-user protection;
- explicit schema-version compatibility;
- current DSH `__proto__` / `undefined` losslessness boundary.

This milestone remains model-inert. A persisted `basePreset`, skill mode, or future-looking unknown field has no runtime effect yet.

Exit criteria were met before merge:

- latest PR2 head green on all CI lanes;
- no unresolved merge blocker in source review;
- unrelated edits preserve unknown stored data;
- uninstall leaves stock DSH unchanged.

---

## Milestone 3 — Native AgentPreset discovery and runtime identity

Goal: connect stored preset references to DSH's native preset domain without changing composition, while keeping roster/configured resolution separate from live Session identity.

The Settings compatibility prerequisite was completed in merged PR #3. The compatibility matrix now retains the legacy `0.1.1-rc.2` generation, the prior-modern `0.1.2-rc.1` generation, and the latest installable `0.1.5-rc.1` generation. Source-forward review follows current official `master` separately from install-tested npm claims; see [compatibility.md](compatibility.md).

### 3A — Native roster and configured -> resolved state

**Status:** complete in merged PR #4.

Delivered Host work:

- a narrow AgentPreset adapter using the optional public `ctx.agentPresets` Host service;
- native preset ids and metadata;
- only the minimum public structural representation actually needed by Context Manager;
- configured preset id kept distinct from roster resolution;
- runtime diagnostics for missing/broken/unavailable preset references;
- explicit capability state when `agentPresets` is absent;
- one native roster snapshot per aggregate Context Manager resolution pass rather than one scan per profile;
- path-free Context Manager DTOs detached from DSH-native mutable/private representation;
- minimum Host-contract runtime validation while ignoring unrelated future fields;
- package-root exposure limited to stable read-model types plus the Host service, with adapter helpers kept internal.

UI-independent output distinguishes facts such as:

```text
basePreset.configuredId = "foo"
basePreset.status = "missing"
```

There is no fallback to `standard`.

The roster integration remains read-only/model-inert. It does not mount, recompose, or hot-switch an AgentPreset. Native roster discovery is intentionally unmemoized upstream; the M3A aggregate snapshot is therefore a control-plane read, not a render-frame or request-hot-path getter.

### 3B — Effective live Session preset identity

**Status:** in development in PR #5.

Purpose: add a Session-scoped read model for what a **currently live DSH Session records**, without creating a profile-to-Session binding and without taking over DSH Session lifecycle.

Required distinction remains:

```text
configured = what the Context Profile says
resolved   = whether that reference exists/is healthy now
effective  = what the live Session records as its AgentPreset identity
```

The implementation boundary is deliberately narrower than an independent persistent-session reader:

- use `ctx.sessions.get(sessionId)` only to find an already-published live Session;
- prefer native `ctx.sessionProjections.stateOf(session, 'agentPreset')` on modern DSH;
- fall back to the public Session event representation only when the `agentPreset` projection key is genuinely absent;
- on the legacy line, newest `agent-preset/selected` wins over immutable creation-time `header.agentPreset`;
- return `not-live` when the id is not in the live SessionStore rather than claiming the persisted identity does not exist;
- keep `presetId` exact as `string | null`, with no normalization, roster health rewrite, or native-default substitution;
- keep this read model separate from M3A's profile/roster aggregate service.

Lifecycle/compatibility tests cover:

- no SessionStore capability;
- a requested id that is not currently live;
- native projection identity, including `null`;
- legacy and modern log fallback paths;
- newest selection winning over the creation header;
- malformed present Host capabilities failing loud;
- optional capability attach/detach without stale caching;
- exact identity surviving independently from current profile intent or roster/default state;
- actual published DSH Session objects on `0.1.1-rc.2`, `0.1.2-rc.1`, and `0.1.5-rc.1`;
- actual modern `agentPresetProjectionDefinition` + `SessionProjectionRegistry` execution.

M3B deliberately does **not** consume `SessionPersistence`, `SessionHandle`, or cold-session query APIs. DSH owns creation, resume, persistence, locking, and composition. A Session resumed by DSH becomes a normal live Session and is then observable through the same M3B read path. If a later product surface needs independent cold-archive inspection, design that capability against the then-current Session Query/persistence seam rather than extending M3B downward.

M3B also does not call `list()`, `resolve()`, `mount()`, `recompose()`, `select()`, or otherwise affect AgentPreset composition. The current native `composedPreset(agent.ctx)` observation is useful as a settled-state lifecycle test oracle, but it is not a second public M3B field because live composition can transiently lead the durable selection record during a successful blank-session switch transaction.

**Do not yet:** add profile ↔ Session bindings, expose Remote/UI contracts, inspect cold archives, or hot-switch an already-running conversation as a Context Manager operation.

### 3C — Optional native preset authoring

Keep authoring separate from discovery/identity unless the implementation remains trivially small.

- shipped presets remain locked;
- if native DSH copy/create APIs are available and tested, expose an explicit "copy as user preset" Host operation;
- never rewrite a shipped preset in place;
- do not infer editability only from `trust`; use the public authoring capability/operation contract.

---

## Milestone 4 — Prompt and runtime-context resource model

Goal: introduce real modular prompt resources and placement without building the Web editor yet.

### 4A. Content library seam

Large content should not live directly inside the Settings profile namespace.

Introduce a content-library abstraction for resources such as:

```text
prompts/
skill overrides or authored skill resources/
transforms/
renderers/
helper scripts/
```

Settings stores references and small binding metadata; the library stores bodies.

Requirements:

- stable resource ids separate from display names;
- explicit create/replace/delete operations;
- lossless text storage;
- version/revision strategy appropriate to the backend;
- no implicit deletion of dangling profile references;
- provider abstraction if storage may later vary.

Do not over-generalize before at least prompt and transform resources reveal the common shape.

### 4B. PromptBinding

Introduce object-shaped bindings from the beginning, for example conceptually:

```ts
interface PromptBinding {
  enabled: boolean
  placement: PromptPlacement
  order: number
}
```

Unknown siblings must survive narrow edits.

### 4C. DSH system-prompt adapter

Use public `ctx.systemPrompt` section/context registration.

Implement finite stable Context Manager anchors, for example:

```text
before-persona
after-persona
before-tools
after-tools
runtime-context
```

The exact mapping must be derived from the supported DSH section/order contract, not copied from SillyTavern names.

Runtime output must report insertion capability and actual effective order.

Special-case capability diagnostics are required for native compositions such as Minimal where complete persona/runtime-context suppression prevents the requested placement.

Tests:

- all shipped native presets;
- stable local ordering;
- enable/disable lifecycle;
- unload/HMR cleanup;
- cold/resume behavior;
- no modification of native preset files.

---

## Milestone 5 — Skill policy runtime

Goal: make Pinned / Auto / Manual / Off real.

### Pinned

Pinned skill instructions are deliberately injected as Context Manager-owned prompt/context content. They must not rely on pretending native discovery itself means pinned full instructions.

### Auto

Preserve native model discovery + user invocation.

### Manual

User-invocable but absent from model-facing discovery.

### Off

Absent from both managed model discovery and managed user invocation.

Preferred implementation:

- scoped overlay/shadow policy over native `ctx.skills`;
- preserve original providers and stock behavior outside the managed agent/session scope;
- never rewrite skill source files merely to change a profile binding.

Before shipping hard policy claims, test:

- same-name global/preset/agent registrations;
- provider invalidation;
- live agent creation and disposal;
- resumed sessions;
- native tool-skill invocation paths;
- explicit user invocation paths;
- leakage from farther scopes.

If the supported DSH version cannot faithfully hide a farther registration, mark that runtime capability unavailable instead of presenting a fake Off switch.

---

## Milestone 6 — Host Remote API

Goal: create a stable browser boundary before writing substantial UI.

Remote surface should expose JSON-compatible Domain/runtime views and explicit mutations, not Host service objects.

Likely groups:

```text
profiles
resources
runtime diagnostics
preset directory
effective preview
```

Requirements:

- all reads intended for browser transport obey DSH secret-redaction rules;
- writes carry the revision/state token required for stale-write rejection;
- machine-readable error codes map cleanly to user presentation;
- no browser-selected arbitrary Host filesystem paths;
- subscriptions/events use pull-on-change semantics where possible: notification says "state changed", client re-reads an authoritative snapshot.

Avoid creating a second browser-side source of truth.

---

## Milestone 7 — Web client foundation and Context Manager Drawer

Goal: install the browser face safely before complex editors.

Packaging:

- add `./client` export;
- add `dsh.client` manifest only when the built artifact exists;
- extend package-contract tests to verify the exact client artifact;
- keep Host and Client bundles separated.

UI composition:

- use an additive shell surface available in the supported DSH client contract for the main Context Manager Drawer;
- add a trigger through an additive list slot where the current DSH shell exposes one;
- never replace the single-occupant stock `details` subtree;
- keep a root-safe entry only if product access is needed outside an active Session.

Client architecture:

- follow upstream Slot shares and store rules;
- `ctx` remains in `apply`/inject closures;
- components receive plain data/callbacks;
- shared interaction state goes into declared stores only when it genuinely must survive/remount across entries;
- Session/Workspace business objects remain in the DSH client object layer.

First UI should be intentionally boring: profile list, selection, diagnostics, and CRUD. Rich editors come after the transport/lifecycle proves stable.

---

## Milestone 8 — Preset / Prompt / Skill editor and effective-context preview

Goal: make the core Context Manager useful without yet adding regex/helper complexity.

Features:

- profile editor;
- locked native preset view;
- prompt resource browser/editor;
- drag ordering inside supported anchors;
- skill policy editor;
- diagnostics panel;
- advanced stored-payload editor;
- effective-context preview.

Preview rules:

- clearly distinguish configured from effective state;
- show unresolved resources without fallback;
- show prompt sections in actual runtime order;
- show why a requested insertion is suppressed or unavailable;
- eventually show token estimates only through a dedicated tokenization/measurement capability, not inside ordinary Settings normalization.

Do not present preview as authoritative unless it uses the same runtime adapter resolution as the real agent path.

---

## Milestone 9 — Project and Session bindings

Goal: allow one reusable profile to be selected/overridden per project/workspace/session without pretending DSH Settings itself has a Global -> Project -> Session hierarchy.

First decide the owning DSH persistence scope for each binding.

Potential model:

```text
Global profile library      → Settings
Workspace/project binding   → workspace-owned persistence
Session binding             → session-owned durable metadata/event or another public DSH session seam
Runtime effective overlay   → agent/session scope
```

Do not store fake project/session inheritance inside the global Settings namespace simply because it is convenient.

Define explicit inheritance semantics only after all participating persistence scopes are known.

Tests must include:

- session create/resume;
- workspace switch;
- deleted/missing referenced profile;
- profile edited while an existing session is running;
- immutable native base-preset identity versus live overlay changes.

---

## Milestone 10 — Transform resource model

Goal: add regex/transform resources while keeping model-facing and presentation-only behavior separated.

Do not define one universal "regex rule" with a checkbox matrix that can arbitrarily act at every layer. Define a common resource shell only where genuinely shared, while execution types remain explicit.

Suggested conceptual resource kinds:

```text
prompt-transform
history-transform
display-transform
renderer-helper
```

Common metadata may eventually include:

```text
id
name
enabled binding/order
description
```

Execution-specific fields belong to their own typed specs.

A profile should bind transforms using object-shaped bindings so future conditions/order/scope metadata can grow without migration.

---

## Milestone 11 — Prompt/source regex transforms

Goal: transform Context Manager-owned source before prompt contribution.

Examples:

- regex replace in one prompt resource;
- remove markup intended only for human editing;
- extract a structured segment into another Context Manager-owned contribution.

Rules:

- source transforms operate on Context Manager resources, not the durable Session transcript;
- deterministic ordered pipeline;
- each transform can be enabled/reordered explicitly;
- preview can show before/after;
- failure diagnostics do not silently disable unrelated transforms unless the runtime contract requires the entire pipeline to fail.

Regex execution needs a performance strategy before arbitrary user expressions are accepted in a request hot path. Consider worker/process isolation or an engine with enforceable limits if native JavaScript regex cannot provide acceptable responsiveness guarantees.

---

## Milestone 12 — Durable history-Surface transforms

Goal: provide **generic user-authored** model-visible history transformation/replacement capability using the public DSH Session/Surface lifecycle available at implementation time.

A representative preset-authored use case is:

> The preset instructs the model to emit a compact tagged representation for each reply; after a user-selected age/turn threshold, a history transform shadows the old full body with that extracted representation while newer history stays full.

`<summary>...</summary>` is only one possible protocol. Context Manager core must not privilege it. A preset author could instead use `<memory>`, custom delimiters, a selected paragraph, diff-only retention, dialogue-only retention, or another deterministic extraction/replacement rule.

DSH foundation currently observed in source:

- append-only SessionEvent log remains truth;
- model-visible history comes from the derived Surface;
- `SurfaceOp.replace` remains the low-level durable replacement primitive;
- built-in compaction demonstrates current transaction/locking/edge-validation behavior.

These facts are architecture evidence, not yet a verified arbitrary-plugin history-transform extension seam. Before Milestone 12 implementation, re-check the exact public SessionHandle/maintenance/locking APIs on every supported DSH line.

### 12A. Generic policy primitives

The core Domain should describe generic operations rather than `SmallSummary`, `SummaryTag`, or a built-in 20-turn rule.

Conceptually the authorable policy needs separate answers for:

```text
selector   → which model-visible historical units are candidates
trigger    → when the rule becomes eligible
extractor  → how replacement content is derived
replacement→ how the derived content shadows/replaces the selected range
```

Regex/tag extraction may be one extractor implementation, not the architecture itself.

The editor should preserve explicit user choices and diagnose cases it cannot represent. It must not silently pick a fallback threshold, tag, or summary behavior.

### 12B. Define conversation units precisely

Do not count raw surface nodes as if they were always user-facing floors. One completed DSH turn can contain multiple assistant steps and tool call/result nodes.

Any selector that uses turns/floors must define behavior for:

- interrupted turns;
- tool-heavy turns;
- synthetic/injected user messages;
- existing compaction checkpoint nodes;
- source text that does not satisfy the configured extractor;
- several matches;
- malformed/unclosed configured delimiters when the extractor uses them.

### 12C. Extract versus generate

Two different transform capabilities may eventually exist:

**Extracted replacement** — deterministically derive replacement text from content the conversation already contains. This is the representative preset-authored small-summary workflow and requires no additional model call.

**Generated replacement** — ask a model to derive replacement text for a selected range. This has routing/token/cancellation semantics much closer to compaction and must remain a separate execution type if implemented.

Do not conflate them and do not make generated summaries the default hidden behavior of an extraction rule.

### 12D. Commit safely

A history transform must:

- serialize against active agent work through the current public lifecycle/maintenance seam;
- re-read the Surface just before commit;
- choose a valid replacement range using current visible seqs/positions rather than stale array indexes;
- preserve tool call/result balance and other protocol invariants;
- account for all source events required by the current Surface contract;
- coordinate with built-in compaction so overlapping replacements cannot race;
- append a valid transition rather than rewriting/deleting retained source events;
- survive persistence, migration, replay, and resume with identical derived Surface.

Whether this becomes its own provider/service or composes with a DSH compaction service should be decided by semantic fit, not code reuse alone. Native compaction is a DSH-owned coarse summarization policy; Context Manager's purpose is to execute user-authored transformation policy, not to relabel compaction as an editor feature.

### 12E. Preview and undo

Before committing a replacement, the UI should eventually be able to preview:

```text
selected/shadowed Surface range
configured extractor result
source event ids/provenance
estimated model-visible reduction
```

"Undo" cannot mean mutating the old log back into existence—it already exists. A reversible product operation must be designed as another valid Surface transition or a session fork/reconstruction mechanism supported by DSH. Do not advertise undo until this is worked out.

Native DSH compaction may still act later as a coarse context-window fallback. That coexistence is useful, but it remains distinct from the user-authored Context Manager transform.

---

## Milestone 13 — Display regex / presentation transforms

Goal: let the user transform how messages look without changing model history.

A representative user-authored tagged region such as:

```xml
<body text>
<summary>...</summary>
```

may be configured to render as:

```text
<body text>
▶ Summary
```

with disclosure content collapsed by default. The tag name and extraction semantics belong to the user's display-transform resource; Context Manager core does not reserve `<summary>`.

Rules:

- source Session message remains unchanged;
- display transforms run only in Client presentation;
- never reuse a display transform as a model-history transform implicitly;
- stock DSH Markdown remains untrusted and raw HTML-disabled;
- do not patch the stock keyed assistant renderer.

Initial route: use an additive public conversation presentation surface available in the then-supported DSH client version, while stock Chat remains available.

If a later DSH release exposes a narrower public assistant-presentation transform slot, reevaluate and prefer the narrower seam behind a compatibility adapter.

Performance:

- projection should be incremental and should not rescan the full event log each React render;
- expensive regex should not block the parent UI indefinitely;
- transformed presentation results should be cacheable by stable message/revision identity.

---

## Milestone 14 — Tavern-style renderer/helper runtime

Goal: render user-enabled rich HTML/CSS/JavaScript artifacts derived from message content or transform output.

### Isolation first

Do not execute model/user helper JavaScript with ambient DSH page authority.

Initial architecture should be approximately:

```text
Enhanced Conversation View
        ↓
Renderer selection
        ↓
Sandbox runtime
(iframe / Worker-based design)
        ↓
postMessage-style capability bridge
        ↓
explicit Context Manager client actions
```

Default sandbox must not receive:

- parent DOM access;
- arbitrary DSH Cordis `ctx`;
- raw Remote service objects;
- credentials/secrets;
- unrestricted same-origin access.

The sandbox may still run arbitrary user-authored HTML/CSS/JS inside its declared environment. Isolation protects the Host application; it is not a content filter.

### Capability bridge

Potential opt-in bridge actions may later include:

```text
resize/request-layout
copy text
emit a user-approved prompt draft
request a named attachment/resource
send a narrowly defined Context Manager action
```

Every bridge capability needs an explicit JSON wire contract. Do not expose `window`, `ctx`, or a generic "call any Remote" escape hatch.

### Resource model

Large helper HTML/CSS/JS bodies belong in the content library. Profile Settings stores renderer/helper bindings, enabled/order state, and references.

### Failure isolation

A broken helper should not crash stock Chat or the whole Context Manager client plugin. Renderer failures should fall back to a safe textual/raw representation and report diagnostics.

---

## Milestone 15 — Import/export and ecosystem compatibility

Goal: make Context Manager resources portable without locking the internal Domain to SillyTavern's file formats.

Use adapters:

```text
SillyTavern import
        ↓
Import model / diagnostics
        ↓ explicit conversion
Context Manager resources
        ↓
optional exporter
```

Do not make SillyTavern JSON the canonical internal schema.

Import should preserve unsupported fields where feasible or report them explicitly. Never silently reinterpret semantics that DSH cannot represent.

Potential import families:

- presets/prompt modules;
- LoreBook-like entries/skills where a faithful mapping exists;
- regex rules split into the correct Context Manager transform family;
- helper scripts/resources.

Compatibility adapters should be versioned/tested against sample fixtures.

---

## Milestone 16 — Advanced authoring and inspection

Possible features after the runtime foundations are stable:

- raw/stored resource editor;
- diff between Stored / Domain / Effective state;
- graph view of profile/resource references;
- context/token budget inspector;
- per-module token contribution;
- Surface/history preview;
- profile cloning/branching;
- searchable resource library;
- explicit repair/conversion actions for malformed stored resources;
- export snapshots for debugging.

Keep all repair operations explicit. A diagnostic may offer a button, but the button is the mutation—not the diagnostic itself.

---

## Cross-cutting compatibility strategy

For every milestone:

1. Verify the public seam on the minimum/legacy supported DSH line where applicable.
2. Execute the same production compatibility branch against the latest installable DSH package generation.
3. Inspect the current source-forward line for impending semantic changes.
4. Do not broaden peer ranges until an installable version is actually tested.
5. Put DSH-version differences behind narrow adapters only where a real difference exists.
6. If an adapter branches at runtime, add a focused test that actually executes every supported branch; package/config composition smoke is not a substitute.
7. Never reach into package-private state merely to preserve an old feature promise.
8. If DSH removes the capability, expose a capability diagnostic and keep stored user intent intact.

The project should be able to upgrade DSH by replacing a small adapter, not rewriting the Domain or migrating every profile.

---

## Cross-cutting storage strategy

Settings is for small configuration state, not all project content.

Long-term split:

```text
DSH Settings
  profile metadata
  binding metadata
  references
  order / enable state

Context Manager content library
  prompt bodies
  regex bodies
  helper HTML/CSS/JS
  other large authored resources

DSH Session persistence
  durable conversation events
  model-visible Surface replacement/shadow history
  session-owned bindings only when a public session persistence seam supports them
```

Do not introduce project/session persistence by stuffing additional pseudo-scopes into the global Settings namespace.

---

## Cross-cutting performance budget

As scale increases, protect these paths:

**Settings snapshot path** — metadata only; no large body reads or tokenization.

**AgentPreset roster snapshot path** — control-plane only. Native `list()` intentionally re-reads preset roots and health, so aggregate preset snapshots must not be polled per render frame, token, Session event, or request hot path. Prefer explicit refresh or pull-on-change once a reliable invalidation signal exists.

**Agent request path** — resolve only the effective profile/resources for that agent; avoid whole-library scans.

**Session transform path** — operate on DSH's current derived Surface and explicit turn indexes; do not repeatedly rebuild the entire event log unnecessarily.

**Client render path** — incremental conversation projection; no whole-session scan every React render.

**Regex/helper execution** — isolate work capable of pathological CPU use from the parent UI/request loop where practical.

Performance optimization should follow measured pressure, but architecture must avoid placing obviously expensive work on hot paths by construction.

---

## Definition of done for a capability

A Context Manager feature is not complete merely because a setting and UI exist. It is complete only when:

- stored semantics are defined;
- Domain parsing/diagnostics are defined;
- runtime behavior is wired to a public DSH seam;
- configured and effective state can be distinguished;
- lifecycle/unload behavior is tested;
- malformed/missing resources fail in isolation where intended;
- unknown unrelated user data survives narrow edits;
- concurrency behavior is defined;
- every supported DSH compatibility branch used by that capability is actually executed in tests;
- the UI shows capability limitations honestly;
- uninstall returns the affected DSH behavior to stock operation.

That definition should remain the project's primary defense against accumulating controls that only look powerful but do not correspond to real runtime behavior.
