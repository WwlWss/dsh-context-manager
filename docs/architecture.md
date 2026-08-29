# Architecture

This document records the constraints that keep Context Manager additive to DeepSeek Harness instead of becoming a parallel agent runtime.

## Principle: editor, not policy engine

Context Manager is an advanced context editor. It exposes DSH capabilities and preserves user intent; it does not decide what the user ought to configure.

- Mutations happen only because the user explicitly requested them.
- Do not auto-fallback missing references, auto-disable conflicting modules, auto-trim content, auto-reorder entries, or silently rewrite user data.
- Unresolved preset/skill/module references are valid stored intent. Surface their health separately as diagnostics.
- Diagnostics are informational by default, not gates.
- Reject only operations that cannot be represented safely: storage is unavailable/read-only, the stored schema cannot be safely written by this build, data violates persistence integrity, or the DSH runtime cannot actually provide the claimed capability.
- Do not invent a UI control for a runtime behavior DSH cannot faithfully express.
- Prefer advanced stored-payload editing seams where they can preserve the same technical integrity guarantees as structured editing.

## Principle: native-first overlays

Context Manager must compose with DSH-owned capabilities rather than reimplement them.

- DSH owns agent/session lifecycle and model calls.
- DSH owns the agent-preset roster and preset mounting.
- DSH owns system-prompt assembly and runtime context snapshots.
- DSH owns the append-only Session log and its model-visible Surface projection.
- DSH owns the skill registry, providers, and skill tool.
- DSH owns settings persistence and conflict handling.
- DSH owns the Web layout and Slot composition model.

Context Manager owns user-facing organization and explicit overlays: modular prompt definitions, skill bindings, placement/order metadata, transformation bindings, renderer/helper bindings, profiles, and their UI.

## Host profile domain

The Host is authoritative for Context Manager state. Browser/client code will edit it through a later Remote surface rather than keeping a second independent truth.

DSH Settings currently provides schema defaults/composition base plus one user layer. Therefore `ctx.settings` stores the reusable Context Manager profile library and a global `defaultProfileId`; it must not be misrepresented as native Global -> Project -> Session inheritance. Future project/session bindings belong to their appropriate DSH persistence scopes.

The settings namespace uses a tolerant envelope: numeric `schemaVersion`, optional string `defaultProfileId`, and `profiles: Record<string, unknown>`. The envelope remains schema-owned technical structure; individual profile payloads are parsed independently. One malformed profile therefore becomes a diagnostic instead of preventing every other profile from loading.

### Stored -> Domain -> Runtime

Keep three state layers distinct:

1. **Stored payload** — what Context Manager persistence currently contains for a profile, including unknown fields or malformed advanced-editor data.
2. **Domain view** — the subset this Context Manager build can structurally parse as a `ContextProfile`.
3. **Runtime/effective view** — what the current DSH composition can actually resolve/apply. This layer is deliberately absent from PR2 and belongs to later preset/prompt/skill/transform adapters.

Do not put runtime health (for example `basePresetExists`) into the stored `ContextProfile`. Missing preset/skill references remain valid declarative Domain data and are resolved separately.

A profile currently records only semantics implemented by the Domain: display metadata, a native base-preset reference, and skill bindings. Each skill binding is an object even though PR2 currently interprets only `{ mode }`. This is deliberate: later placement, ordering, activation, trigger, or transform metadata can be added as sibling fields without changing the storage shape, and changing a mode remains a leaf mutation that preserves those siblings.

Prompt, transform, and renderer binding fields are added only when their adapters exist, so persisted configuration never pretends an unimplemented behavior is active.

### Structured and advanced edits

Structured profile creation/replacement requires the complete current Domain shape. Narrow structured field edits use **path-local structural guards** instead: they validate only the path they traverse and the value being written. Unrelated malformed fields do not block a local edit or repair, and Context Manager never replaces a non-object intermediate path just to make an edit succeed.

