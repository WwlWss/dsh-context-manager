# Context Manager Development Guide

This document is the maintainer contract for `dsh-context-manager`. Read it together with [architecture.md](architecture.md), [compatibility.md](compatibility.md), and [roadmap.md](roadmap.md) before adding a new capability.

The project is intentionally inspired by SillyTavern's advanced editing workflow, but it is not a parallel agent runtime. DeepSeek Harness remains the owner of agent/session lifecycle, request assembly, persistence, native presets, skills, and Web composition. Context Manager adds explicit user-authored organization and overlays through public DSH seams.

## 1. Core doctrine

The shortest rule is:

> **Context Manager is an editor, not a policy engine.**

That has concrete implementation consequences:

- Preserve user-authored strings, order, references, and unknown extension fields wherever the underlying DSH capability can represent them safely.
- Do not auto-fallback, auto-repair, auto-trim, auto-sort, auto-disable, auto-delete, or silently normalize user data.
- Missing references are valid stored intent. Report them as diagnostics; do not replace them with another preset, skill, module, transform, or renderer.
- Diagnostics describe state. They are not automatically operation gates.
- Hard rejection is reserved for technical integrity boundaries: unavailable/read-only persistence, unsupported storage protocol, stale writes, data that cannot be represented losslessly, unsafe runtime capability claims, or operations that would corrupt DSH/plugin state.
- Never expose a control whose promised semantics DSH cannot actually implement. A disabled capability with a clear diagnostic is better than fake freedom.
- Every mutation must correspond to a user-visible or API-visible explicit operation. A narrow edit changes only the requested leaf.

## 2. Upstream contracts to read first

DSH evolves quickly. Before changing an integration, inspect the public documentation and the exact supported source line rather than coding from memory.

Current reviewed references are recorded in [compatibility.md](compatibility.md). The committed legacy regression baseline is `dsh-v0.1.1-rc.2`; the prior-modern regression line is `dsh-v0.1.2-rc.1`; published regression also covers `dsh-v0.1.5-rc.1` and `dsh-v0.1.5-rc.2`; DSH `0.1.6-alpha.2` is the current forward-alpha compatibility target; and the current source-forward target reviewed for M3/M4 is official `master` at `ddefc45f...`. Treat those tracks separately: install-tested package compatibility and source review are not interchangeable claims.

For the corresponding feature, read these upstream documents first:

| Area | DSH reference |
| --- | --- |
| Package/plugin structure | current DSH plugin/publish documentation and bundle examples |
| Cordis lifecycle and events | `docs/cordis-primer.md` and generated Cordis API docs |
| Settings | `docs/subsystems/settings.md` / `.zh.md`, public `@deepseek-ai/dsh-settings` declarations/source |
| Agent/session lifecycle | `docs/subsystems/core.md`, `docs/subsystems/session.md` |
| System prompt/runtime context | `docs/subsystems/system-prompt.md` |
| Agent presets | agent-preset package docs and public `ctx.agentPresets` surface |
| Skills | skill subsystem docs and public `ctx.skills` surface |
| Compaction/history replacement | current compaction packages plus Session Surface docs/types |
| Web client packaging | current client-module docs and `packages/client/AGENTS.md` |
| Slots/UI composition | current Slots/conversation docs |

Do not import DSH `src/` internals in production code merely because the repository source is visible. Source inspection is for understanding public semantics and tracking upstream drift; runtime integration should use public package exports, Cordis services/events, Remotes, and declared Slots.

## 3. Repository boundaries

The intended long-term layout is capability-oriented:

```text
src/
  domain/           pure stored/domain types, parsing, diagnostics
  service/          authoritative Context Manager Host services
  adapters/         narrow DSH subsystem integrations
  remote/           future Host Remote/BFF surface
  client/           future browser plugin face
  transforms/       future Host transform engines
  library/          future content-library abstractions
```

Not every directory must exist before its first real implementation. Do not create speculative abstractions merely to match this tree.

Rules:

- `domain/` should stay as close to pure TypeScript data logic as practical. It must not reach into Agent, Web, filesystem, or DSH package internals.
- DSH-specific behavior belongs in a narrow adapter or Host service.
- Client code must remain browser-safe and must never import Host-only modules.
- A feature that needs an optional DSH capability should attach to that capability explicitly and degrade only that feature when it is absent.
- Do not turn `ContextManagerService` into a god object. PR2 owns profile persistence/domain semantics; later runtime concerns should be separate services/adapters when their lifecycle differs.

