# DSH compatibility

DeepSeek Harness evolves quickly. Context Manager separates **installable/tested package compatibility** from **source-forward review against the latest official repository** so the plugin can follow upstream architecture without confusing source review with package/runtime evidence.

## Current compatibility matrix

| Track | DSH reference | How it is used |
| --- | --- | --- |
| Legacy regression | `dsh-v0.1.1-rc.2` | The committed development dependency set. The full type/build/Domain suite exercises the legacy module-level `installSettingsSection(...)` generation. Focused published-package lanes exercise M3A/M3B/M3C, M4C1 placement, M4C2 Agent/SystemPrompt, and the M5A Skill/Scope contract. A real 0.1.1 AgentLoop recording-adapter E2E proves Context Manager system/runtime-context contributions reach the legacy model request path. |
| Prior modern regression | `dsh-v0.1.2-rc.1` | Dedicated ephemeral CI keeps the first modern Settings generation and native Session `agentPreset` projection under regression. The full Settings suite, AgentPreset M3A/M3C checks, M3B runtime, M4C1 placement, M4C2 Agent/SystemPrompt smoke, M5A Skill/Scope contract, and bundle composition smoke run here. |
| 0.1.5 published regression | `dsh-v0.1.5-rc.1` | Retained because it remains an important published/default-install line. CI reruns modern Settings, AgentPreset M3A/M3C checks, M3B Session runtime, M4C1 placement, M4C2 Agent/SystemPrompt smoke, M5A Skill/Scope contract, and full bundle composition smoke against it. |
| Current stable regression | `dsh-v0.1.5-rc.2` | Install-tested published line retained as the stable regression anchor. CI runs modern Settings, M3A/M3C, M3B projection/runtime, M4A Storage, M4C1 placement, M4C2 Agent/SystemPrompt smoke, the M5A Skill/Scope contract, strict packed-package peer installation, and full DSH bundle composition. |
| Install-tested forward alpha | `dsh-v0.1.6-alpha.2` | Published forward-compatibility line validated by CI across modern Settings, AgentPreset, Session projection/runtime, Prompt Library Storage, M4C1 placement, M4C2 Agent/SystemPrompt, and the M5A Skill/Scope contract. A real 0.1.6 AgentLoop recording-adapter E2E proves the modern model-visible Surface/runtime-context path, dynamic profile/resource resolution, native suppression, and unload/reload behavior. Strict packed-package and bundle composition lanes remain in place. |
| Latest official repository | `master` / `ddefc45f...` | Source-forward architecture target reviewed from official source. The tree identifies as `0.1.6-alpha.2`, preserves the M2-M4C2 seams consumed by Context Manager, adds native live AgentPreset selection, and keeps the base prompt `AssembleContext` at scope/signal while `@deepseek-ai/dsh-agent` publicly augments it with optional Agent identity. Source review remains distinct from package/runtime evidence. |

Support claims must name what was actually tested. A GitHub source tree and an installable npm package remain distinct evidence even when their package version currently matches.

The modern published lines used by CI ship `@deepseek-ai/cordis@4.0.2` and `@deepseek-ai/schemastery@3.18.2`; compatibility lanes use those public package generations while the ordinary development lockfile remains on the legacy generation. Keeping the frozen legacy lock means both Settings API shapes and both M3B Session-read branches remain visible instead of silently raising the minimum baseline.

## Settings compatibility rule

Context Manager owns the `dsh-context-manager` Settings namespace and never reads or writes DSH settings files directly.

The Settings public surface changed between the legacy and modern lines:

- `0.1.1-rc.2` exported `settingsNamespace()` and a module-level `installSettingsSection()` helper.
- `0.1.2-rc.1+`, including `0.1.5-rc.1`, `0.1.5-rc.2`, `0.1.6-alpha.2`, and current source, validates namespace strings in the Settings service and exposes the optional-consumer lifecycle as `settings.installSection(owner, ns, schema, entry, hooks)`.

`src/adapters/settings.ts` owns the narrow version seam:

1. if the legacy module-level `installSettingsSection(...)` export exists, delegate to it;
2. otherwise attach to the optional Settings service and require the modern `settings.installSection(...)` method;
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

The package peer declaration explicitly opts into each tested prerelease tuple rather than assuming prerelease semver crosses tuple boundaries. The `0.1.6-alpha.2` tuple is included together with its compatibility lanes. This is necessary because prerelease semver ranges do not implicitly opt into a different `major.minor.patch` prerelease tuple. CI verifies the built tarball by installing it in fresh consumers with `--strict-peer-dependencies` against both `@deepseek-ai/dsh-settings@0.1.5-rc.2` and `@deepseek-ai/dsh-settings@0.1.6-alpha.2`; compatibility is therefore checked using the package manager's real peer-resolution rules rather than a string assertion.

