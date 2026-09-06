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

Current reviewed references are recorded in [compatibility.md](compatibility.md). The committed legacy regression baseline is `dsh-v0.1.1-rc.2`; the latest installable runtime line is `dsh-v0.1.2-rc.1`; and the current source-forward target is `dsh-v0.1.3-alpha.1` / `d347e703...`. Treat those tracks separately: install-tested package compatibility and source review are not interchangeable claims.

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

DSH owns native AgentPreset composition and the durable preset identity associated with a session.

Context Manager may:

- list/read the native preset roster through the public preset service;
- store unresolved preset references as user intent;
- show a locked structural view of shipped presets;
- create DSH-native copies when the user explicitly asks to author a modified composition.

Context Manager must not:

- scan DSH package directories to rediscover presets;
- rewrite shipped preset files;
- represent every Cordis row inside a preset as an independent prompt toggle;
- pretend an already-running session can freely hot-swap its native base preset when DSH locks that composition.

Runtime state must distinguish at least:

```text
configured = what the Context Profile says
resolved   = whether that reference exists/is healthy in the current native roster
effective  = what a live or durable Session/Agent is actually using
```

Do not force those into one adapter. Roster/configured resolution should land before effective Session identity because the latter follows different lifecycle/version seams.

## 10. Prompt and runtime-context modules

Use `ctx.systemPrompt` public composition seams. DSH owns final prompt assembly.

Prompt placement should use stable Context Manager anchors mapped onto finite DSH section orders. Drag ordering is local ordering inside an anchor; do not invent arbitrary numeric history-depth semantics for system prompt placement.

The shipped Minimal preset has special composition constraints (complete persona and disabled runtime context). Expose those limitations honestly. Do not claim an insertion happened if the preset's composition makes it impossible.

Expensive prompt bodies should eventually live in a dedicated content library. Settings should store small metadata, bindings, order, enabled state, and resource references rather than growing into a multi-megabyte content database.

## 11. Skills

Keep DSH's registry/providers as the source capability. The intended Context Manager modes are:

- `pinned` — full instructions explicitly included through a Context Manager prompt/context contribution;
- `auto` — available through native discovery and invocation;
- `manual` — user-invocable but hidden from model-facing discovery;
- `off` — hidden from both managed model and managed user invocation.

The preferred runtime implementation is a scoped overlay/shadow, not rewriting the filesystem provider.

Before claiming hard `off` or `manual` semantics, test:

- global/preset/agent scope precedence;
- duplicate-name shadowing;
- provider invalidation;
- cold sessions and resumed sessions;
- scope disposal;
- whether a farther registration can leak when the managed binding is disabled.

If DSH cannot prove the requested policy in the current version, surface a runtime capability diagnostic instead of simulating it.

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
- Runtime request hot paths should resolve only the selected/effective profile, not repeatedly parse the entire reusable profile library.
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

For every DSH subsystem adapter, test both capability presence and absence. Runtime claims need cold/resume/disposal coverage where lifecycle can change semantics.

### Web tests

When the client face exists, add package-contract checks for `./client` plus focused Slot/store/component tests. Rich renderer/helper work also needs sandbox/bridge tests that prove parent-page authority is not ambient.

### Compatibility tests

CI deliberately uses two Settings test generations rather than one broad semver install:

1. the committed/frozen development dependency set remains on the legacy `0.1.1-rc.2` Settings generation and runs the normal Windows/Linux Node 22/24 suite;
2. a focused Linux compatibility lane installs the exact DSH-facing versions shipped by `dsh-v0.1.2-rc.1` (`@deepseek-ai/cordis@4.0.2`, `@deepseek-ai/dsh-settings@0.1.2-rc.1`, `@deepseek-ai/schemastery@3.18.2`), asserts that the module-level legacy helper is absent and `SettingsProvider.installSection()` is present, then reruns the complete type/build/Domain suite;
3. the DSH CLI bundle smoke separately proves package installation/config composition on `@deepseek-ai/dsh@0.1.2-rc.1`.

This separation prevents two common false positives: compiling only against the newest declarations while accidentally breaking the minimum line, or passing `--dump-config` while never executing the new runtime adapter branch.

Do not mutate the committed lockfile just to test the current generation. The current-generation lane changes only its disposable CI workspace. Do not add every DSH release to the OS/Node matrix; add a focused compatibility lane only when a public contract used by production code actually changes.

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
- uninstall/disposal restores stock behavior;
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

`pnpm run check` performs type checking, a clean production build, and the package/domain test suite on the committed legacy dependency set. CI adds the current Settings-generation compatibility lane described above.

The git-install `prepare` path intentionally emits only the runtime JavaScript needed for installation. Declaration generation and full type checking remain development/CI responsibilities.

For a real DSH smoke test, use the exact tested DSH version documented in [compatibility.md](compatibility.md). Do not silently substitute an unreleased source checkout and call that published compatibility.