The project currently uses explicit `.js` suffixes in TypeScript source imports because that is the package's existing ESM build convention. DSH's monorepo-local `.ts` import rule is an upstream repository convention, not a requirement to copy blindly into this standalone package.

## 4. The three state layers

Never collapse these three concepts:

```text
Stored payload
     ↓ parse
Domain view
     ↓ resolve against live DSH capabilities
Runtime / effective view
```

### Stored payload

What Context Manager persistence contains for a resource. It may include unknown forward-compatible fields and, through the advanced editor, may be structurally invalid to the current Domain parser.

### Domain view

What this build understands structurally. `ContextProfile` and `SkillBinding` are Domain views, not complete mirrors of stored objects.

### Runtime/effective view

What the currently composed DSH process can actually apply. Examples include whether a preset exists, whether a prompt anchor is available under the active preset, whether an Off skill can be fully shadowed, or whether a transform capability is mounted.

Runtime health must not be written back into stored resources unless the user explicitly authored such data. Do not add fields such as `basePresetExists` to `ContextProfile`.

## 5. Binding objects are forward-compatible leaves

Any resource that is likely to gain placement, ordering, activation, trigger, or runtime metadata should be represented as a binding object from its first persisted version.

PR2 establishes the pattern:

```ts
interface SkillBinding {
  mode: 'pinned' | 'auto' | 'manual' | 'off'
}
```

Stored data may already contain unknown siblings:

```json
{
  "mode": "auto",
  "placement": "after-persona",
  "order": 500,
  "futureField": { "keep": true }
}
```

A mode edit must write only `.mode`. It must not replace the whole binding. Whole-binding deletion is a separate explicit operation.

Apply the same rule to future prompt, transform, renderer, and project/session bindings. Prefer:

```text
setXField(bindingId, fieldValue)
removeXBinding(bindingId)
```

over an overloaded API where `undefined` ambiguously means either "inherit", "clear one field", or "delete everything".

## 6. Structured editing versus advanced editing

Structured creation/replacement validates all currently required Domain fields but stores the caller's original JSON-shaped payload so unknown extension fields survive.

Narrow structured editing uses **path-local guards**:

- validate only the object path the operation traverses;
- validate the new leaf value;
- do not require unrelated malformed fields to become valid;
- never replace a non-object intermediate value merely to make an edit succeed.

This permits explicit local repair. For example, one invalid skill binding mode can be corrected even if another unrelated profile field remains malformed.

The advanced stored-payload editor is not a bypass around persistence integrity. It may preserve Domain-invalid JSON content, but it still cannot claim to store values DSH cannot preserve losslessly.

Current DSH-specific preflights include:

- `undefined` is rejected for newly supplied profile payloads because DSH Settings treats object `undefined` as sparse omission;
- `__proto__` is rejected in newly supplied payloads and path keys while the supported DSH Settings implementation still has a property-safe-construction TODO for that valid JSON key;
- `constructor` and `prototype` are not banned cosmetically.

Native DSH Settings remains the authoritative validator for general JSON shape (finite numbers, arrays, plain objects, cycles, non-JSON objects, and so on). Do not duplicate the whole validator unless an actual DSH behavior prevents Context Manager from preserving its stronger editor contract.

## 7. Settings rules

Context Manager owns the `dsh-context-manager` Settings namespace. Never read or write `settings.yaml` directly.

### Tolerant envelope, opaque resources

The namespace envelope is technical protocol:

```text
schemaVersion
optional defaultProfileId
profiles: Record<string, unknown>
```

The envelope remains schema-owned. Individual profile payloads are deliberately opaque at Settings registration time so one malformed advanced-editor profile cannot prevent the namespace from loading.

### Settings schema versus Domain protocol

The Settings schema should be broad enough to keep unsupported numeric `schemaVersion` values inspectable. The Domain explicitly decides which versions it understands.

Do not use `version <= CURRENT` as compatibility logic. Dispatch supported versions explicitly and add migrations only when a real persisted-version transition exists.

### Descriptor `value` is not the raw document

DSH Settings can retain a last-good resolved `descriptor.value` after an externally edited user section becomes schema-invalid. When the malformed raw section is still an object, `descriptor.user` exposes the current user layer while `value` remains last-good.