Changing a skill mode changes only `skills[name].mode`. Removing the whole skill binding is a separate explicit operation. Future narrow editors must follow the same rule: changing one known leaf must not replace an enclosing object that may contain unknown forward-compatible fields.

The Host also exposes detached stored-payload reads plus an advanced stored-payload write. Domain-invalid JSON-shaped data may be preserved and diagnosed rather than repaired. The advanced editor is still bounded by lossless persistence: `undefined` is refused because DSH Settings treats object `undefined` as sparse omission, and the valid JSON key `__proto__` is temporarily refused because current DSH Settings carries an upstream property-safe-construction TODO for that key. Ordinary names such as `constructor` and `prototype` are not cosmetically restricted.

Profile ids, display names, references, and content are otherwise not normalized or rewritten.

### Schema versions

`schemaVersion` stays numerically broad at the DSH Settings schema layer so an unsupported numeric version can still register and produce a read-only Context Manager diagnostic. Compatibility is decided explicitly in the Domain, not by assuming every version less than or equal to the current number is readable.

PR2 supports schema version `1` only. Invalid numeric forms (for example `0` or `1.5`) and unsupported future versions remain inspectable as diagnostics, but every Context Manager write is refused until a build with an explicit parser/migration supports them.

### Revision-fenced writes and last-good Settings state

Every semantic Context Manager write is fenced with DSH Settings' raw-section `revision`. A caller-supplied `expectedRevision` is honored; when omitted, the Host captures the current revision immediately before it validates the operation and passes that same revision to `settings.mutate()`. This closes the normal check-to-mutate race: if another valid writer changes the namespace before the queued mutation reaches the front, native `SettingsConflictError` rejects the stale edit rather than applying it to a newly changed path.

DSH intentionally keeps the last-good resolved value when an externally edited stored section becomes schema-invalid. For a raw section that remains an object, `SettingsDescriptor.user` can expose that invalid current document while `value` still reports last-good state. Context Manager checks that raw user layer before semantic writes and refuses to mutate from stale last-good assumptions. A non-object raw namespace is not distinguishable from an absent user section through the public descriptor, but native `settings.mutate()` rejects it at DSH's `section()` boundary before persistence, so Context Manager must not try to bypass that native failure.

Host-internal Context Manager reads use the verbatim Settings descriptor. `redactSecrets` is a wire/UI concern; the authoritative Host Domain must not derive its own state from a redacted descriptor because future secret-bearing fields would then alter the state the service itself sees.

This guarantee is in-process, matching DSH Settings. Cross-process concurrency remains provider-defined and Context Manager does not add a parallel lock manager.

PR2 deliberately keeps no second Context Manager state cache. `snapshot()` derives the Domain view on demand from the currently registered Settings descriptor/source, so the raw document revision remains authoritative even for user-layer changes whose resolved value is deep-equal and therefore do not trigger a normal Settings watcher.

This domain milestone is intentionally model-inert: saving `basePreset`, `pinned`, `auto`, `manual`, or `off` records user intent only. Preset, prompt, skill, transform, and renderer runtime adapters are separate milestones and must not claim those policies are active until they are actually connected and tested.

## Agent presets

The current shipped preset ids are `standard`, `ptc`, `minimal`, and `cordis` (the latter is presented as the Create/Cordis mode in product surfaces).

Do not locate or scan DSH package directories directly. The Host-side preset domain is authoritative. Future code should consume the existing `agentPresets` service / Remote surface to list and read presets.

Built-in presets are treated as locked base compositions. Their `agent.cordis.yml` rows may be parsed for a read-only structural view, but arbitrary rows must not become independent toggle switches: many rows are runtime services with dependency and isolation requirements, not prompt fragments.

A user who needs to alter the composition itself should create a DSH-native preset copy / modular variant. Context Manager must never rewrite a shipped preset in place.

### Minimal is intentionally special

The shipped `minimal` preset uses a complete persona and disables runtime context. A complete system-prompt section is restored as the sole system prompt after cooperative assembly, so ordinary overlay prompt sections cannot be represented honestly as "before/after persona" there.

