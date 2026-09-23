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


## 2. Upstream contract preflight

DSH evolves quickly. Before changing an integration, inspect the public documentation, published package surface, and exact retained generations rather than coding from memory. The exact authoritative support matrix and source-forward review target belong in [compatibility.md](compatibility.md), not in this handbook.

A capability preflight must record:

- the public package/service/Remote/Slot seam production intends to consume;
- the minimum retained published generation, newest install-tested generation, and current source-forward tree relevant to that seam;
- package exports and packed files, not only monorepo source paths;
- whether the seam can actually be imported/loaded in the environment where production needs it;
- lifecycle and ownership semantics, including unload/HMR behavior;
- upstream non-negotiable rules that constrain the design;
- the evidence class each planned test can honestly establish;
- the exact compatibility claim the PR intends to make.

A helper, type, or test utility visible in the DSH monorepo is **not** a published integration seam merely because source inspection can see it. If a retained generation does not publish or load the proposed package, use a retained public seam, a narrow version adapter, or a package-owned structural bridge only after a preflight proves the contract. Do not widen peer ranges first and discover runtime loadability later.

For the corresponding feature, read these upstream areas before implementation:

| Area | DSH reference |
| --- | --- |
| Package/plugin structure | current DSH plugin/publish documentation and bundle examples |
| Cordis lifecycle and events | `docs/cordis-primer.md` and generated Cordis API docs |
| Settings | Settings subsystem docs plus public `@deepseek-ai/dsh-settings` declarations/source |
| Agent/session lifecycle | core/session subsystem docs |
| System prompt/runtime context | system-prompt subsystem docs |
| Agent presets | agent-preset docs and public `ctx.agentPresets` surface |
| Skills | skill subsystem docs and public `ctx.skills` surface |
| Compaction/history replacement | current compaction packages plus Session Surface docs/types |
| Web client packaging | current client-module docs and `packages/client/AGENTS.md` |
| Slots/UI composition | current Slots/conversation docs |

Do not import DSH `src/` internals in production code merely because the repository source is visible. Source inspection is design evidence; runtime integration should use public package exports, Cordis services/events, Remotes, and declared Slots.


## 3. Repository boundaries

The capability-oriented layout is now partly implemented:

```text
src/
  domain/           pure stored/domain types, parsing, diagnostics
  service/          authoritative Context Manager Host services
  adapters/         narrow DSH subsystem integrations
  remote/           strict browser-facing DTO/projection/wire boundary
  client/           browser-safe Client model, presentation adapters, and Slot registrations
  transforms/       future Host transform engines
  library/          content-library abstractions
```

Not every future directory must exist before its first real implementation. Do not create speculative abstractions merely to match this tree.

Rules:

- `domain/` stays as close to pure TypeScript data logic as practical. It must not reach into Agent, Web, filesystem, or DSH package internals.
- DSH-specific behavior belongs in a narrow adapter or Host service.
- `remote/` is the Host-to-browser boundary. It projects browser-safe DTOs and explicit operations; it must not leak Host service objects, filesystem paths, secrets, or implementation-only identities.
- `client/` is already a real production surface. It must remain browser-safe and must never import Host-only modules.
- A feature that needs an optional DSH capability should attach to that capability explicitly and degrade only that feature when it is absent.
- Do not turn `ContextManagerService` into a god object. Persistence, runtime policy, Remote projection, Client business state, and presentation state have different ownership/lifecycle boundaries.

The project currently uses explicit `.js` suffixes in TypeScript source imports because that is the package's existing ESM build convention. DSH's monorepo-local `.ts` import rule is an upstream repository convention, not a requirement to copy blindly into this standalone package.

### Browser state layers

Do not collapse browser business state into React presentation state.

```text
Host authoritative state
        ↓ Remote DTOs / operations
React-free Client business model/controller
        ↓ derived plain props/callbacks
Slot presentation store / framework hook channel
        ↓
React local component state
```

The React-free Client business model owns Remote-facing facts such as protocol compatibility, profiles, presets, runtime diagnostics, change cursors, loading state, and operation errors. Shared presentation facts such as Drawer open/closed state, selected row, active tab, drafts, or panel sizing belong in a Slot-declared presentation store when they must survive entry remounts or be shared across entries. Truly component-private facts remain ordinary React local state.

Business objects are not UI stores. Presentation components must not invent manual subscription machinery around business objects.

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

