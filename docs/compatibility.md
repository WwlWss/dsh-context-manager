# DSH compatibility

DeepSeek Harness evolves quickly. Context Manager separates **installable/tested package compatibility** from **source-forward review against the latest official repository** so the plugin can follow upstream architecture without pretending an unpublished package is already runnable in CI.

## Current compatibility matrix

| Track | DSH reference | How it is used |
| --- | --- | --- |
| Legacy Settings regression | `dsh-v0.1.1-rc.2` | The committed development dependency set. The full type/build/Domain suite exercises the legacy module-level `installSettingsSection(...)` API generation. AgentPreset source review and a focused published-package type-contract lane verify the M3A Host intersection `defaultId` / `authorable` / `list()` here. |
| Latest installable Settings/runtime | `dsh-v0.1.2-rc.1` | A dedicated CI lane replaces only the ephemeral test workspace's DSH-facing dependencies with the versions shipped by this DSH line and reruns the full type/build/Domain suite, exercising `settings.installSection(...)`. The bundle smoke also installs/composes the plugin with the published `@deepseek-ai/dsh@0.1.2-rc.1` CLI. A separate AgentPreset contract lane compiles against the published `@deepseek-ai/dsh-agent-presets@0.1.2-rc.1`; this line also publishes the path-free native AgentPreset roster DTO. |
| Latest official repository | `dsh-v0.1.3-alpha.1` / `d347e703...` | Source-forward architecture target. The GitHub release and repository carry this version, but the umbrella `@deepseek-ai/dsh@0.1.3-alpha.1` package is not currently available from npm, so this line is reviewed from official source rather than claimed as install-tested. |

Support claims must name what was actually tested. A GitHub release/source tree and an installable npm package are deliberately not treated as the same thing.

The `0.1.2-rc.1` DSH source line ships `@deepseek-ai/cordis@4.0.2`, `@deepseek-ai/dsh-settings@0.1.2-rc.1`, and `@deepseek-ai/schemastery@3.18.2`; the current-generation compatibility lane uses those exact versions. The ordinary development lockfile remains on the legacy generation so both public Settings API shapes stay visible instead of silently moving the minimum test baseline.

## Settings compatibility rule

Context Manager owns the `dsh-context-manager` Settings namespace and never reads or writes DSH settings files directly.

The Settings public surface changed between the legacy and current lines:

- `0.1.1-rc.2` exported `settingsNamespace()` and a module-level `installSettingsSection()` helper.
- `0.1.2-rc.1+` validates namespace strings in the Settings service and exposes the optional-consumer lifecycle as `settings.installSection(owner, ns, schema, entry, hooks)`.
- the latest official `0.1.3-alpha.1` source still uses the `settings.installSection(...)` shape.

`src/adapters/settings.ts` owns the narrow version seam:

1. if the legacy module-level `installSettingsSection(...)` export exists, delegate to it;
2. otherwise attach to the optional Settings service and require the current `settings.installSection(...)` method;
3. keep the namespace value local and stable instead of importing the removed `settingsNamespace()` helper;
4. never reimplement DSH's detach/unload policy when one of its native public helpers is available;
5. never inspect a fork identity or import DSH implementation internals.

This is a DSH API-generation adapter, not a WwlWss-fork adapter. The same Context Manager package must run unchanged on official DSH and on a patched DSH fork that preserves one of the supported public Settings contracts.

The rest of the PR2 persistence model remains unchanged:

- Settings is authoritative storage;
- descriptor revisions are compare-and-swap fences;
- invalid external edits keep last-good resolved state without being silently repaired;
- semantic writes inspect the exposed raw user section before mutating from last-good state;
- no second Context Manager settings cache is maintained;
- `__proto__` remains rejected at Context Manager's advanced-write/path boundary while upstream Settings still carries its property-safe-construction limitation.

Two Settings limits are intentionally not papered over by Context Manager:

1. namespace write serialization/revision fencing is an in-process guarantee; cross-process convergence remains provider-defined;
2. Context Manager does not reach into provider internals to repair malformed storage or strengthen lifecycle guarantees beyond the public service contract.

## AgentPreset compatibility

Milestone 3A consumes the optional public Host capability exposed as `ctx.agentPresets`. It does **not** import or bundle `@deepseek-ai/dsh-agent-presets` in production.

The reason is compatibility rather than avoidance of the native domain. The stable Host-service intersection needed by M3A is already shared by all reviewed lines:

- `defaultId` — current native default id;
- `authorable` — whether the deployment has a user-authorable preset root;
- `list()` — one unmemoized roster read returning Host rows with `id`, `trust`, optional `name` / `description`, optional `broken`, plus Host-only implementation fields such as the absolute composition `path`.