The UI must expose this as a capability constraint rather than silently pretending the insertion succeeded. A modular copy that changes the base composition is the escape hatch for users who explicitly want a different Minimal prompt structure.

## Prompt modules

System-prompt modules should register through DSH's `systemPrompt` service. Placement is represented as stable anchors mapped to finite section orders, with local drag order inside an anchor.

Runtime-context modules should use DSH runtime-context contributions where the active preset permits them.

Arbitrary SillyTavern-style insertion at a numeric historical `depth=N` is not currently a public DSH prompt primitive and must not be simulated by rewriting a different seam. History **replacement/shadowing** is different: DSH's public Session Surface explicitly supports `SurfaceOp: { op: 'replace', start, end }`, and any surface-replacing producer may use it. Context Manager history transforms may therefore use that public primitive when their real semantics are durable replacement/compaction rather than arbitrary message insertion.

## Transformation pipeline

Do not model every future "regex" feature as one generic string-replacement hook. The same textual rule can have fundamentally different authority depending on where it runs. Keep at least these capabilities separate:

1. **Source / prompt transform (Host)** — transforms Context Manager-owned prompt/module source before it is contributed through a valid DSH prompt/runtime-context seam.
2. **History Surface transform (Host)** — changes the future model-visible Session Surface through DSH's durable replacement mechanism while preserving the append-only source log. This is the correct family for rules such as "after N turns, replace older body text with extracted `<summary>` material".
3. **Display transform (Client)** — changes only presentation. For example, extract a `<summary>...</summary>` region and render it behind an expandable disclosure while preserving the original Session content.
4. **Renderer / helper (Client)** — renders transformed presentation as richer UI, including optional HTML/scripted artifacts under an explicit isolated runtime.

A display transform must never silently change model history, and a history transform must not erase the human transcript. The Session log remains DSH's source of truth; model-visible replacement acts on its Surface projection.

History replacement must honor DSH Surface invariants rather than treating "floor number" as a raw array index. Replacement boundaries are surface positions identified by seqs, must still exist when committed, and must preserve protocol constraints such as tool-call/result pairing. Context Manager should reuse public DSH compaction/session helpers where appropriate rather than reproducing internal surface validation.

## Display regex and enhanced conversation rendering

Stock DSH renders assistant Markdown as untrusted content with raw HTML disabled. Context Manager therefore must not implement display regex by injecting HTML into stock Markdown and expecting it to execute.

The stock Chat target also owns the keyed `conversation.chat.node` renderer for `assistant-step`; DSH rejects duplicate keyed registrations. Do not patch or replace that private occupant. Instead, richer Context Manager presentation should be supplied through additive public client seams. `conversation.view` is a session-scoped list, so a Context Manager enhanced conversation view can coexist with stock Chat and opt into display transforms, summary disclosures, and helper rendering without removing the original view.

If DSH later publishes a narrower additive assistant-content renderer/transform slot, prefer that capability behind compatibility checks instead of maintaining a parallel enhanced view solely for presentation.

## Tavern-style helper / scripted renderer

Executing assistant-authored HTML/JavaScript inside the DSH application's own document would grant model output ambient browser/DSH authority and is not an acceptable host-integrity boundary. This is runtime isolation, not content-policy judgment.

A future scripted renderer should run arbitrary user-enabled HTML/CSS/JS in a sandboxed document (for example an iframe without same-origin authority). If helper content needs DSH actions, expose a narrow explicit capability bridge, such as typed `postMessage` requests for approved operations, rather than handing the sandbox `window`, Cordis `ctx`, Remote clients, or the parent DOM.

Users remain free to author unusual or self-defeating scripts inside that sandbox; Context Manager's responsibility is only to keep the script's authority equal to the capability the UI claims to grant.

## Skills

Keep DSH's existing skill registry and filesystem provider intact by default.

Context Manager models four user states:

- **Pinned**: full instructions are deliberately included through a Context Manager prompt/context module.
- **Auto**: model- and user-invocable through native DSH skill discovery.
- **Manual**: user-invocable, hidden from model-facing discovery.
- **Off**: hidden from both model and user invocation in the managed scope.