M5C uses native `renderSkillContent()` for pinned full instructions and replaces/clears one Agent-scoped system-prompt bundle rather than appending a new user message every model step. Resolve bodies only from the dynamic parent Skill view, and inject only when the M5B Pinned proxy is the actual Agent-view winner. Because body loading is asynchronous, take one final complete Agent-view snapshot after all `get()` calls and discard any loaded body whose winner is no longer the disabled CM proxy; do not `await` again between that final winner check and the synchronous profile/parent/bundle commit. Because Off and Pinned share the same disabled native invocation policy, never infer Pinned solely from the CM provider name plus `false / false`: capture the dynamic parent used for native resolution, then after the final awaited Skill operation re-read both effective profile and parent identity and fail closed unless the same profile/base-preset/Pinned-name plan and parent are still current; repeat that no-await profile/parent check after downstream prompt waterfall listeners return and clear the CM slot/variable if either changed. Use the scoped prompt-variable indirection for literal body preservation on pre-0.1.6 SystemPrompt generations. On retained 0.1.2+ lines, where `startsRequestSeries` is public, the final per-Agent CM contribution fingerprint owns steady-state reconciliation. Do not turn payload-free/unfiltered `dsh-context-manager/change`, `skills/change`, or `system-prompt/change` notifications into Host-wide request-series boundaries. Profile and Skill changes are already captured by the next real request assembly and must not trigger an extra diagnostic body load. Only `system-prompt/change` dirties the per-Agent final-projection observation, because native post-waterfall `complete` suppression is not visible inside the M5C listener. A signal-free diagnostic reassembly at pre-step may refine the current request's fingerprint only while that real request's revision, effective Pinned plan, and parent identity are still unchanged; otherwise keep admission tied to the real request assembly and let the next real assembly reconcile the newer state. Explicit force is only for attach/resume and retirement cleanup. Treat `agent/pre-step` as proposal state, not admission: prepare a pending boundary there, observe the final downstream decision with a prepended wrapper, and commit the pending fingerprint/force baseline only after the fenced request emits native `session/event: request/header`. This keeps the fence live across `agent/request` / `prepareCall()` cancellation or failure. Do not implement M5C cleanup by fabricating core Session events or by depending on retained-version-specific Surface replacement shapes. The request-series fence owner outlives one retiring pinned contribution so hot-unload can reconcile stale native system nodes on the next real request. Retained 0.1.1 predates this seam and is covered through its legacy prompt path.

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


## 13A. Host Remote rules

The Host Remote is a strict browser boundary, not a convenience mirror of Host services.

- DTOs are JSON-compatible projections with explicit browser-safe semantics.
- Host paths, secrets, Cordis contexts, service instances, Sessions, Agents, registries, and other Host-only objects never cross the wire.
- Reads used for browser transport obey DSH redaction rules, while authoritative Host Domain reads remain verbatim.
- Remote errors use stable machine-readable codes. Clients must not parse English text to decide behavior.
- Mutation operations carry the authoritative revision/state token required by the owning subsystem. Never substitute a change cursor for a Settings/resource revision.

### Change hints and stable hydration

M6C change cursors are invalidation hints only. Equality changes mean "re-pull the affected authoritative surface"; a cursor is not a revision, transaction id, or replicated source of truth.

An `instanceId` change invalidates every browser-side assumption for that Remote instance.

Because `changes()` and authoritative reads are separate Remote calls, initial or grouped hydration must use:

```text
changes -> authoritative reads -> changes
```

If `instanceId` or a relevant cursor changes across that bracket, discard the affected read and retry before adopting the later cursor as baseline. Never read a surface first and then blindly accept a later cursor as if it described the already-read bytes.

Runtime diagnostics project runtime facts rather than duplicate editable state. Active effective-profile results carry identity/facts needed for diagnostics; editable profile/resource content comes from the authoritative profile/resource endpoints. Prompt diagnostics never expose PromptResource bodies, and Skill/Pinned diagnostics never expose instruction bodies or Host paths.

### Artifact ABI

Remote/client compatibility claims that depend on generated wire artifacts must test the exact built bytes that consumers receive. Build once on the designated producer toolchain, retain that artifact, and run retained consumers against the same artifact instead of rebuilding separately per consumer generation.


## 14. Web client rules

The Web client exists today and is governed by the same strict compatibility discipline as Host integrations.

### 14.1 Dynamic package and build boundary