Therefore semantic writes must not validate only `descriptor.value`. PR2 preflights the exposed current user section before writing and refuses to mutate from stale last-good assumptions.

A non-object raw namespace cannot be distinguished from absence through the public descriptor. Native `settings.mutate()` rejects such a section before persistence; do not reach into provider internals to bypass or "repair" that limitation.

The profile-level advanced editor operates inside a valid namespace envelope. It is not a general raw `settings.yaml` recovery editor. Envelope-level corruption is recovered through DSH's native Settings document workflow.

### Verbatim Host reads, redacted wire reads

Same-process authoritative Host code may use the verbatim descriptor. Every Remote/wire surface must use DSH's redaction contract and must never send secret values to the browser.

Do not derive Host Domain state from `describe({ redactSecrets: true })`: if Context Manager later gains secret-bearing fields, redaction must not change what the Host itself believes the configuration is.

### Revision fencing

Every semantic Context Manager write must use DSH's raw user-section revision as a compare-and-swap fence.

If the caller supplies `expectedRevision`, honor it. If it does not, capture the current revision before validation and pass that same revision into `settings.mutate()`. Do not automatically retry on `SettingsConflictError`; retrying would reinterpret an old user action against a different state.

DSH's write queue and revision guarantee are in-process. Cross-process convergence is provider-defined; Context Manager must not invent a second lock protocol on top of Settings.

### Settings API-generation adapter

The Settings optional-consumer helper changed public shape between the supported lines. Keep that difference isolated in `src/adapters/settings.ts`:

- legacy generation: module-level `installSettingsSection(...)`;
- current generation: `settings.installSection(owner, ...)`.

The adapter must delegate lifecycle behavior to DSH rather than reproducing attach/detach rules. It must select only public API generation, never a fork identity or commit hash. The same production bundle must work on official DSH and compatible patched forks.

## 8. Cordis lifecycle rules

Use Cordis ownership instead of manual global cleanup.

- Child capabilities mounted with `ctx.plugin(...)` belong to their parent fiber and dispose with it.
- Registrations, listeners, watchers, and resources should be created through Cordis effects or through DSH APIs whose registrations are already effect-owned.
- Required services may be declared/injected when absence means the feature cannot exist.
- Optional capabilities should attach dynamically when the feature can continue in a reduced state without them. PR2 deliberately keeps the Context Manager Host service alive when Settings is absent.
- Do not hold a caller-rebound scoped `this.ctx` as if it were always the original owner context. If a service needs the owner scope for capability discovery, keep that ownership explicit.
- HMR/unload must leave stock DSH behavior unchanged and remove all Context Manager registrations.

Do not catch broad programming/configuration errors solely to keep a fiber ACTIVE. Fail loud for invalid deployment composition; isolate malformed user resources only where the architecture explicitly treats them as editable data.

## 9. Agent presets

DSH owns native AgentPreset discovery, storage, composition, authoring mechanics, standing mounts, defaults, and the durable preset identity associated with a Session.

Context Manager may:

- list/read the native preset roster through the public preset service;
- store unresolved preset references as user intent;
- observe a live Session's recorded effective preset identity;
- show a locked structural view of shipped presets;
- when the user explicitly requests it, delegate native `read(id)`, copy-only `copy(from, id, name?)`, and `remove(id)` operations to DSH.

Context Manager must not:

- scan DSH package or preset directories to rediscover presets;
- construct or accept arbitrary native preset filesystem paths;
- call lower-level authoring helpers such as `copyComposition()` or `deleteComposition()` in place of the public `AgentPresets` service operation;
- rewrite shipped preset files;
- invent blank preset creation, overwrite, implicit rename, or browser YAML write semantics that DSH does not expose;
- infer removability/editability from `trust`; `trust: "user"` is provenance, and native `remove()` owns the real writable-root decision;
- normalize ids or names before native authoring calls;
- cascade native preset deletion into Context Manager profile repair/fallback;
- represent every Cordis row inside a preset as an independent prompt toggle;
- pretend an already-running session can freely hot-swap its native base preset when DSH locks that composition.

Treat `AgentPresets.copy()` and `AgentPresets.remove()` as DSH transaction boundaries. They own collision handling, filesystem containment/root policy, standing-mount invalidation, and native-default cleanup. A Context Manager authoring adapter should resolve the optional `agentPresets` service at each call, validate only the operation-specific method/result shape it consumes, and propagate native failures rather than parsing legacy error messages.

