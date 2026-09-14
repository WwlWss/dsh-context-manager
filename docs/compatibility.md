# DSH compatibility

DeepSeek Harness evolves quickly. Context Manager separates **installable/tested package compatibility** from **source-forward review against the latest official repository** so the plugin can follow upstream architecture without confusing source review with package/runtime evidence.

## Current compatibility matrix

| Track | DSH reference | How it is used |
| --- | --- | --- |
| Legacy regression | `dsh-v0.1.1-rc.2` | Frozen development baseline plus focused compatibility lanes. Settings, AgentPreset, Session identity, and M4A Storage Domain contracts remain exercised against the legacy public API generation. |
| Prior modern regression | `dsh-v0.1.2-rc.1` | First modern Settings/Session generation retained under regression, including M4A Storage Domain declaration and real-provider runtime coverage. |
| 0.1.5 published regression | `dsh-v0.1.5-rc.1` | Retained published/default-install line with Settings, AgentPreset, Session, bundle, and M4A Storage Domain coverage. |
| Newest reviewed published line | `dsh-v0.1.5-rc.2` | Install-tested forward line with the same Context Manager compatibility suites, including M4A Storage Domain declaration/runtime coverage. |
| Latest official repository | `master` / `c291e796...` | Source-forward architecture target reviewed separately from install-tested npm claims. Current source preserves the public seams consumed through M3C and the Storage Domain architecture reviewed for M4A. |

Support claims must name what was actually tested. A GitHub source tree and an installable npm package remain distinct evidence even when their package version currently matches.

## Settings compatibility rule

Context Manager owns the `dsh-context-manager` Settings namespace and never reads or writes DSH settings files directly.

The Settings public surface changed between the legacy and modern lines:

- `0.1.1-rc.2` exported `settingsNamespace()` and a module-level `installSettingsSection()` helper.
- `0.1.2-rc.1+`, including `0.1.5-rc.1`, `0.1.5-rc.2`, and current source, validates namespace strings in the Settings service and exposes the optional-consumer lifecycle as `settings.installSection(owner, ns, schema, entry, hooks)`.

`src/adapters/settings.ts` owns the narrow version seam. Context Manager keeps Settings authoritative, uses descriptor revisions as compare-and-swap fences, preserves last-good Domain state across invalid external edits, and never reaches into provider files or implementation internals.

The `__proto__` restriction at the M2 advanced Settings-write boundary remains a Settings-specific property-safe-construction workaround. It is not generalized into a restriction on PromptResource JSON property names.

## AgentPreset compatibility

Milestones 3A and 3C consume the optional public Host capability exposed as `ctx.agentPresets`. Production does **not** import or bundle `@deepseek-ai/dsh-agent-presets`.

The stable consumed intersection provides roster metadata plus exact native `read(id)`, `copy(from, id, name?)`, and `remove(id)` authoring operations. DSH owns discovery, roots, health, defaults, authorability, id containment, collision handling, copy/delete mechanics, and standing-mount lifecycle. Context Manager never scans or mutates native preset directories directly.

M3A performs at most one native `list()` per aggregate Context Manager preset snapshot and keeps configured ids distinct from native resolution. M3C delegates operation-by-operation without parsing native error messages or mutating Context Manager profiles. The four published compatibility lanes execute declaration contracts and real native runtime cycles.

## M3B Session preset identity compatibility

Milestone 3B observes the AgentPreset identity recorded by a **currently live** DSH Session. It deliberately does not open Session persistence, acquire `SessionHandle`s, resume cold Sessions, or inspect archive storage.

The public semantic rule is:

```text
creation header agentPreset
        ↓
newest committed agent-preset/selected event wins
        ↓
effective recorded Session preset identity
```

`0.1.1-rc.2` uses the legacy public Session event representation. Modern supported lines prefer `ctx.sessionProjections.stateOf(session, 'agentPreset')` and use the public Session log only when that projection key is genuinely absent. Exact `string | null` identity is never rewritten from roster health, Context Profile intent, or native defaults.

## M4A Prompt Library Storage compatibility

Milestone 4A uses the public Cordis `storageDomain` capability as the persistence boundary for reusable prompt bodies. Production consumes that capability structurally through `ctx.get('storageDomain')`; it does not import `@deepseek-ai/dsh-storage-domain` or a concrete JSON/SQLite provider, inspect `$DSH_HOME`, or derive provider paths.

The common contract deliberately targets the intersection available on all four install-tested generations:

- `DomainFacility.open(spec)`;
- a named/versioned DomainSpec with table `valueSchema.parse(...)`;
- `Domain.table(name)` and caller-owned `Domain.close()`;
- `KvTable.get/entries/put/delete/update`;
- native serialized `update()` as the durable read-modify-write slot.

CI compiles the Context Manager DomainSpec against and executes a real Storage/StorageJson/StorageDomain lifecycle on:

- `0.1.1-rc.2`;
- `0.1.2-rc.1`;
- `0.1.5-rc.1`;
- `0.1.5-rc.2`.

Compile and runtime checks share the same per-version matrix so the declaration and behavior evidence cannot silently drift onto different dependency generations.

### Stored payload versus PromptResource Domain view

The Storage table intentionally accepts an opaque Stored payload. `PromptResource` validation is performed by Context Manager per resource rather than being used as the Storage-domain open gate:

```text
DSH Storage record
      ↓ opaque JSON-shaped Stored payload
Context Manager parser
      ↓
usable PromptResource | invalid-resource diagnostic
```

This preserves the M2 Stored -> Domain architecture. One malformed or future-version resource therefore remains visible as a diagnostic without preventing unrelated prompt resources from being listed, read, repaired, or edited.