Keep Host and Client TypeScript/bundle graphs separate. The published `./client` artifact must contain the package-local/generated code it needs and may depend only on synchronous loader requests that the retained DSH Client runtime actually publishes. Package-contract tests must verify the emitted files and loader ABI.

### 14.2 Client dependency graph

Browser code must not import Host-only packages or rely on monorepo-private test helpers. A source-visible package is not a usable browser dependency until package preflight proves it is published, exported, loadable, and compatible across the retained matrix.

### 14.3 Remote mount lifecycle

Mount the generated Remote contribution through the retained public Client seam. Mount/unmount must be owned by the plugin lifecycle so unload/HMR removes every Remote and Slot registration without patching stock DSH state.

### 14.4 Additive Slots only

Use public additive Slot surfaces. Do not replace keyed stock occupants, patch stock Chat internals, or take over layout regions owned by DSH. Registration occurs in `apply`, never through module-level side effects.

### 14.5 Reactive channels

Follow DSH Client's three-channel rule:

1. if the parent already knows the value, pass owner props;
2. if only one component knows it, use local React state;
3. if presentation state must be shared across entries or survive remounts, declare a store at registration.

Business components contain no manual subscription machinery. Do not call `useSyncExternalStore` around package-owned business objects and do not hand-wire `subscribe()` listeners inside presentation components. If reactive facts are registrant-private, expose them through the retained framework hook compartment; if they are shared presentation state, use a declared store.

### 14.6 Business state versus presentation state

React-free Client business state includes protocol compatibility, Remote hydration, profile/preset/resource data, runtime diagnostics, change cursors, loading state, and operation errors. Shared UI state includes Drawer open/closed, selection, tabs, drafts, widths, and similar view concerns.

Do not mirror Sessions, Remotes, controllers, or other service objects into a second UI store. Do not inject an entire mutable controller/service object into presentation components. Inject plain data, callbacks, and framework-supported hooks/stores.

### 14.7 Compatibility discipline

Before using a Client store/hook/Slot API, preflight the minimum retained generation and every generation where the public package boundary changed. If a newer package did not exist on the minimum line, do not import it unconditionally merely because a structurally similar type existed somewhere upstream. Select the smallest public seam that is actually loadable across the supported range, or isolate generation differences behind a narrow adapter.

### 14.8 Styling and localization

Client styling and product copy follow retained upstream Client rules: use shared/theme token seams instead of hard-coded literal colors where a token exists, and route user-visible product strings through the typed localization mechanism that the retained Client contract actually exposes. If the minimum retained line lacks a required public localization seam, record that as a compatibility constraint during preflight rather than inventing a private dependency.

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


## 17. Testing and evidence policy

Every capability must test the layer it claims, and every compatibility statement must name what evidence actually proved it.

### Evidence classes

Evidence classes are complementary, not a single "higher is always better" ladder:

- **E1 — source audit:** verifies upstream intent, ownership, lifecycle, and non-negotiable design rules.
- **E2 — published declaration / compile contract:** proves the public types/exports consumed by production exist for a published generation.
- **E3 — structural or focused unit/runtime test:** proves package-owned logic and narrow adapters behave as intended.
- **E4 — published production-core runtime:** executes the real published runtime/service/store/Slot core that production consumes.
- **E5 — public service end-to-end:** exercises the public subsystem through a realistic operation/lifecycle path.
- **E6 — artifact/install/composition:** proves the packed/generated artifact can be installed, loaded, or composed as shipped.

Test names and PR claims must not imply evidence stronger or broader than the lane actually provides. E6 does not replace E5, and a full bundle smoke does not prove every runtime branch. Conversely, a deep service E2E does not prove the packed artifact contains the right files.

### Domain and Settings evidence

Domain tests cover parsing/immutability, malformed-resource isolation, unknown-field preservation, explicit leaf mutation, deletion semantics, and schema-version behavior.

Settings integration uses a real `SettingsProvider` subclass and covers capability attach/detach, read-only behavior where relevant, revision conflicts, queued write races, external edits/last-good behavior, and no mutation on failure.

### Runtime adapter evidence

For every DSH subsystem adapter, test both capability presence and absence. Runtime claims need cold/resume/disposal coverage where lifecycle changes semantics. Execute every retained compatibility branch used by production rather than merely compiling it.

### Web evidence

Client work needs package-contract checks for `./client`, retained public Slot/store/runtime execution, lifecycle cleanup, and browser-appropriate component/model tests. A monorepo test helper is not evidence unless it is itself part of the published seam production can consume.