Native preset authoring is a persistent user action. Unloading Context Manager removes its services/overlays but does not delete DSH-native user presets the user explicitly created through it.

Runtime state must distinguish at least:

```text
configured = what the Context Profile says
resolved   = whether that reference exists/is healthy in the current native roster
effective  = what a live or durable Session/Agent is actually using
```

Do not force those into one adapter. Roster/configured resolution, native authoring, and effective Session identity follow different lifecycle/compatibility seams and remain separate services.

## 10. Prompt and runtime-context modules

Use `ctx.systemPrompt` public composition seams. DSH owns final prompt assembly.

Prompt placement is persisted as stable Context Manager semantic anchors, never as native DSH numeric section orders. A dedicated compatibility adapter owns the mapping for each supported public DSH contract. Keep runtime-context contributions separate from system-prompt sections; they have different native assembly semantics.

Within one semantic placement, PromptBinding local order is deterministic persisted semantics: sort by `order` ascending, then by binding id using locale-independent JavaScript relational string comparison (`<` / `>`), i.e. code-unit order rather than `localeCompare()`. Cross-placement sequencing comes from the semantic anchors/native composition. Runtime resolution and effective preview must consume the same resolved ordering instead of sorting independently.

M4B is a Domain milestone only. PromptBindings remain model-inert until the runtime adapter exists.

### Effective profile resolver

Do not couple "where a profile selection came from" to "where its prompt providers are registered".

The runtime selection contract is conceptually:

```text
Session binding       ← future M9
Workspace binding     ← future M9
Global default        ← current fallback
        ↓
candidate profile
        ↓
exact basePreset / live effective-preset match
        ↓
usable or diagnostic
```

The global `defaultProfileId` is a fallback selector, not permission to install global prompt content. From the first model-effective implementation, all Context Manager prompt/runtime-context providers must be Agent-scoped. This prevents a future Session/Workspace-selected profile from inheriting unrelated global-default prompt content.

A profile may contribute only when its exact `basePreset` matches the live Agent/Session effective preset identity. On mismatch, contribute nothing and report a diagnostic. Do not search for another profile, substitute the native default, mutate the profile, or recompose/select the Agent. DSH 0.1.6 can natively switch a live AgentPreset; treat that as an observed runtime change and re-evaluate the fence on the next assembly.

Use effective Session/Agent identity rather than current roster health as the runtime match authority. A deleted native preset can be `missing` in M3A while an already-running Session still legitimately records that same id.

### Aggregate runtime providers and assembly reads

Register a fixed Agent-scoped placeholder set: one empty section slot per supported system anchor, one empty runtime-context slot, and one scoped `system-prompt/assemble` waterfall expander. Do not register one native provider per PromptResource.

The waterfall resolves the effective profile, bindings, resources, and local ordering exactly once for that assembly and replaces visible placeholders with independent per-binding assembled sections/contexts before delegating to `next()`. Keeping each resource independent avoids creating cross-resource native `{{variable}}` groups. The single resolving callback also removes the need for a `WeakMap<AssembleContext, Plan>` cache. Capture the owning Agent in the Agent-scoped registration closure. The base system-prompt `AssembleContext` declares `scope` / `signal`, while `@deepseek-ai/dsh-agent` publicly augments it with optional `agent` and ordinary `assembleContextFor()` supplies both. Context Manager still treats the registration closure as the ownership seam. Re-resolve on every assembly; Settings, Prompt Library resources, Session identity, and native composition remain authoritative.

The runtime path should therefore observe an explicit PromptResource edit or PromptBinding reorder on the next model step without rebuilding the Agent or accumulating registrations.

### Capability and suppression diagnostics

The shipped Minimal preset is a known example of complete-persona/runtime-context suppression, but runtime code must not special-case the id `minimal`. Inspect the final native composition/assembly capability because copied or custom presets can express the same constraints.

A configured placement that cannot survive native final assembly remains valid stored intent. Report it as suppressed/unavailable; do not move it to a nearby anchor.

Large prompt bodies belong in the Storage-backed Prompt Library introduced in M4A. Settings stores only small PromptBindings and references. Resource-list reads stay metadata-only; runtime fetches only the bodies referenced by the selected profile.

## 11. Skills

Keep DSH's registry/providers as the source capability. M5 is split so public-contract/performance work lands before any skill behavior changes.

The intended Context Manager semantics are:

- `pinned` — native model/user invocation both disabled; full instructions are supplied separately by one Context Manager-owned durable replacement bundle;
- `auto` — **no override**: preserve the native winning skill's invocation policy exactly;
- `manual` — `{ modelInvocable: false, userInvocable: true }` when the underlying native skill exists;
- `off` — `{ modelInvocable: false, userInvocable: false }` when the underlying native skill exists.

A missing bound skill is diagnostic state, not permission to fabricate a skill definition.

M5A adds only the targeted default-profile hot-path read, Context Manager authority invalidation event, and five-generation Skill/Scope contract lane. It must remain model-inert for skills.

M5B uses one Agent-scoped overlay/shadow provider and resolves its underlying native winner through the parent-scope view. Provider `list()` must stay metadata-only; full native definitions are loaded lazily only from proxy `get()`. Proxy candidates must advertise the Context Manager provider name because DSH validates `candidate.provider === provider.name`; keep underlying native identity in locator/inspection state. Do not rewrite the filesystem provider and do not listen to `skills/change` merely to trigger Context Manager invalidation; native SkillRegistry invalidation already refreshes provider discovery. The implemented `Number.MAX_VALUE` rank is the largest finite numeric rank and therefore the lowest-priority finite rank because lower ranks win. Equal-rank same-layer candidates still tie on provider registration order, so only claim the precedence actually proven by tests.

M5B managed `off`, `manual`, and `pinned` semantics are guarded by tests for:

- global/preset/agent scope precedence, including dynamic preset-parent rebind without a manual registry invalidation;
- Agent-local same-name duplicates and the equal-`Number.MAX_VALUE` boundary;
- provider-candidate ownership validation;
- provider invalidation;
- existing Agent adoption, live Agent creation, provider disposal, and unload/reload;
- exact `basePreset` switching;
- model and explicit user invocation leakage.

A single `dsh-context-manager/change` must cause at most one registry-wide Skill invalidation, not one `control.invalidate()` call per live Agent. Any per-Agent derived state should be pull-based or cleared without producing N redundant `skills/change` events.

M5C uses native `renderSkillContent()` for pinned full instructions and replaces/clears one Agent-scoped system-prompt bundle rather than appending a new user message every model step. Resolve bodies only from the dynamic parent Skill view, and inject only when the M5B Pinned proxy is the actual Agent-view winner. Because Off and Pinned share the same disabled native invocation policy, never infer Pinned solely from the CM provider name plus `false / false`: after the final awaited Skill operation, re-read the effective profile and fail closed unless the same profile/base-preset/Pinned-name plan is still current. Use the scoped prompt-variable indirection for literal body preservation on pre-0.1.6 SystemPrompt generations. On retained 0.1.2+ lines, where `startsRequestSeries` is public, the final per-Agent CM contribution fingerprint owns steady-state reconciliation. Do not turn payload-free/unfiltered `dsh-context-manager/change`, `skills/change`, or `system-prompt/change` notifications into Host-wide request-series boundaries; explicit force is only for attach/resume and retirement cleanup. Treat `agent/pre-step` as proposal state, not admission: prepare a pending boundary there, observe the final downstream decision with a prepended wrapper, and commit the pending fingerprint/force baseline only after the fenced request emits native `session/event: request/header`. This keeps the fence live across `agent/request` / `prepareCall()` cancellation or failure. Do not implement M5C cleanup by fabricating core Session events or by depending on retained-version-specific Surface replacement shapes. The request-series fence owner outlives one retiring pinned contribution so hot-unload can reconcile stale native system nodes on the next real request. Retained 0.1.1 predates this seam and is covered through its legacy prompt path.

If DSH cannot prove a requested policy in a supported version, surface a runtime capability diagnostic instead of simulating it.

## 12. Transform architecture

Do not create one generic "regex middleware" that is allowed to mutate every representation. Keep four families separate because they have different truth, lifecycle, and security boundaries.

### Host source/prompt transform

Transforms Context Manager-owned prompt/module source before it is contributed to DSH prompt assembly. It must not silently rewrite the durable conversation transcript.

### Host history-Surface transform

Changes model-visible historical projection while retaining DSH's append-only Session log. The low-level Surface replacement primitive is a possible foundation, but implementation must wait until the complete current public Session/lifecycle/maintenance path is verified for the supported DSH versions.