Structured Context Manager writes validate the known PromptResource fields, preserve unrelated JSON-shaped extension fields, and separately preflight the complete authored payload for lossless JSON representation. `revision` is library-owned and cannot be supplied as an extension override. Narrow setters validate only the structural path and revision fence needed for that mutation; they do not require unrelated malformed fields to become valid first.

`list()` is a control-plane metadata/diagnostic view and deliberately omits prompt `content` and arbitrary extension bodies. Full bodies are retrieved by targeted `get(id)`. Future runtime/Remote code must not turn ordinary resource listing into an O(total prompt body bytes) transport path.

### Layout and provider boundary

M4A deliberately does **not** request modern DomainSpec features such as `layout`, `compatibleVersions`, or `invalidRecords`, because those fields are outside the common `0.1.1-rc.2` contract.

The default JSON single layout has a known write-amplification tradeoff: changing one record republishes the domain unit. Context Manager does not hide or work around that by writing provider files itself. DSH provider routing remains the scaling boundary; deployments that need different persistence characteristics can use an appropriate Storage provider without changing PromptResource Domain semantics.

Context Manager also does not switch to modern JSON `per-record` layout in M4A. Current per-record JSON keys must be filesystem-safe, while PromptResource ids intentionally remain arbitrary exact caller-authored strings, including spaces, slashes, CJK, and other values that are valid table keys in the legacy/common single layout. A future per-record migration therefore requires an explicit storage-version design that separates external ResourceId from an internal provider-safe key; it must not silently narrow existing ids.

Cross-process live convergence remains provider-owned. Context Manager serializes its own writes in-process and uses native table `update()` for revision-fenced read-modify-write operations, but it does not claim a distributed lock across other processes/providers.

### Lifecycle and adapter failure behavior

Once `storageDomain.open()` returns a Domain handle, Context Manager owns that handle. Successful attachment registers cleanup so unload/HMR closes the Domain after pending Context Manager operations drain. If the Host exposes a malformed present API after `open()` succeeds, adapter validation fails loud and closes the acquired Domain before propagating the incompatibility; cleanup failure must not be mistaken for capability absence.

M4A remains model-inert. It does not register `systemPrompt`, change Agent/Session composition, add PromptBinding, or infer a default profile. Those behaviors begin only in later milestones after their own public DSH seams are contract-tested.

## System prompt and runtime-context guardrails

Future prompt work must continue to use DSH-owned prompt/runtime-context composition rather than replacing the agent loop or rewriting native preset files.

- placement must map to actual public DSH prompt/runtime-context capabilities;
- a restrictive preset such as Minimal must surface unavailable placement honestly rather than simulating success;
- arbitrary SillyTavern numeric historical `depth=N` insertion is not equivalent to system-prompt placement and must not be faked through a different seam;
- any future adapter must be rechecked against the then-current installable and source-forward DSH contracts before it ships.

These are architecture constraints, not claims that prompt overlays are implemented in the current build.

## Skills guardrails

DSH remains the owner of the native Skill registry/providers. Context Manager's future Pinned / Auto / Manual / Off behavior must be an explicit overlay over public Skill capabilities, not a rewrite of skill files or providers.

Before claiming hard Manual/Off semantics, tests must cover scope precedence, same-name shadowing, provider invalidation, cold/resumed sessions, disposal, and invocation leakage. If the current DSH version cannot faithfully express the requested policy, the capability must be reported unavailable rather than simulated.

## Session and model-visible Surface boundary

Modern DSH substantially changed Session APIs relative to the legacy line. M3B intentionally stays above persistence. Future history work must verify the complete current public extension path — Session ownership/locking, maintenance serialization, replacement commit rules, replay/resume, and coexistence with compaction — before implementation. Do not revive an old direct-Session pattern merely because a low-level Surface primitive still exists.

The small-summary pattern is only a representative user-authored preset/use case. Context Manager must provide generic authorable selectors/triggers/extractors/replacements; it must not hard-code `<summary>`, a turn threshold, or summary generation as special Domain semantics.

## Web client and presentation guardrails

Future Web work remains additive to DSH composition:

- advertise a `dsh.client` face only in the PR that actually ships and contract-tests the client artifact;
- do not replace the occupied single `details` surface merely to add Context Manager UI;
- prefer additive public shell/conversation slots when available;
- do not patch the stock keyed assistant renderer;
- display-only transforms must remain separate from model-visible history transforms;
- user-enabled HTML/JavaScript helpers must run in an isolated browser runtime with an explicit capability bridge, not with ambient parent-page authority.

## Windows fork fixes are not plugin dependencies

Context Manager must never depend on private fixes in `WwlWss/deepseek-harness`. A user must be able to switch official DSH <-> patched DSH without installing a different Context Manager build.

## Compatibility rules for future PRs

When a PR begins using a new DSH seam:

1. identify the public package/service/Remote/Slot contract that owns the behavior;
2. compare the newest relevant installable DSH package(s) with the latest official repository source;
3. add a focused adapter only for an actual signature/semantic difference;
4. never import production code from DSH `src/` internals;
5. add a focused runtime/contract test that actually executes every supported compatibility branch relied on by production code;
6. use real published-service smoke tests for mutation boundaries where structural fakes alone cannot prove integration;
7. use bundle smoke tests for installation/composition claims, not as a substitute for runtime API tests;
8. use source-forward review for repository changes and keep that evidence distinct from package testing;
9. keep unsupported/missing optional capabilities explicit instead of simulating them;
10. update this document when the minimum tested DSH contract changes.

The compatibility objective is **one plugin codebase across supported official DSH lines and compatible forks**, not one plugin version per host build.