### Same-artifact compatibility

When the ABI is generated or built, compatibility matrices must prefer "build once, consume many":

1. build the retained producer artifact once;
2. retain the exact bytes;
3. install/execute those bytes against each intended consumer generation.

Do not rebuild a subtly different Client/Remote artifact inside every consumer lane and then claim one shipped artifact is compatible with all of them.

The exact authoritative matrix, source-forward target, and per-capability retained lanes belong in [compatibility.md](compatibility.md) and executable CI. This handbook defines the evidence rules; it must not duplicate a milestone-by-milestone version list that can drift from CI.

A source-forward review of DSH `master` is design evidence, not a support claim. A newly published upstream generation is a **candidate** until the compatibility-intake slice proves the package/ABI/runtime lanes required by the affected seams. Do not widen peer ranges or support language before that intake passes.


## 18. PR workflow

Feature work follows an explicit state machine:

```text
PLAN
  -> UPSTREAM PREFLIGHT
  -> DRAFT IMPLEMENTATION
  -> TARGETED TESTS
  -> CI STABILIZATION
  -> STRICT SOURCE REVIEW
  -> FIX / CI LOOP
  -> FINAL REVIEW
  -> READY
  -> MERGE
  -> POST-MERGE CLOSEOUT
```

### PLAN gate

Record the user-visible capability, ownership layers, exact public seam, non-goals, compatibility hypothesis, evidence plan, failure semantics, unload/HMR behavior, and acceptance criteria. New persisted fields require a real runtime owner; do not persist knobs for future semantics.

### UPSTREAM PREFLIGHT gate

Verify exports, packed files, loadability, lifecycle, minimum retained line, newest tested line, current source-forward behavior, and upstream non-negotiable rules. Resolve cross-generation seam questions before implementation.

### DRAFT IMPLEMENTATION and TARGETED TESTS

Feature PRs stay Draft by default. Keep changes narrow. Add focused failure-path and compatibility-branch tests alongside the implementation; do not use a broad CI matrix as the first debugger.

### CI STABILIZATION

Classify failures before changing production code:

- **P — production defect:** implementation violates the intended contract;
- **H — harness defect:** test/CI wiring does not execute the intended contract correctly;
- **U — upstream publication/compatibility defect:** the assumed public package/export/runtime seam is absent or changed;
- **I — infrastructure/transient defect:** runner/network/cache/tooling failure unrelated to product semantics.

Do not "fix CI" by weakening production behavior when the failure is H/U/I.

### STRICT SOURCE REVIEW

Review the complete intended diff after the latest intended functional change and after targeted/CI evidence is green. Check ownership, lifecycle, compatibility branches, failure semantics, performance, package artifacts, and whether the tests prove the claims.

### FIX / CI LOOP

Any functional fix returns to targeted tests and CI. If the fix changes reviewed behavior materially, repeat strict source review.

### FINAL REVIEW -> READY gate

Before marking Ready, record:

- exact head SHA reviewed;
- latest green required CI run for that SHA;
- evidence classes actually achieved;
- known unsupported cases or deferred debt;
- confirmation that no functional commit landed after final review.

No P1/P2 source-review finding may remain open. Documentation-only PRs may skip Draft when they have no executable artifact, but they still require exact-head review.

### MERGE and POST-MERGE CLOSEOUT

Merge only the reviewed green head. After merge, update milestone status/closeout documentation when needed and verify that the next slice starts from the merged contract rather than an earlier plan.

Before merge, also verify:

- no shipped DSH preset/provider/file is rewritten;
- hot unload restores stock behavior through documented native cleanup;
- unknown user data survives unrelated edits;
- stale writes fail rather than retry silently;
- Host-only values cannot leak over the wire;
- the feature does not claim semantics stronger than its evidence;
- every production compatibility branch is executed by at least one focused lane;
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

`pnpm run check` performs type checking, a clean production build, and the package/domain/runtime test suite on the committed dependency baseline. CI adds the focused compatibility, runtime, artifact, and composition lanes recorded in [compatibility.md](compatibility.md).

The git-install `prepare` path emits the complete installable artifact required by declared package exports, including required declarations, generated Typert faces/contributions, and the Web Client artifact. Full source typechecking and non-install test output remain development/CI responsibilities.

For a real DSH smoke test, use an exact tested DSH version documented in [compatibility.md](compatibility.md). Do not silently substitute an unreleased source checkout and call that published compatibility.