Context Manager must expose generic user-authored transform semantics rather than a hard-coded summary policy. A preset author may choose to emit `<summary>...</summary>` and configure old-history extraction/replacement around that protocol, but another preset may use `<memory>`, a custom delimiter, selected paragraphs, diff-only retention, or another representation. `<summary>` has no privileged Domain meaning.

A history transform must not directly mutate old source events. It should append a valid model-visible replacement/shadowing transition through the public DSH contract available at implementation time.

History transforms must be serialized against active agent work. The implementation must study the then-current built-in compaction transaction/locking rules before shipping. Surface edges must remain valid, and tool-call/result pairs must not be split.

Do not assume "one floor" means one surface node. A user-facing conversation floor should be defined in terms of completed DSH turns (or another explicit product concept), because one turn may contain several model steps and tool calls.

### Client display transform

Transforms presentation only. It must not change what the model sees and must not mutate the durable Session log.

A user-authored transform may, for example, extract a tagged region and render it as a disclosure while leaving the source assistant message intact. The tag syntax belongs to that resource, not to Context Manager core semantics.

### Client renderer/helper

Consumes transformed presentation and renders richer UI, including future HTML/CSS/JavaScript helpers. This is browser presentation, not agent authority.

User-enabled script execution must run in an isolated browser runtime (for example a sandboxed iframe/worker architecture) with an explicit capability bridge. Do not `eval` model output in the DSH parent page and do not hand the sandbox ambient `ctx`, Remote clients, credentials, or parent DOM authority.

Isolation is a technical integrity boundary, not content policy: the user may author arbitrary code inside the declared sandbox, while access back into DSH is granted only through explicit bridge capabilities.

## 13. History replacement and DSH compaction

The current DSH source keeps an append-only Session log and derives a model-visible Surface. It still defines `SurfaceOp.replace`, and built-in compaction uses that primitive. This is architecture evidence for replacement/shadowing, not sufficient by itself to claim that Context Manager may safely append replacements from arbitrary plugin code across every supported Session generation.

Future Context Manager history transforms therefore need an explicit coexistence design using current public APIs:

- do not run while the agent is actively driving a turn;
- acquire/use the lifecycle or maintenance serialization DSH publicly exposes at that time;
- re-read the current Surface immediately before committing a replacement;
- avoid splitting tool call/result pairs;
- detect and define behavior around existing compaction checkpoint nodes;
- ensure a built-in compaction and Context Manager replacement cannot concurrently commit overlapping ranges;
- preserve complete source-event provenance required by the Surface contract;
- test persistence, replay, migration, and resume so the same derived Surface is reconstructed.

Do not abuse `ctx.compaction` merely because it also replaces history if its provider-owned summarization semantics do not match the user's configured transform. Use a DSH compaction service directly only when the requested operation genuinely matches its public contract.

The representative "small summary -> old body shadow -> native compaction fallback" workflow belongs in examples/documentation, not in the core type system. The plugin supplies authorable transformation capability; the preset author supplies the summary protocol and thresholds.

## 14. Web client rules

When the Web face is introduced, follow DSH's dynamic client package contract exactly:

- declare `dsh.client` only in the PR that also ships a valid `./client` artifact;
- keep Host and Client outputs independently testable;
- malformed/missing advertised client artifacts are boot failures, so never add the manifest speculatively;
- use public Slots for UI composition;
- do not replace stock single-occupant surfaces merely to add a Context Manager button or panel.

The initial Context Manager drawer belongs on an additive shell overlay. Rich conversation presentation should use an additive public conversation surface if the then-current DSH client contract still provides one; re-check the exact Slot names before implementation rather than treating an old name as permanent.

Do not try to register a second keyed stock assistant renderer.

### React/client data discipline

Follow the upstream `packages/client/AGENTS.md` rules current at implementation time:

- `ctx` belongs in plugin `apply`/inject closures, not business components;
- components receive plain data/callbacks through the declared Slot shares;
- live external facts arrive through framework-provided hooks or declared stores, not custom subscription machinery inside components;
- business objects such as Sessions stay in the object layer rather than being mirrored into a second UI store;
- UI domains share JSON-compatible data/callbacks, not arbitrary service objects or `ReactNode` values;
- registration occurs in `apply`, never through module-level side effects.

The future Host Remote is the browser boundary. Do not let client code read Host files or reach into Host services directly.

## 15. Performance rules