## AgentPreset compatibility

Milestones 3A and 3C consume the optional public Host capability exposed as `ctx.agentPresets`. Production does **not** import or bundle `@deepseek-ai/dsh-agent-presets`.

The stable Host-service intersection shared by all supported published lines and current official source contains the M3A roster reads:

- `defaultId` — current native default id;
- `authorable` — whether the deployment has a user-authorable preset root;
- `list()` — one unmemoized roster read returning Host rows with `id`, `trust`, optional `name` / `description`, optional `broken`, plus Host-only implementation fields such as the absolute composition `path`;

and the M3C authoring methods:

- `read(id)` — asynchronous exact native composition text;
- `copy(from, id, name?)` — asynchronous DSH-owned whole-preset copy into its writable user root;
- `remove(id)` — asynchronous DSH-owned removal of a locally authorable preset.

Current published DSH declarations return `Promise<void>` from `copy()` and `remove()`, but Context Manager deliberately does **not** make that success payload part of its compatibility contract. Production only awaits completion and exposes `void`; CI therefore requires `Promise<unknown>` for those two operations while keeping their input signatures strict. A future DSH version may enrich the resolved success value without forcing a Context Manager compatibility break. `read()` remains strict `Promise<string>` because Context Manager consumes its resolved content.

The local structural interfaces are intentionally smaller than the native class. They prevent unnecessary coupling to package-root types, constructors, filesystem helpers, Remote clients, mount internals, and newer DTOs that did not exist on the legacy line.

This is still a native-first design. DSH owns discovery, root precedence, health, defaults, authorability, id containment, writable-root selection, collisions, copy/delete mechanics, and standing-mount lifecycle. Context Manager consumes the public service seam and never scans or mutates native preset directories directly.

### M3A runtime boundary

The structural seam is intentionally loose at package-resolution time but not unchecked at runtime.

- `ctx.get('agentPresets') === undefined` is the only condition mapped to capability `unavailable`.
- A present service must expose `list()`; otherwise M3A fails loud as an unsupported Host API rather than pretending the capability is absent.
- `defaultId` must be a string and `authorable` a boolean.
- `list()` must resolve to an array whose minimum consumed row fields match the supported Host contract: string `id`, `trust` of `system | user`, and optional string `name` / `description` / `broken`.
- Unknown additional service or row fields are ignored. The guard validates the minimum contract only; it does not inspect `path`, `order`, mount state, class identity, DSH version, or fork identity.

A widening of a field whose semantics Context Manager actually consumes, such as a new `trust` category, intentionally fails loud until reviewed. Pure additive metadata does not.

### AgentPreset upstream contract and runtime lanes

Runtime structural typing by itself would not make TypeScript notice an upstream declaration change. CI therefore has a compile contract fixture against:

- `@deepseek-ai/dsh-agent-presets@0.1.1-rc.2`;
- `@deepseek-ai/dsh-agent-presets@0.1.2-rc.1`;
- `@deepseek-ai/dsh-agent-presets@0.1.5-rc.1`;
- `@deepseek-ai/dsh-agent-presets@0.1.5-rc.2`.

The fixture loads the native package's public Cordis module augmentation and derives the consumed capability from `Context['agentPresets']`. It asserts the actual Host seam still provides the M3A roster fields/methods and the M3C operation signatures. For M3C, the exact input vocabulary and Promise completion boundary are pinned while `copy/remove` success payloads are deliberately allowed to widen because production ignores them. The check does not depend on package-root class identity or native implementation helpers.

Each AgentPreset lane then performs two runtime layers:

1. `preset-authoring.test.mjs` runs the structural bridge tests, including exact argument preservation, path-local validation, attach/detach behavior, native error identity, and intentional suppression of native success payloads;
2. `preset-authoring-upstream-runtime.mjs` mounts the real published `AgentPresets` service with explicit temporary system/user roots and executes an actual Context Manager `copy -> read -> native roster observation -> remove` cycle.

The native runtime smoke uses a minimal empty composition and disables derived real user/shipped roots where the generation supports those switches. Its purpose is to prove the bridge crosses the real Cordis/native service boundary, not to duplicate DSH's own tests for permissions, metadata rewriting, symlink handling, collision rollback, or root ownership.

This creates a deliberate evidence stack:

```text
production runtime: loose package coupling + narrow runtime validation
CI declaration:    minimum public TypeScript contract
CI bridge tests:   Context Manager semantics with controlled fakes
CI native smoke:   real published AgentPresets + temporary filesystem roots
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

### M3C native authoring compatibility

M3C uses only the Host methods that existed unchanged across the four install-tested published lines. It deliberately does not call the newer Remote authoring facade even though modern DSH exposes one, because the legacy-compatible Host intersection is sufficient and keeps browser transport out of the Host plugin.

The bridge is path-local:

- `read()` validates only the presence/result shape of native `read()`;
- `copy()` validates only native `copy()`;
- `remove()` validates only native `remove()`;
- every operation resolves `ctx.get('agentPresets')` at call time, so optional capability attach/detach cannot leave a stale cached service;
- ids and display names are passed exactly as authored; Context Manager does not trim, lowercase, pre-validate DSH's preset-id regex, or substitute defaults;
- native failures propagate without message parsing or legacy/modern error translation;
- native `copy/remove` success payloads are intentionally discarded, keeping DSH DTO evolution outside Context Manager's API.

This error rule matters because `0.1.1-rc.2` reports dedicated Error subclasses such as `PresetExistsError`/`PresetNotWritableError`, while modern DSH maps corresponding refusals to stable `RemoteError` codes. M3C does not make legacy message text part of its own contract. A future browser Remote layer may define a transport-level normalization only when that layer is implemented.

Native `copy()` and `remove()` are the transaction boundaries. Context Manager must not call exported lower-level helpers such as `copyComposition()` or `deleteComposition()` because that would bypass DSH-owned roster collision policy, standing-mount invalidation, and native-default cleanup.

`authorable` is a diagnostic/capability hint, not a substitute for executing the native operation. Likewise `trust: "user"` does not prove removability: deployments with multiple user roots may discover a `user` preset outside the first writable root, and native `remove()` correctly refuses it.

M3C keeps Stored / Resolved / Effective state independent. Removing a native preset does not rewrite any Context Manager profile and does not alter a live Session's recorded identity. Tests explicitly assert the post-delete state can be:

```text
Stored profile basePreset = "my-preset"
M3A resolved state       = missing
M3B live Session preset  = "my-preset"
```

### Native authoring concurrency boundary

Context Manager does not claim to serialize the complete set of native AgentPreset writers. A Context Manager-local mutex could only coordinate Context Manager calls; it could not serialize the stock DSH authoring UI, another plugin/process, or a manual filesystem writer. Adding such a mutex would therefore provide a misleading partial guarantee.

Current DSH authoring source uses native collision checks/backstops and rollback. Source review also shows that global same-id cross-writer serialization is not a public consumer contract. Concurrent native-write correctness belongs in DSH's `AgentPresets` authoring transaction. If upstream needs stronger same-id ownership/cleanup semantics, that should be implemented and regression-tested there rather than reproduced by Context Manager.

A future Context Manager UI may suppress duplicate clicks while one explicit mutation is pending, but that is UX duplicate suppression, not a cross-writer transaction guarantee.

## M3B Session preset identity compatibility

Milestone 3B observes the AgentPreset identity recorded by a **currently live** DSH Session. It deliberately does not open Session persistence, acquire `SessionHandle`s, resume cold Sessions, or inspect archive storage. DSH owns creation, persistence, resume, and Agent composition; Context Manager observes the Session only after DSH has published it through the live SessionStore.

The public semantic rule is shared across the supported lines:

```text
creation header agentPreset
        ↓
newest committed agent-preset/selected event wins
        ↓
