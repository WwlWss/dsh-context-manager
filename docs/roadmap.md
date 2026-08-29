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
- durable old-history-to-summary replacement using DSH Session Surface semantics;
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

**Status:** PR #2, final review.

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

**Exit criteria:**

- latest head green on all CI lanes;
- no unresolved merge blocker in source review;
- unrelated edits preserve unknown stored data;
- uninstall leaves stock DSH unchanged.

---

## Milestone 3 — Native AgentPreset discovery and runtime identity

Goal: connect stored preset references to DSH's native preset domain without changing composition yet.

Host work:

- add a narrow AgentPreset adapter using the public `ctx.agentPresets` service;
- list native preset ids and metadata;
- read a preset's public structural representation where available;
- distinguish configured preset id from resolved/effective preset id;
- add runtime diagnostics for missing/unavailable preset references;
- expose capability state when `agentPresets` is absent.

UI-independent output should be a runtime snapshot such as:

```text
configuredBasePreset = "foo"
resolvedBasePreset = undefined
status = missing
```

No fallback to `standard`.

Authoring:

- shipped presets remain locked;
- if native DSH copy/create APIs are available and tested, expose an explicit "copy as user preset" Host operation;
- never rewrite a shipped preset in place.

Lifecycle tests:

- cold agent creation;
- resumed session preset identity;
- missing preset;
- preset service detach/reload if the public service supports it;
- session whose durable preset identity differs from newly configured profile intent.

**Do not yet:** hot-switch the base preset of an already-running session unless DSH explicitly supports it.

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

- use additive `shell.overlay` for the main right-side Drawer;
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

Goal: support policies such as:

> Keep the most recent N completed conversation turns as full body text; replace older completed history with summary content extracted from `<summary>` blocks.

DSH foundation:

- append-only SessionEvent log remains truth;
- model-visible history comes from the derived Surface;
- `SurfaceOp.replace` is the durable replacement primitive;
- built-in compaction demonstrates transaction/locking/edge validation patterns.

### 12A. Define "floor" precisely

Do not count raw surface nodes. A user-facing floor should normally map to a completed DSH turn, because one turn can contain multiple assistant steps and tool call/result nodes.

Policy must define behavior for:

- interrupted turns;
- tool-heavy turns;
- synthetic/injected user messages;
- existing compaction checkpoint nodes;
- assistant output without a valid summary tag;
- several summary tags;
- malformed/unclosed tags.

The editor should let the user choose semantics where reasonable; it must not guess by silently discarding content.

### 12B. Extract versus generate

Two distinct modes should remain possible:

**Extracted summary** — use summary text the agent already emitted, e.g. `<summary>...</summary>`.

**Generated summary** — ask a model to summarize a selected range.

Do not conflate them. Extracted summary has no extra model call and can exactly follow a user's preset protocol. Generated summary belongs closer to compaction semantics and has routing/token/cancellation concerns.

### 12C. Commit safely

A history transform must:

- serialize against active agent work, preferably through the public maintenance/lifecycle seam;
- re-read the Surface just before commit;
- choose an inclusive replacement range by actual visible surface positions/seqs;
- preserve tool call/result balance;
- cite complete source event seqs required by the Surface contract;
- coordinate with built-in compaction so overlapping replacements cannot race;
- append, never rewrite/delete old events;
- survive persistence, replay, and resume with identical derived Surface.

Whether this becomes its own provider/service or composes with `ctx.compaction` should be decided by semantic fit, not code reuse alone. The existing compaction provider owns summarization and compaction transaction semantics; a deterministic user-authored extract-and-replace pipeline may deserve its own narrow engine while reusing public balancing helpers where allowed.

### 12D. Preview and undo

Before committing a replacement, the UI should eventually be able to preview:

```text
shadowed surface range
replacement summary
source event ids
estimated model-visible reduction
```

"Undo" cannot mean mutating the old log back into existence—it already exists. A reversible product operation must be designed as another valid Surface transition or a session fork/reconstruction mechanism supported by DSH. Do not advertise undo until this is worked out.

---

## Milestone 13 — Display regex / presentation transforms

Goal: let the user transform how messages look without changing model history.

Primary example:

```xml
<body text>
<summary>...</summary>
```

may render as:

```text
<body text>
▶ Summary
```

with the disclosure content collapsed by default.

Rules:

- source Session message remains unchanged;
- display transforms run only in Client presentation;
- never reuse a display transform as a model-history transform implicitly;
- stock DSH Markdown remains untrusted and raw HTML-disabled;
- do not patch the stock keyed assistant renderer.

Initial route: an additive Context Manager enhanced `conversation.view` that can render the same session with additional presentation behavior while stock Chat remains available.

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

1. Verify the public seam on the published supported DSH line.
2. Inspect the current source-forward line for impending semantic changes.
3. Do not broaden peer ranges until an installable version is actually tested.
4. Put DSH-version differences behind narrow adapters only where a real difference exists.
5. Never reach into package-private state merely to preserve an old feature promise.
6. If DSH removes the capability, expose a capability diagnostic and keep stored user intent intact.

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
  Surface replacement history
  session-owned bindings only when a public session persistence seam supports them
```

Do not introduce project/session persistence by stuffing additional pseudo-scopes into the global Settings namespace.

---

## Cross-cutting performance budget

As scale increases, protect these paths:

**Settings snapshot path** — metadata only; no large body reads or tokenization.

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
- supported DSH versions are tested;
- the UI shows capability limitations honestly;
- uninstall returns the affected DSH behavior to stock operation.

That definition should remain the project's primary defense against accumulating controls that only look powerful but do not correspond to real runtime behavior.