That intersection exists in `dsh-v0.1.1-rc.2`, remains in the installable `dsh-v0.1.2-rc.1`, and remains in official `dsh-v0.1.3-alpha.1` source. Current source changed the service base class to `TypertRemoteService` and added richer Remote/structural features, but those changes do not alter the M3A Host reads.

The local structural interface in `src/adapters/agent-presets.ts` is intentionally smaller than the native class. It prevents three unnecessary dependencies:

1. the legacy line does not export the newer path-free `AgentPresetRow` type, so importing that DTO would silently raise the baseline;
2. `agentPresets` is an optional composition capability, so absence must yield `unavailable`, not a package-resolution/install failure;
3. Context Manager needs no native constructor, filesystem helpers, Remote client, or mount machinery for read-only roster resolution.

This is still a native-first design: DSH owns discovery, root precedence, health, defaults, and authorability. Context Manager merely consumes the public service result and projects it to its own path-free read model.

### M3A runtime boundary

The structural seam is intentionally loose at package-resolution time but not unchecked at runtime.

- `ctx.get('agentPresets') === undefined` is the only condition mapped to capability `unavailable`.
- A present service must expose `list()`; otherwise M3A fails loud as an unsupported Host API rather than pretending the capability is absent.
- `defaultId` must be a string and `authorable` a boolean.
- `list()` must resolve to an array whose minimum consumed row fields match the supported Host contract: string `id`, `trust` of `system | user`, and optional string `name` / `description` / `broken`.
- Unknown additional service or row fields are ignored. The guard validates the minimum contract only; it does not inspect `path`, `order`, mount state, class identity, DSH version, or fork identity.

A widening of a field whose semantics Context Manager actually consumes, such as a new `trust` category, intentionally fails loud until reviewed. Pure additive metadata does not.

### M3A upstream contract lane

Runtime structural typing by itself would not make TypeScript notice an upstream declaration change. CI therefore has a separate compile-only contract fixture against the published native package versions:

- `@deepseek-ai/dsh-agent-presets@0.1.1-rc.2`;
- `@deepseek-ai/dsh-agent-presets@0.1.2-rc.1`.

The fixture loads the native package's public Cordis module augmentation and derives the consumed capability from `Context['agentPresets']`. It then asserts that this actual Host seam still provides `defaultId`, `authorable`, `list()`, the minimum roster-row shape, and the exact currently supported `trust` union. The check deliberately does not depend on package-root named exports such as `AgentPresets`, `AgentPreset`, or `PresetTrust`, because production does not consume those names. The package is installed only in the disposable CI workspace. It remains absent from Context Manager's committed peer/dev/runtime dependency surface.

This creates a deliberate split:

```text
production runtime: loose package coupling + narrow runtime validation
CI compatibility:   strong compile-time check against supported native packages
```

### M3A rules

- Perform **at most one** native `list()` per aggregate Context Manager preset snapshot.
- Keep no roster cache across snapshots; native discovery is deliberately unmemoized so authored/deleted presets appear on the next read.
- Preserve `profile.basePreset` exactly; never trim, lowercase, rewrite, or replace it with `defaultId`.
- Distinguish `unavailable` (no capability) from `missing` (capability present, id absent) and `broken` (native discovery supplied a reason).
- Project fields explicitly. Never spread the Host `AgentPreset` object, because that would leak absolute `path` and other implementation fields into a future Remote/UI contract.
- `trust` is descriptive provenance, not an invented `editable` / `deletable` policy. Native authoring operations own those decisions.
- Do not call `resolve()` once per profile: it re-enters unmemoized discovery and would turn N profiles into N root scans.
- Do not call `mount()`, `recompose()`, `standingKeyFor()`, or any other composition-affecting API from M3A.
- Do not catch a failing `list()` and label it `unavailable`; only capability absence means unavailable. A present native service that fails discovery must fail loud.
- Treat the aggregate result as an authoritative best-effort observation, not an atomic transaction spanning Settings and the preset filesystem.
- Treat the aggregate snapshot as a control-plane read. Native roster discovery is filesystem-backed and intentionally unmemoized, so future Remote/UI code must not poll it per render frame, token, Session event, or request hot path.
- Keep adapter mechanics private to the package. The root package exports stable read-model types and `ContextManagerPresetDirectory`, not discovery/validation/builder helpers.

The installable `0.1.2-rc.1` and current `0.1.3-alpha.1` source also provide a path-free native Remote roster (`AgentPresetRow` / `AgentPresetRoster`). Current source additionally provides `compositionInventory()`, which can read flattened preset composition without mounting an unmounted preset. Those are strong upstream signals for future work, but M3A deliberately does not depend on them because the legacy baseline does not expose the same contract.