effective recorded Session preset identity
```

The read seam changed:

- `0.1.1-rc.2` exposes the immutable creation header and legacy public `Session.events`; M3B folds the small public record locally.
- `0.1.2-rc.1`, `0.1.5-rc.1`, `0.1.5-rc.2`, and current source expose native `agentPreset: string | null` Session projection state. M3B prefers `ctx.sessionProjections.stateOf(session, 'agentPreset')`.
- if the projection capability/key is genuinely absent, M3B may fall back to the public Session log representation (`snapshotEvents()` on modern Sessions, legacy `events` on the old line).
- if a present projection returns a value other than `string`, `null`, or absent, M3B fails loud instead of hiding an incompatible Host API behind the fallback.

`SessionPresetIdentity` is intentionally independent from M3A profile resolution:

- `unavailable` means the live SessionStore capability itself is absent;
- `not-live` means the requested id is not currently published in that SessionStore; it does **not** claim that no persisted Session with that id exists;
- `known.presetId` is exact `string | null`, with no trimming, normalization, roster lookup, default substitution, or health rewrite.

A Session can therefore truthfully record `foo` even if the current native roster no longer contains `foo`, and changing a Context Profile's configured base preset does not rewrite an existing Session's identity.

### M3B package and runtime boundary

Production does not import or bundle `@deepseek-ai/dsh-session`, `@deepseek-ai/dsh-session-projection`, or `@deepseek-ai/dsh-agent-presets`. It discovers the optional Cordis capabilities structurally through `ctx.get(...)` and validates only the fields/methods it consumes.

The separate `ContextManagerSessionPresetIdentity` Host service owns this read model. It is not added to `ContextManagerPresetDirectory` and it does not modify `ContextProfile`, because Session effective identity and profile configured/resolved state have different lifecycles and no authoritative binding exists yet.

M3B must not call native `list()`, `resolve()`, `mount()`, `recompose()`, `select()`, or any other composition-affecting operation. Native default id is irrelevant to an already-recorded Session identity.

### M3B compatibility lanes

CI executes both declaration contracts and runtime behavior against:

- `0.1.1-rc.2` — legacy `Session.events` branch;
- `0.1.2-rc.1` — native Session projection branch and prior-modern regression;
- `0.1.5-rc.1` — native Session projection branch on the retained 0.1.5 published line;
- `0.1.5-rc.2` — native Session projection branch on the retained stable regression line;
- `0.1.6-alpha.2` — forward-alpha native Session projection branch, including the live-selection semantics introduced on the 0.1.6 line.

The runtime smoke creates an actual published-package `Session`, appends an actual `agent-preset/selected` record, and on modern lines registers the actual native `agentPresetProjectionDefinition` with the actual `SessionProjectionRegistry`. This ensures the compatibility branches production relies on are executed rather than merely simulated by structural fakes.

Current official source at `ddefc45f...` still defines the same `string | null` AgentPreset projection and `stateOf(session, 'agentPreset')` read path, so no additional M3B adapter is needed. It now also exposes native live AgentPreset selection: successful selection records `agent-preset/selected` after the composition swap commits. Context Manager must observe this changing effective identity but must not call `select()` merely to enforce a profile.

### DSH 0.1.6 live preset switching

DSH `0.1.6-alpha.2` adds a native `AgentPresets.select(agent, presetId)` path that serializes switches per Agent, recomposes the Agent, and records `agent-preset/selected` only after the swap commits. This is a Host capability owned by DSH, not a new Context Manager mutation surface.

Consequences for future M4C runtime:

- effective preset identity is dynamic runtime state, not an Agent-creation constant;
- an exact profile/base-preset match must be re-evaluated on each prompt assembly;
- native `A -> B` switching makes an A-bound overlay ineligible on the next assembly; switching back can make it eligible again;
- no fallback profile search, stored-profile rewrite, provider re-registration, or Context Manager-driven `select()` is implied;
- M3B remains the observation boundary and should continue reading the native Session projection/event semantics.

## M4C1 system-prompt placement compatibility

M4C1 re-reviewed the public `@deepseek-ai/dsh-system-prompt` contract on every retained package line and current source-forward DSH. The detailed evidence and implementation mapping live in [m4c1-plan.md](m4c1-plan.md).

The stable cross-generation seam is `section()`, `context()`, `suppressRuntimeContext()`, and `assemble()`. The compatibility split is capability-shaped rather than version-shaped:

- `0.1.1-rc.2` has the documented legacy numeric convention (persona order 0, tool guidance 100-199) and no named-order helpers;
- `0.1.2-rc.1+` exposes both `getSectionOrder()` and `getContextOrder()` with sparse named allocations;
- a present service with only one named-order helper is incompatible and fails loud;
- production never branches on package version, repository identity, or fork identity.

For the named-order line, Context Manager consumes only the common public boundaries `TOOL_BASH`, `TOOLS_SDK`, and `SUBAGENT_DELEGATION`. It does not probe generation-specific persona names. Native numeric ranks remain adapter state and are not persisted in PromptBinding or exposed as Context Manager semantic configuration.

Runtime-context remains a separate native channel. A complete system-prompt section and a runtime-context suppressor are final native assembly facts; later M4C2 must diagnose their effect on Context Manager contributions rather than moving configured placement or special-casing a preset id.

The interpolation contract also matters for later runtime work. DSH 0.1.1 through 0.1.5 interpolate system-section `{{variable}}` groups; 0.1.6 adds optional `PromptSection.interpolate`, while PromptContext still uses native interpolation. M4C1 therefore does not introduce a 0.1.6-only literal mode. Stored PromptResource text remains unchanged and later runtime assembly follows the supported native interpolation semantics unless Context Manager adds an explicit author-controlled vocabulary in a separate milestone.

## M4C2 Agent-scoped prompt runtime compatibility

M4C2 is the first model-effective Context Manager milestone. Production still avoids runtime imports from DSH Agent/SystemPrompt packages merely to identify versions or classes: it consumes Cordis services and Agent objects structurally, while M4C1 remains the sole owner of native numeric placement ranks.

The delivered lifecycle/runtime seam is:

- `ctx.agents.list()` / `get()` for current liveness;
- serial `agent/created` plus `agent/disposed` lifecycle events;
- the public Agent-scoped `agent.ctx` registration owner;
- scoped `systemPrompt.section()` / `context()`;
- the scope-filtered `system-prompt/assemble` waterfall;
- native `systemPrompt.assemble()` for fresh diagnostic inspection.

Context Manager registers four empty system-section placeholders, one empty runtime-context placeholder, and one scoped assembly expander per live Agent. PromptBindings are resolved once per assembly, then expanded as independent native sections/contexts so DSH keeps per-resource interpolation boundaries. There is no cross-step runtime truth cache and no synthetic `system-prompt/change` event for resource/profile edits.

CI now validates this seam in two layers:

1. all five retained published DSH generations compile the public Agent/SystemPrompt contract and mount the real published SystemPrompt service for scoped placeholder/waterfall/suppression smoke;
2. `0.1.1-rc.2` and `0.1.6-alpha.2` additionally run a real AgentLoop with a recording LLM adapter, proving the same Context Manager resolution reaches an actual model request at both ends of the compatibility range.

The endpoint E2E deliberately substitutes only Context Manager's already-tested Domain/Prompt-Library/M3B read services. Those seams have their own persistence/native compatibility lanes. The E2E changes the M3B-observed live preset identity A -> B -> A to prove M4C2 re-evaluates the exact preset fence on every assembly without provider re-registration. Separately, M3B's published-package lanes execute real `agent-preset/selected` Session records/native projection behavior, and source-forward review confirms 0.1.6 native `AgentPresets.select()` records that identity after a successful composition swap. M4C2 itself never calls `select()`.

Model-facing prompt transport differs by DSH generation and remains DSH-owned:

- the legacy 0.1.1 AgentLoop carries the rendered system prompt in `GenerateOptions.system`;
- current DSH projects system prompt updates through the model-visible Session Surface;
- runtime-context is durable superseding user-role history, so native suppression/unload may leave older context text in history while a later `Current runtime context: none...` snapshot makes it no longer effective.

M4C2 tests therefore assert the current effective system/runtime-context view rather than requiring historical text to disappear. Fresh `dshContextPromptRuntime.inspect(agentId)` reports resolved-but-not-yet-interpolated native assembly state (`present` / `suppressed` / `transformed`); fully rendered preview remains M8.

Agent lifecycle cleanup is object-identity based. DSH disposes an Agent's scope before publishing `agent/disposed`; Context Manager therefore removes the dead Agent from its bookkeeping at that event without invoking the already-owned scoped disposer again. Plugin unload explicitly disposes still-live Agent attachments, and reload adopts surviving Agents without turning the global default into a global prompt provider.

## System prompt and runtime-context guardrails

M4C2 prompt runtime uses DSH-owned prompt/runtime-context composition rather than replacing the agent loop or rewriting native preset files. Future prompt extensions must preserve that boundary.

- placement must map to actual public DSH prompt/runtime-context capabilities;
- Agent-scoped provider closures must capture their owning Agent as their ownership seam. The base system-prompt `AssembleContext` exposes `scope` / `signal`, while public `@deepseek-ai/dsh-agent` augmentation adds optional `agent` and ordinary Agent assembly supplies it; runtime ownership must not be reconstructed from that optional field;
- native complete sections and runtime-context suppression are reported from actual final composition; do not special-case a preset id such as Minimal;
- arbitrary SillyTavern numeric historical `depth=N` insertion is not equivalent to system-prompt placement and must not be faked through a different seam;
- any future adapter must be rechecked against the then-current installable and source-forward DSH contracts before it ships.

M4C2 implements the prompt/runtime-context overlay under these constraints; arbitrary historical-depth insertion and later transform/preview features remain outside this milestone.

## M5A Skill/Scope compatibility baseline

DSH remains the owner of the native Skill registry/providers. M5A is still model-inert for skills, but it pins the exact public contract that M5B/M5C will consume before any policy overlay ships.

The five retained published generations all expose the required public seams:

- `SkillRegistry.registerProvider(create)` with registration-scoped `SkillProviderControl.signal` and `invalidate()`;
- `SkillRegistry.list()`, `snapshot()`, and policy-neutral `get()`;
- explicit `SkillInvocationPolicy.modelInvocable` / `userInvocable`;
- finite numeric candidate `rank`;
- payload-free `skills/change` invalidation;
- canonical `renderSkillContent()`;
- DSH Scope ancestry including `scopeParentOf()` and the public dynamic-parent binding/rebind seam.

The M5A CI lane compiles those declarations and executes the actual published SkillRegistry for `0.1.1-rc.2`, `0.1.2-rc.1`, `0.1.5-rc.1`, `0.1.5-rc.2`, and `0.1.6-alpha.2`. Runtime evidence pins these semantics:

- the nearest scope layer wins a duplicate name over farther layers;
- candidate rank decides duplicates only within one layer;
- `Number.MAX_VALUE` is a valid finite rank; because lower ranks win it is the lowest-priority finite rank, but another equal-rank candidate ties and provider registration order decides;
- provider candidates must name the provider that returned them, which constrains the Context Manager proxy-candidate shape;
- all four model/user invocation boolean combinations survive catalog resolution unchanged;
- `get()` does not itself enforce invocation policy;
- provider invalidation clears completed catalog state and emits `skills/change` only while that exact registration remains active;
- disposal aborts the borrowed provider control and a late `invalidate()` no longer affects the registry;
- `renderSkillContent()` remains the canonical full-instruction rendering seam;
- dynamic parent rebind is immediately visible through `scopeParentOf()`, and SkillRegistry catalog reads follow the new scope chain without an explicit registry invalidation; this is the preset-recomposition behavior future M5B depends on.

M5B must preserve **Auto** as native pass-through rather than forcing `true / true`. Manual becomes `false / true`; Off and Pinned become `false / false` in native invocation policy when an underlying skill exists. Pinned full instructions are a separate M5C durable Context Manager contribution, not native discovery or invocation. Missing bound skills remain diagnostics rather than fabricated definitions.

M5C is verified against the same retained Skill/Scope/SystemPrompt generations. It resolves Pinned definitions from the dynamic parent Skill view, requires the M5B Pinned proxy to be the effective Agent-view winner before loading a body, then revalidates that winner with one final complete Agent-view snapshot after all body loads before rendering through native `renderSkillContent()`. Pre-0.1.6 prompt-variable interpolation is handled by one scoped variable indirection so substituted Skill text is not rescanned. The five-generation runtime lane covers ordering, resource hints, literal braces, incomplete/missing definitions, policy conflicts, parent rebind, cancellation, complete-prompt suppression, and multi-Agent isolation.

Real AgentLoop coverage includes the legacy 0.1.1 path, 0.1.2-rc.1 as the first retained public `startsRequestSeries` line, 0.1.5-rc.1 as the first retained `systemPromptUpdate: 'in-history'` path, and the current 0.1.6-alpha.2 path. On 0.1.2+ the longer-lived coordinator uses the final per-Agent pinned-contribution fingerprint as the steady-state reconciliation authority; unfiltered Context Manager/SkillRegistry/SystemPrompt notifications do not independently force request-series boundaries. Profile and Skill changes are observed by the next real request assembly and do not dirty M5C projection state; only `system-prompt/change` dirties the final-projection observation because native post-waterfall `complete` suppression otherwise needs a final native observation. That Agent's next pre-step may run one signal-free native assembly so current `complete` suppression is accounted for, but only when the real request assembly's revision/effective Pinned plan/parent identity are still unchanged; otherwise the newer observation is deferred to the next real request rather than being admitted on behalf of stale prompt bytes. Explicit force remains for attach/resume and retirement cleanup. The non-empty pre-step decision is not treated as durable admission: the coordinator commits its pending baseline only when the same scoped Agent publishes the fenced request's public `session/event` / `request/header`, which occurs after the asynchronous `agent/request` and `prepareCall()` gates that can still abort the request. M5C also performs final effective-profile and dynamic-parent coherence reads after async Skill work and after downstream prompt assembly so a concurrent Pinned -> Off transition cannot be misclassified through the shared disabled invocation policy and an Agent re-parent cannot mix old-parent bodies with the new Agent view. Native DSH then consolidates stale system nodes only when this Agent's actual CM contribution changed or cleanup explicitly requires it. M5C does not own direct Session Surface replacements. A permanent whole-bundle unload cannot leave this process-local coordinator active, and retained DSH exposes no public cross-resume marker for a removed plugin to force a later request series; that limitation is documented rather than simulated with synthetic core events.

The intended M5B implementation remains an Agent-scoped overlay over public Skill capabilities, not a rewrite of skill files or source providers. Before claiming hard scoping, tests must cover real Agent lifecycle, same-name Agent-local collisions (including the equal-`MAX_VALUE` boundary), provider invalidation, preset/profile switching, cold/resumed behavior where public seams permit it, disposal/HMR, and user/model invocation leakage. If the supported DSH contract cannot faithfully express a requested policy, report that limitation instead of simulating it.

M5A production code does not import `@deepseek-ai/dsh-skill` or `@deepseek-ai/dsh-scope`; those packages are installed only in the disposable compatibility lane until M5B actually consumes them.

## Session and model-visible Surface boundary

Modern DSH substantially changed Session APIs relative to the legacy line:

- eager `Session.events` access moved to bounded/snapshot-oriented APIs such as `snapshotEvents()`;
- current Session persistence is lifecycle-owned through `SessionHandle` rather than being a loose read/write helper;
- Agent creation/resume and maintenance semantics are owned by DSH lifecycle services;
- the Session format and projection/cache machinery have continued to evolve.

M3B intentionally stays above that persistence seam. The `SessionHandle` migration matters only if a later Context Manager capability independently inspects a cold stored Session. Such a capability must be designed against the then-current Session Query/persistence contract rather than extending M3B's live-session reader downward.

The latest official source still defines model-visible Surface replacement and uses replacement/shadowing in built-in maintenance such as compaction. That remains a valid architectural foundation for later history transforms, but it does **not** mean Context Manager already has a verified public lifecycle/maintenance hook for arbitrary history transforms.

Therefore future history work must verify the complete current public extension path — Session ownership/locking, maintenance serialization, replacement commit rules, replay/resume, and coexistence with compaction — before implementation. Do not revive an old direct-Session pattern merely because the low-level Surface primitive still exists.

The small-summary pattern is only a representative user-authored preset/use case. Context Manager must provide generic authorable selectors/triggers/extractors/replacements; it must not hard-code `<summary>`, a turn threshold, or summary generation as special Domain semantics.

## M6A Typert Remote compatibility

M6A introduces the first production dependency on `@deepseek-ai/dsh-typert-protocol`. The shared `TypertRemoteService` / `@Remote` authoring seam and generated Remote contribution shape exist on every retained DSH line from `0.1.1-rc.2` onward.

Development generation is pinned to the oldest retained `0.1.1-rc.2` Typert generator/protocol contract. That generator emits eager strict codecs as `{ schema }`, while `0.1.6-alpha.2` changed the Registry/Gateway contract to lazy `{ create() }` factories. The post-generation compatibility projection retains the legacy `schema` field and adds `create: () => schema` to each generated strict codec; generated Host schema exports receive the analogous dual shape. Both retained ABI families accept the extra field, so production code has no runtime DSH-version branch. CI builds and uploads one exact `lib/` artifact under the oldest toolchain, then every runtime-matrix job downloads those same bytes before switching only Cordis/Typert/Gateway packages with lifecycle scripts disabled. The artifact is exercised against the real Typert Registry and API Gateway from `0.1.1-rc.2`, `0.1.2-rc.1`, `0.1.5-rc.1`, `0.1.5-rc.2`, and `0.1.6-alpha.2`. A runtime result obtained only through Gateway SRC fallback is not sufficient.

Retained `0.1.1-rc.2` predates the later shared `RemoteError` vocabulary and Remote-event stream. M6A therefore exposes neither domain mutation errors nor change events yet. Later M6 slices must preserve browser correctness without assuming either newer capability.

## M6B profile/resource Remote compatibility

M6B keeps the same oldest-generated strict artifact strategy. All five retained Settings generations expose `describe({ redactSecrets: true })`, so the browser profile read uses the public redaction switch without version branching and then projects only the explicit M6B DTO fields.

Expected business failures do not depend on shared `RemoteError`. Context Manager returns a package-owned strict JSON result union. The stable native `SettingsConflictError` shape (`code: "SETTINGS_CONFLICT"`, `expected`, `actual`) is mapped to `profile-conflict`; Context Manager Domain/PromptResource error codes are mapped to the corresponding package error vocabulary. Unknown infrastructure/programming failures continue to throw.

The M6B Typert workspace remains isolated from M2-M5 Host service classes through narrow structural ports plus compile-only assignability assertions. The generated contribution contains only the `dshContextRemote` invocation surface.

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

In particular, local Win32 safety patches and any future Session/projection performance patch are DSH-fork implementation changes. Context Manager may rely on public capability values and semantics, but never on their private implementation or event/broadcast frequency.

A user must be able to switch official DSH <-> patched DSH without installing a different Context Manager build.

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


## M5B Skill policy runtime compatibility

M5B is model-effective for native Skill invocation policy while preserving DSH's source providers, ToolSkill consumers, and native same-layer precedence. Managed policy is effective only when the Context Manager proxy is the actual Agent-view winner; inspection reports a competing same-layer winner as `policy-not-effective`.

The production policy runtime is built and executed against all five retained generations:

- `0.1.1-rc.2`;
- `0.1.2-rc.1`;
- `0.1.5-rc.1`;
- `0.1.5-rc.2`;
- `0.1.6-alpha.2`.

The M5B runtime lane proves:

- Auto contributes no proxy and preserves the native winning invocation policy exactly;
- Manual resolves to model-disabled / user-enabled;
- Off and Pinned resolve to model-disabled / user-disabled;
- missing bindings do not fabricate definitions;
- provider discovery stays metadata-only and propagates incomplete parent observations;
- proxy `get()` loads the native body lazily and re-reads current effective mode;
- dynamic Agent parent rebinds are observed without caching parent identity;
- native loaded-definition provenance/content is retained while invocation is overlaid;
- proxy summary metadata is preserved across Host generations while provider ownership is rewritten correctly;
- runtime/provider disposal aborts in-flight parent loads;
- one Context Manager authority change creates at most one registry-wide Skill invalidation across multiple live Agents;
- Auto-to-managed transitions invalidate a previously cached native winner;
- lower-rank Agent-local candidates can outrank the CM proxy and inspection reports that the policy is not effective rather than overstating isolation;
- runtime unload restores stock native Skill behavior.

Real ToolSkill + AgentLoop E2E runs on the oldest retained generation and the forward alpha prove the consumer surfaces:

- Auto model discovery/loading preserves native policy;
- Manual is absent from model discovery/tool loading but remains explicitly user-invocable;
- Off is absent from both model and user invocation;
- Pinned has the same native invocation policy as Off in M5B;
- exact base-preset mismatch bypasses the overlay;
- unload/reload restores and reapplies policy without duplicate providers.

M5C may build on the same effective-profile and parent-view seams, but Pinned full-instruction durability is not part of M5B.


## M6C preset/runtime Remote and change hints

M6C continues to generate one strict artifact with the oldest retained `0.1.1-rc.2` Typert toolchain and executes those same bytes through all five retained Registry/Gateway generations.

Preset/runtime Remote DTOs are package-owned, JSON-safe projections. They do not reuse Host runtime utility types or expose Context objects, filesystem paths, Prompt bodies in diagnostics, Skill instruction bodies, or the Host-only active `ContextProfile` object.

Context Manager does not augment the Typert forwarded-event selection for its own change event. Retained `0.1.1-rc.2` has no usable Gateway event stream, while later retained DSH lines route Host events through the application-owned static `API_REMOTE_FORWARDED_EVENTS` list in `@deepseek-ai/dsh-api-remotes`. A third-party type augmentation would not add a runtime forwarding source and would create a false compile-time contract.

M6C therefore exposes unary `changes()` invalidation cursors. They are best-effort equality hints only, reset with a new Host-lifetime `instanceId`, and must never be used as mutation revision fences. Browser correctness remains based on authoritative unary reads plus the existing DSH Settings/PromptResource revisions.


Unexpected Host/native failures at the Context Manager browser boundary are deliberately sanitized before they reach Typert Gateway. Retained Gateway generations preserve the thrown `Error.message` in their internal-failure wire payload, so Context Manager Remote methods must throw a fixed package-owned message and retain the original exception only as the Host-side `cause`. Stable package-owned business errors continue to use the typed result envelope.


## M7A Client compatibility

The M7A browser bundle is built with `tsconfig.client.json` and emitted as one DSH lazy-CJS loader artifact. The retained Client matrix reuses that exact oldest-built `lib/client.js` against each retained generation's published production `SlotCore` to verify declaration, registration, injection-face storage, and teardown for `sidebar.footer.action` and `shell.overlay`.

This matrix is intentionally named a SlotCore contract rather than a full Client-runtime E2E. DSH's published cross-generation Client test helper is not a usable package-level runtime seam, while the production `SlotRegistry` wrapper's caller-`ctx.effect` ownership was source-audited separately across the retained lines. The plugin follows the same `ctx.slots.inject(... => ctx.slots.register(...))` pattern used by shipped DSH Client packages.