PR2 Domain parsing is intentionally simple and O(profile count + binding count). Do not prematurely add an incremental cache.

However, protect the following boundaries as the project grows:

- `snapshot()` currently uses `settings.describe()` and must not become a render-frame polling API. Future Remote/client code should use change notifications plus pull-on-change snapshots.
- Keep snapshot normalization metadata-only. Never read prompt bodies, skill files, scripts, renderer assets, or tokenize large text inside the Settings snapshot path.
- Large content belongs in a content library and should be loaded lazily or through a cache owned by the resource subsystem.
- Runtime request hot paths must resolve only the selected/effective profile, not repeatedly parse the entire reusable profile library. M5A establishes `defaultProfileCandidate()` for this purpose; keep full `snapshot()` for editor/diagnostic reads.
- Client conversation renderers must not repeatedly scan the complete session event log on each render; follow DSH's projection/store patterns.
- Regex/display transforms that can be expensive or adversarial should eventually have an isolation/budget strategy (for example a Worker) so one expression cannot freeze the parent UI.

## 16. Diagnostics and errors

Keep these concepts separate:

**Diagnostic** — a property of current state. It is returned in a snapshot and may persist indefinitely. Examples: malformed profile, unresolved default reference, unavailable runtime capability.

**Error** — one explicit operation failed. Examples: stale revision, read-only persistence, a requested path is not structurally editable.

Do not automatically map diagnostic severity to mutation policy. If the UI later needs visual severity, add it as presentation/state metadata only after its semantics are clear.

Errors intended for Remote use should have stable machine-readable codes. Do not make clients parse English error text to decide behavior.

## 17. Testing policy

Every new capability should test the layer it claims, not only its happy-path helper function.

### Domain tests

Cover:

- parsing and immutability;
- malformed-resource isolation;
- unknown-field preservation;
- explicit leaf mutations;
- deletion semantics;
- schema-version behavior.

### Settings integration tests

Use a real `SettingsProvider` subclass and cover:

- provider absence/attach/detach;
- read-only behavior where relevant;
- revision conflicts;
- queued write races;
- external edits and last-good behavior;
- no mutation on failure.

### Runtime adapter tests

For every DSH subsystem adapter, test both capability presence and absence. Runtime claims need cold/resume/disposal coverage where lifecycle can change semantics. Validate only the Host surface each path consumes, and add cross-layer tests whenever one explicit mutation is expected to change resolved state without rewriting Stored or Effective state.

### Web tests

When the client face exists, add package-contract checks for `./client` plus focused Slot/store/component tests. Rich renderer/helper work also needs sandbox/bridge tests that prove parent-page authority is not ambient.

### Compatibility tests

CI deliberately separates compatibility concerns instead of relying on one broad semver install:

1. the committed/frozen development dependency set remains on legacy `0.1.1-rc.2` Settings and runs the normal Windows/Linux Node 22/24 suite;
2. focused modern Settings lanes install exact supported generations `0.1.2-rc.1`, `0.1.5-rc.1`, `0.1.5-rc.2`, and the install-tested forward alpha `0.1.6-alpha.2` with matching Cordis/Schemastery packages and rerun the relevant type/build/Domain regressions;
3. the AgentPreset Host-contract/runtime lanes cover `0.1.1-rc.2`, `0.1.2-rc.1`, `0.1.5-rc.1`, `0.1.5-rc.2`, and `0.1.6-alpha.2`, including the real native M3C `copy -> read -> remove` cycle;
4. the Session preset identity lanes cover the same five generations and exercise the legacy event path and modern public projection path with real published Session/projection objects;
5. the M4A Prompt Library Storage Domain matrix covers those same five generations with both a compile contract and real Storage/StorageJson/StorageDomain durable reopen runtime test;
6. M4C1/M4C2 focused lanes cover all five generations for SystemPrompt placement/runtime contracts, with real AgentLoop endpoint E2E on the legacy and forward-alpha lines;
7. the M5A Skill/Scope lane compiles and executes the public SkillRegistry/Scope contract on all five generations, including nearest-scope precedence, dynamic parent rebind/cache behavior, same-layer rank/ties, provider-candidate ownership, invalidation/disposal, policy preservation, policy-neutral `get()`, `renderSkillContent()`, and `scopeParentOf()`;
8. the M5B policy runtime lane executes managed Auto/Manual/Off/Pinned overlay behavior on all five retained generations, with real ToolSkill + AgentLoop endpoint coverage on the oldest and forward-alpha lines;
9. the M5C pinned-runtime lane executes parent-native resolution, M5B-policy effectiveness gating, canonical rendering, literal-safe prompt substitution, incomplete/missing-definition behavior, multi-Agent isolation, cancellation, and native complete-prompt suppression on all five retained generations; real AgentLoop coverage additionally runs the legacy `0.1.1-rc.2` path, `0.1.5-rc.1` as the first retained in-history system-prompt path, and `0.1.6-alpha.2` as the forward-alpha path, including request-series reconciliation and hot unload/reload;
10. strict packed-package peer installation is verified against both the retained stable Settings line `0.1.5-rc.2` and the forward-alpha line `0.1.6-alpha.2`;
11. full DSH CLI/bundle composition smoke covers `0.1.2-rc.1`, `0.1.5-rc.1`, `0.1.5-rc.2`, and `0.1.6-alpha.2`.