Effective live/durable preset identity is M3B, not M3A. Current DSH exposes `agentPreset: string | null` in Session projection state, while older lines used different Session helpers; keeping that concern separate avoids dragging the 0.1.3 SessionHandle/locking migration into a roster-only feature.

## System prompt and runtime-context guardrails

Future prompt work must continue to use DSH-owned prompt/runtime-context composition rather than replacing the agent loop or rewriting native preset files.

- placement must map to actual public DSH prompt/runtime-context capabilities;
- a restrictive preset such as Minimal must surface unavailable placement honestly rather than simulating success;
- arbitrary SillyTavern numeric historical `depth=N` insertion is not equivalent to system-prompt placement and must not be faked through a different seam;
- any future adapter must be rechecked against the then-current installable and source-forward DSH contracts before it ships.

These are architecture constraints, not claims that prompt overlays are implemented in the current model-inert build.

## Skills guardrails

DSH remains the owner of the native Skill registry/providers. Context Manager's future Pinned / Auto / Manual / Off behavior must be an explicit overlay over public Skill capabilities, not a rewrite of skill files or providers.

Before claiming hard Manual/Off semantics, tests must cover scope precedence, same-name shadowing, provider invalidation, cold/resumed sessions, disposal, and invocation leakage. If the current DSH version cannot faithfully express the requested policy, the capability must be reported unavailable rather than simulated.

These are future-runtime requirements; the current build only persists skill binding intent.

## Session and model-visible Surface boundary

`0.1.2` and the latest `0.1.3-alpha.1` source substantially changed Session APIs:

- eager `Session.events` access moved toward `seq`, `eventAt()`, and `snapshotEvents()`;
- Session persistence is lifecycle-owned through `SessionHandle` in the new source line;
- `agentLoop.create()` became asynchronous there;
- Session format v2 introduced generation migration and durable assistant settlements.

The latest official source still defines model-visible Surface replacement as `SurfaceOp: { op: 'replace', start, end }`, requires the replacing event to account for the shadowed source events, and uses that primitive in built-in compaction. That makes replacement/shadowing a valid architectural foundation, but it does **not** mean Context Manager already has a verified public lifecycle/maintenance hook for arbitrary history transforms.

Therefore future history work must verify the complete current public extension path — Session ownership/locking, maintenance serialization, replacement commit rules, replay/resume, and coexistence with compaction — before implementation. Do not revive an old direct-Session pattern merely because the low-level Surface primitive still exists.

The small-summary pattern is only a representative user-authored preset/use case. Context Manager must provide generic authorable selectors/triggers/extractors/replacements; it must not hard-code `<summary>`, a turn threshold, or summary generation as special Domain semantics.

## Web client and presentation guardrails

Future Web work remains additive to DSH composition:

- advertise a `dsh.client` face only in the PR that actually ships and contract-tests the client artifact;
- do not replace the occupied single `details` surface merely to add Context Manager UI;
- prefer additive public shell/conversation slots when available;
- do not patch the stock keyed assistant renderer;
- display-only transforms must remain separate from model-visible history transforms;
- user-enabled HTML/JavaScript helpers must run in an isolated browser runtime with an explicit capability bridge, not with ambient parent-page authority.

As with the prompt and Skill sections, these are maintained architectural guardrails, not claims that a Web client already exists.

## Windows fork fixes are not plugin dependencies

Context Manager must never depend on private fixes in `WwlWss/deepseek-harness`.

In particular, the local Win32 directory-picker safety patch and any future Session/projection performance patch are DSH-fork implementation changes. Context Manager may rely on public capability values and semantics, but never on their private implementation or event/broadcast frequency.

A user must be able to switch official DSH <-> patched DSH without installing a different Context Manager build.

## Compatibility rules for future PRs

When a PR begins using a new DSH seam:

1. identify the public package/service/Remote/Slot contract that owns the behavior;
2. compare the latest installable DSH package with the latest official repository source;
3. add a focused adapter only for an actual signature/semantic difference;
4. never import production code from DSH `src/` internals;
5. add a focused runtime/contract test that actually executes every supported compatibility branch relied on by production code;
6. use bundle smoke tests for installation/composition claims, not as a substitute for runtime API tests;
7. use source-forward review for unreleased repository changes and do not label them install-tested until packages exist;
8. keep unsupported/missing optional capabilities explicit instead of simulating them;
9. update this document when the minimum tested DSH contract changes.

The compatibility objective is **one plugin codebase across supported official DSH lines and compatible forks**, not one plugin version per host build.