The persisted unit is a **skill binding object**, currently `{ mode }`, not a scalar mode. Later skill-specific placement/order/activation metadata extends that object. Narrow mutations change leaves and preserve unknown siblings.

Native DSH invocation policy already separates model and user visibility. The preferred implementation is a scoped policy overlay/shadow for skills whose managed state differs from their source definition, preserving original providers and stock behavior outside the managed scope.

Before shipping this behavior, verify live sessions, cold/resumed sessions, preset standing scopes, invalidation, and duplicate-name precedence. Do not claim hard scoping until those tests prove that an Off skill cannot leak through a farther layer.

## Settings and persistence

Use DSH `settings` for reusable Context Manager configuration state when available. Do not read or write DSH's settings file directly.

Malformed Context Manager resources should fail in isolation. A malformed profile remains stored and becomes a diagnostic; it is not silently deleted or rewritten. Invalid Cordis deployment configuration is different: follow DSH conventions and fail fast with an actionable schema error rather than swallowing it.

Large prompt, skill, regex, HTML, CSS, JavaScript, or renderer bodies may live in a dedicated content library. Settings should primarily store small bindings, order, enablement, references, and other profile metadata. Do not make every `settings.describe()` clone megabytes of helper source, and do not reimplement settings revisions, stale-write detection, JSON-shape validation, or user override merging around large-content storage.

DSH Settings' in-process revision queue is not a cross-process transaction protocol. When multiple DSH processes share one provider/document, convergence and same-namespace conflicts remain provider-defined.

## Host and Web client boundary

Follow the DSH data direction:

`Host authoritative state -> Remote API -> Client model -> UI adapter/presentation -> Slot -> React`

Browser presentation components must not read Host files directly.

The package starts with only a Host entry. When browser UI is introduced, add a separate `./client` export and a `dsh.client` manifest with `platform: web` and only the DSH client packages the browser face actually injects. Do not import Host-only modules into the client bundle. Host and client build outputs must be independently covered by package-contract tests before the client manifest is enabled.

A malformed `dsh.client` declaration or a missing advertised client bundle can fail Web client module composition, so the browser face must not be added speculatively. The PR that first enables it must prove that a packed install contains the declared client artifact and that DSH can discover it.

## Web placement

The shipped `details` Slot is single-occupant and belongs to the existing Conversation details panel. Context Manager must not register itself there.

The additive surface for the Drawer is `shell.overlay`. A trigger should use an additive list slot where practical (for example a conversation header action/utility) and keep a root-safe fallback only if the product needs access without an active Session. Never replace the whole `conversation`, `sidebar`, or `details` occupant just to add a Context Manager control.

For transformed conversation presentation, prefer an additive `conversation.view` entry over attempting to duplicate the stock Chat target's keyed `assistant-step` renderer. If a future DSH release exposes an additive right-panel/tab or assistant-content transform Slot, prefer it behind capability/version checks rather than patching AppFrame or stock Chat internals.

## Failure and lifecycle policy

- Do not overwrite shipped preset files or profile bundle files.
- Do not replace core providers merely to implement UI policy when a scoped overlay can do the job.
- Use Cordis dependency injection for required services and optional-capability attachment for optional services.
- Own listeners, registrations, watchers, and resources through Cordis effects so unload/HMR removes them automatically.
- Do not broadly catch programming/configuration errors just to keep a Fiber ACTIVE.
- A disabled or uninstalled Context Manager must leave stock DSH behavior unchanged.

## Compatibility boundary

DSH is evolving quickly. Features that depend on optional DSH services should be capability-gated and tested against explicitly supported DSH versions. A missing optional integration may disable only that Context Manager feature; it must not be simulated by reaching into undocumented internal state.

Do not encode current DSH package-internal filesystem paths as compatibility contracts. Prefer exported services, generated Remote surfaces, public package exports, and declared Slots. When an upstream API is missing, document the limitation and add an adapter only after an explicit public seam exists.
