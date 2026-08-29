# Architecture

This document records the constraints that keep Context Manager additive to DeepSeek Harness instead of becoming a parallel agent runtime.

## Principle: editor, not policy engine

Context Manager is an advanced context editor. It exposes DSH capabilities and preserves user intent; it does not decide what the user ought to configure.

- Mutations happen only because the user explicitly requested them.
- Do not auto-fallback missing references, auto-disable conflicting modules, auto-trim content, auto-reorder entries, or silently rewrite user data.
- Unresolved preset/skill/module references are valid stored intent. Surface their health separately as diagnostics.
- Diagnostics are informational by default, not gates.
- Reject only operations that cannot be represented safely: storage is unavailable/read-only, the stored schema is newer than this plugin can safely write, data violates persistence integrity, or the DSH runtime cannot actually provide the claimed capability.
- Do not invent a UI control for a runtime behavior DSH cannot faithfully express.
- Prefer raw/advanced editing seams where they can preserve the same technical integrity guarantees as structured editing.

## Principle: native-first overlays

Context Manager must compose with DSH-owned capabilities rather than reimplement them.

- DSH owns agent/session lifecycle and model calls.
- DSH owns the agent-preset roster and preset mounting.
- DSH owns system-prompt assembly and runtime context snapshots.
- DSH owns the skill registry, providers, and skill tool.
- DSH owns settings persistence and conflict handling.
- DSH owns the Web layout and Slot composition model.

Context Manager owns only user-facing organization and policy overlays: modular prompt definitions, skill bindings, placement/order metadata, profiles, and their UI.

## Host profile domain

The Host is authoritative for Context Manager state. Browser/client code will edit it through a later Remote surface rather than keeping a second independent truth.

DSH Settings currently provides schema defaults/composition base plus one user layer. Therefore `ctx.settings` stores the reusable Context Manager profile library and a global `defaultProfileId`; it must not be misrepresented as native Global -> Project -> Session inheritance. Future project/session bindings belong to their appropriate DSH persistence scopes.

The settings namespace uses a tolerant envelope: `schemaVersion`, optional `defaultProfileId`, and `profiles: Record<string, unknown>`. Individual profile payloads are parsed independently. One malformed profile therefore becomes a diagnostic instead of preventing every other profile from loading.

A profile currently records only semantics implemented by the domain: display metadata, a native base-preset reference, and desired skill modes. Prompt placement/order fields are added only when their runtime adapter exists, so persisted configuration never pretends an unimplemented behavior is active.

Profile ids and reference strings are not cosmetically normalized. The only reserved path keys are those that cross a known technical integrity boundary in the current DSH Settings object/path implementation (`__proto__`, `prototype`, and `constructor`).

The Host exposes both structured profile writes and an advanced raw-profile write. Raw writes are preserved as supplied after DSH Settings' JSON-integrity checks; malformed domain content remains stored and is surfaced as diagnostics rather than auto-repaired.

`schemaVersion` is forward-protective. If stored data is newer than this plugin understands, reads remain diagnostic but all writes are refused so an older plugin cannot destroy newer fields.

Profile mutations use DSH Settings path mutation and optional `expectedRevision` instead of private read/modify/write locking. This preserves unrelated fields and delegates stale-writer detection to the owning DSH service.

This domain milestone is intentionally model-inert: saving `basePreset`, `pinned`, `auto`, `manual`, or `off` records user intent only. Preset, prompt, and skill runtime adapters are separate milestones and must not claim those policies are active until they are actually connected and tested.

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

Do not mutate retained session history to emulate SillyTavern numeric historical depth. Exact arbitrary history insertion is not currently a public DSH plugin primitive. If DSH adds an authoritative history-transform seam later, support can be added behind a capability check.

## Skills

Keep DSH's existing skill registry and filesystem provider intact by default.

Context Manager should model four user states:

- **Pinned**: full instructions are deliberately included through a Context Manager prompt/context module.
- **Auto**: model- and user-invocable through native DSH skill discovery.
- **Manual**: user-invocable, hidden from model-facing discovery.
- **Off**: hidden from both model and user invocation in the managed scope.

Native DSH invocation policy already separates model and user visibility. The preferred implementation is a scoped policy overlay/shadow for skills whose managed state differs from their source definition, preserving original providers and stock behavior outside the managed scope.

Before shipping this behavior, verify live sessions, cold/resumed sessions, preset standing scopes, invalidation, and duplicate-name precedence. Do not claim hard scoping until those tests prove that an Off skill cannot leak through a farther layer.

## Settings and persistence

Use DSH `settings` for reusable Context Manager configuration state when available. Do not read or write DSH's settings file directly.

Malformed Context Manager resources should fail in isolation. A malformed profile remains stored and becomes a diagnostic; it is not silently deleted or rewritten. Invalid Cordis deployment configuration is different: follow DSH conventions and fail fast with an actionable schema error rather than swallowing it.

Large prompt/skill bodies may live in a dedicated content library, but do not reimplement settings revisions, stale-write detection, JSON-shape validation, or user override merging around them.

## Host and Web client boundary

Follow the DSH data direction:

`Host authoritative state -> Remote API -> Client model -> UI adapter/presentation -> Slot -> React`

Browser presentation components must not read Host files directly.

The package starts with only a Host entry. When browser UI is introduced, add a separate `./client` export and a `dsh.client` manifest with `platform: web` and only the DSH client packages the browser face actually injects. Do not import Host-only modules into the client bundle. Host and client build outputs must be independently covered by package-contract tests before the client manifest is enabled.

A malformed `dsh.client` declaration or a missing advertised client bundle can fail Web client module composition, so the browser face must not be added speculatively. The PR that first enables it must prove that a packed install contains the declared client artifact and that DSH can discover it.

## Web placement

The shipped `details` Slot is single-occupant and belongs to the existing Conversation details panel. Context Manager must not register itself there.

The additive surface for the Drawer is `shell.overlay`. A trigger should use an additive list slot where practical (for example a conversation header action/utility) and keep a root-safe fallback only if the product needs access without an active Session. Never replace the whole `conversation`, `sidebar`, or `details` occupant just to add a Context Manager control.

If a future DSH release exposes an additive right-panel/tab Slot, prefer it behind capability/version checks rather than patching AppFrame.

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