Keep the exact authoritative matrix and reviewed source SHA in [compatibility.md](compatibility.md). When a new public generation is added, update CI and these maintainer docs together rather than letting the handbook lag behind the executable support claim.

This separation prevents common false positives: compiling only against newest declarations while accidentally breaking the minimum line, passing `--dump-config` while never executing a runtime adapter branch, or testing structural fakes without proving the published Host declaration still matches the consumed seam.

Do not mutate the committed lockfile just to test a newer generation. Compatibility lanes change only their disposable CI workspace. Do not add every DSH release to the OS/Node matrix; add a focused compatibility lane when a public contract used by production code actually changes or when a maintained intermediate generation provides meaningful regression value.

A source-forward review of DSH `master` is design evidence, not a support claim. An unreleased source tree does not justify widening peer ranges or claiming install-tested support.

## 18. PR workflow

For each feature PR:

1. State the user-visible capability and the exact DSH public seam that can implement it.
2. Identify which state layer changes: stored, Domain, runtime, client presentation, or several of them.
3. Decide whether a new persisted field is actually needed. Do not persist a knob before its runtime adapter exists.
4. If adding a binding, make it object-shaped and ensure narrow writes preserve unknown siblings.
5. Add runtime validation at untyped boundaries; TypeScript is not a wire/security boundary.
6. Add failure-path tests before claiming the capability.
7. Check the legacy regression line, latest installable line, and current source-forward target as applicable.
8. If a compatibility adapter branches at runtime, add a test that actually executes every supported branch; a bundle/config smoke is not enough.
9. Update [compatibility.md](compatibility.md) if the minimum tested DSH contract changes.
10. Update [roadmap.md](roadmap.md) when a milestone moves or a public DSH limitation changes the planned implementation.
11. Keep the PR Draft until the latest head is green and a final source-level review finds no blocker.

Before merge, verify:

- no shipped DSH preset/provider/file is rewritten;
- component/runtime hot-unload restores stock behavior through its documented native cleanup path; permanent whole-bundle removal must immediately remove Context Manager providers/hooks but must not claim it can rewrite already-admitted in-history prompt bytes after the coordinator itself is gone unless DSH exposes a tested durable public cleanup seam; explicit DSH-native resources the user authored through Context Manager are not treated as disposable plugin-owned state;
- unknown user data survives unrelated edits;
- stale writes fail rather than retry silently;
- Host-only values cannot leak over a wire surface;
- the feature does not claim semantics stronger than the tested DSH version provides;
- every compatibility branch used in production is executed by at least one focused test lane;
- package exports and packed artifacts match the manifest.

## 19. Local development

Current toolchain:

```text
Node: ^22.19.0 || >=24.0.0
pnpm: 11.7.0
```

Typical checks:

```sh
pnpm install --frozen-lockfile
pnpm run check
```

`pnpm run check` performs type checking, a clean production build, and the package/domain/runtime test suite on the committed legacy dependency set. CI adds five-generation Settings/AgentPreset/Session/Prompt/Skill-focused compatibility lanes where applicable, endpoint AgentLoop regressions, packed-bundle verification, and published DSH bundle smoke described above.

The git-install `prepare` path intentionally emits only the runtime JavaScript needed for installation. Declaration generation and full type checking remain development/CI responsibilities.

For a real DSH smoke test, use the exact tested DSH version documented in [compatibility.md](compatibility.md). Do not silently substitute an unreleased source checkout and call that published compatibility.