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

## Milestone 3 — Native AgentPreset discovery, runtime identity, and authoring

Goal: connect stored preset references to DSH's native preset domain, observe the identity a live Session actually records, and provide a narrow bridge to DSH-owned native preset authoring without creating a second preset store or changing existing Session composition.

The Settings compatibility prerequisite was completed in merged PR #3. The compatibility matrix retains the legacy `0.1.1-rc.2` generation, the prior-modern `0.1.2-rc.1` generation, both `0.1.5-rc.1` / `0.1.5-rc.2` regressions, and the install-tested forward alpha `0.1.6-alpha.2`. Source-forward review follows current official `master` separately from install-tested npm claims; see [compatibility.md](compatibility.md).

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

**Status:** complete in merged PR #5.

Purpose: add a Session-scoped read model for what a **currently live** DSH Session records, without creating a profile-to-Session binding and without taking over DSH Session lifecycle.

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
- actual published DSH Session objects on `0.1.1-rc.2`, `0.1.2-rc.1`, `0.1.5-rc.1`, `0.1.5-rc.2`, and `0.1.6-alpha.2`;
- actual modern `agentPresetProjectionDefinition` + `SessionProjectionRegistry` execution.

M3B deliberately does **not** consume `SessionPersistence`, `SessionHandle`, or cold-session query APIs. DSH owns creation, resume, persistence, locking, and composition. A Session resumed by DSH becomes a normal live Session and is then observable through the same M3B read path. If a later product surface needs independent cold-archive inspection, design that capability against the then-current Session Query/persistence seam rather than extending M3B downward.

M3B also does not call `list()`, `resolve()`, `mount()`, `recompose()`, `select()`, or otherwise affect AgentPreset composition. The current native `composedPreset(agent.ctx)` observation is useful as a settled-state lifecycle test oracle, but it is not a second public M3B field because live composition can transiently lead the durable selection record during a successful blank-session switch transaction.

### 3C — Native AgentPreset authoring bridge

**Status:** complete in merged PR #6.

Purpose: expose the DSH-owned native preset authoring operations needed by Context Manager without duplicating native storage, filesystem rules, or composition lifecycle.

Production boundary:

- discover optional `ctx.agentPresets` structurally at each operation call;
- delegate exact `read(id)`, `copy(from, id, name?)`, and `remove(id)` Host calls;
- keep production free of imports from `@deepseek-ai/dsh-agent-presets`;
- validate only the operation-specific method/result shape being consumed;
- propagate native operation failures without parsing legacy error messages or inventing stronger policy;
- keep `ContextManagerPresetDirectory` read-only and expose authoring through a separate Host service.

Native ownership rules:

- authoring is copy-only: no blank preset creation, YAML write API, overwrite, or implicit rename;
- shipped presets remain locked;
- DSH chooses the writable root, validates ids, checks roster/on-disk collisions, copies the entire preset directory, rewrites native metadata, and invalidates its own standing-mount cache;
- DSH owns removal, including writable-root ownership checks, standing-mount state, and native-default cleanup;
- `trust: "user"` remains provenance, not an invented `editable` or `deletable` permission;
- Context Manager never accepts or constructs arbitrary native preset filesystem paths.

State separation remains strict. Copy/remove are native resource operations and do not mutate Context Manager profiles. If a profile still references a removed preset, M3A reports the exact configured id as `missing`; if a live Session already recorded that preset, M3B continues to report that effective identity. Diagnostics do not become repair operations.

Compatibility tests exercise the same Host contract on `0.1.1-rc.2`, `0.1.2-rc.1`, `0.1.5-rc.1`, `0.1.5-rc.2`, and `0.1.6-alpha.2`, including exact argument preservation, operation-local validation, native-error propagation, a real native copy/read/remove cycle, and configured/resolved/effective independence after removal.

M3C does **not** expose Remote/UI authoring yet. Opening the authored preset directory is a later client/Remote concern and should reuse the then-current DSH public opener rather than adding a Context Manager filesystem target API.

---

## Milestone 4 — Prompt and runtime-context resource model

Goal: introduce real modular prompt resources and placement without building the Web editor yet.

### 4A. Storage-backed Prompt Library

**Status:** complete in merged PR #7.

Purpose: keep large reusable prompt bodies out of the Settings profile namespace while preserving the Stored -> Domain separation established by M2.

Delivered:

- native DSH `storageDomain` persistence under a Context Manager-owned prompt domain;
- stable caller-authored resource ids separate from display names;
- opaque Stored payloads with per-resource `PromptResource` parsing, so one malformed/future record does not take the whole library offline;
- metadata/diagnostic-only `list()` and targeted `get(id)` for full detached prompt bodies;
- exact prompt text round-tripping with no trim, newline normalization, or template interpretation;
- explicit create/replace/delete plus path-local name/description/content mutations;
- resource-local positive-integer revisions, stale-write rejection, and small mutation receipts;
- structured writes that preserve unknown JSON-shaped extension fields while keeping `revision` library-owned;
- lossless JSON-shape preflight before structured writes;
- all Context Manager writes serialized through one operation chain, with native Storage Domain update semantics remaining the durable transaction boundary;
- malformed-resource diagnostics and explicit path-not-editable failures instead of silent repair;
- adapter validation and cleanup through the public `storageDomain` seam only;
- five-generation compile/runtime coverage on `0.1.1-rc.2`, `0.1.2-rc.1`, `0.1.5-rc.1`, `0.1.5-rc.2`, and `0.1.6-alpha.2`.

M4A remains model-inert. It does not add PromptBinding, register `systemPrompt`, change any Agent/Session behavior, fall back to Settings for bodies, or access `$DSH_HOME`/backend paths directly.

The library deliberately keeps the legacy-compatible single-domain layout. Current JSON `per-record` layout is not requested because the oldest supported Storage contract has no layout field and modern JSON per-record keys impose a path-safe vocabulary that would conflict with arbitrary authored PromptResource ids. Large-library provider/layout migration remains a later Storage concern, not a reason to narrow ids now.

### 4B. PromptBinding

**Status:** complete in merged PR #12.

Add object-shaped profile bindings with a profile-local binding identity that is deliberately separate from PromptResource identity:

```ts
type PromptBindingId = string

interface PromptBinding {
  resourceId: string
  enabled: boolean
  placement: PromptPlacement
  order: number
}
```

Profiles store `prompts: Record<PromptBindingId, PromptBinding>`. A missing `prompts` field is interpreted as an empty map, so this additive Domain field does not require a Settings envelope schema-version bump.

The identity split is intentional. M4A permits arbitrary exact PromptResource ids, while prompt binding ids are used as DSH Settings path keys by structured mutations. Those mutation paths must obey the current Settings path-safety boundary. A resource id such as `__proto__` therefore remains a valid reference value, while a structured mutation targeting that same string as a binding key is refused. Externally stored data is still parsed as Stored/Domain input rather than silently rewritten solely because one key is not structurally editable by the current Settings implementation. The split also avoids imposing a one-resource-once-per-profile restriction: several bindings may reference the same PromptResource at different placements/orders.

The stored placement vocabulary is semantic Context Manager state, not a native DSH numeric order:

```text
before-persona
after-persona
before-tool-guidance
after-tool-guidance
runtime-context
```

Rules:

- `resourceId` is stored literally and is not resolved against Prompt Library during M4B writes;
- missing PromptResource references remain valid stored intent; resource health belongs to later resolved/runtime diagnostics;
- `order` is a signed safe integer local to the semantic placement. M4B does not persist native DSH numeric section order;
- within one semantic placement, local ordering is deterministic: `order` ascending, then `PromptBindingId` by locale-independent JavaScript string/code-unit order. M4C runtime resolution and M8 preview must share this ordering contract rather than inventing separate tie-breaks;
- unknown binding siblings survive structured creation and every narrow edit;
- adding a binding is an explicit operation that supplies the complete current binding shape;
- changing resourceId/enabled/placement/order requires an existing object-shaped binding and edits only that leaf;
- leaf setters never synthesize a missing partial binding;
- removing the whole binding is a separate explicit operation and may remove a malformed stored binding;
- malformed prompt binding data can make the Domain profile unusable without rewriting Stored state; path-local edits may repair the requested leaf without gating on unrelated malformed profile fields;
- no runtime health, effective order, suppression state, token count, native section identity, or PromptResource body is persisted in the binding;
- M4B remains model-inert. Persisting a PromptBinding does not query Prompt Library, register a system-prompt section, alter Agent/Session state, or contribute runtime context.

### 4C1. DSH system-prompt placement compatibility adapter

**Status:** complete in merged PR #13. See [m4c1-plan.md](m4c1-plan.md).

Purpose: map the stable Context Manager placement vocabulary onto the public DSH system-prompt/runtime-context ordering contract without leaking DSH generation-specific numeric order into stored data.

Use only public `ctx.systemPrompt` section/context contracts. Keep generation-specific order mapping in one adapter rather than scattering numeric constants through Domain, service, Remote, or UI code.

The adapter must distinguish **system-prompt sections** from **runtime-context snapshots**. `before-tool-guidance` / `after-tool-guidance` refer to textual native tool-guidance sections; they do not claim ordering relative to the separate native tool-schema sequence.

Compatibility behavior:

- derive each supported generation's mapping from its tested public section/order contract;
- use capability/public-shape detection rather than fork identity or package-version string branching where practical;
- fail loud when a present Host contract is incompatible instead of silently choosing a nearby order;
- report placement capability separately from user configuration;
- do not register Agent contributions yet in this submilestone.

Special composition constraints, including complete-persona or runtime-context suppression, must remain observable runtime facts. Do not hard-code `presetId === "minimal"`; copied/custom presets may have the same native composition constraints.

### 4C2. Agent-scoped Prompt Runtime

**Status:** complete in merged PR #14. See [m4c2-plan.md](m4c2-plan.md).

Purpose: make PromptBindings model-effective for the first time while preserving future Workspace/Session binding extensibility.

Introduce one conceptual runtime selection boundary:

```text
EffectiveProfileResolver
        │
        ├─ Session binding       ← M9 later
        ├─ Workspace binding     ← M9 later
        └─ Global default        ← M4C2 fallback
                ↓
         candidate Profile
                ↓
 Profile.basePreset == live effective AgentPreset?
                ↓
          usable / mismatch
```

M4C2 implements only the global-default source. The resolver abstraction must nevertheless be kept separate from prompt registration so M9 can add nearer binding sources without rewriting the prompt runtime.

Hard runtime invariants:

- `defaultProfileId` selects a candidate profile; it never means "register this profile globally";
- every Context Manager prompt/context contribution is owned by the **Agent scope**, even while global default is the only selection source;
- a candidate profile contributes only when its exact `basePreset` matches the live Agent/Session effective preset identity;
- mismatch produces a runtime diagnostic and **no** Context Manager prompt contribution;
- do not search for another matching profile, substitute DSH's native default, or rewrite the stored reference;
- roster health is not the match authority for an already-running Agent. If a live Session still records a deleted native preset and the profile names that exact preset, the overlay remains eligible;
- runtime contributions resolve current bindings/resources and the current live preset identity on every prompt assembly rather than capturing a permanent profile or preset identity at Agent creation;
- native DSH preset switching is an external runtime fact: if DSH changes a live Agent from preset A to B, the next assembly must re-evaluate the exact `basePreset` fence without Context Manager calling `select()`/`recompose()` itself;
- provider closures capture their owning Agent when registered. The base system-prompt `AssembleContext` declares `scope` / `signal`, while `@deepseek-ai/dsh-agent` publicly augments it with optional `agent` and ordinary `assembleContextFor()` supplies both `agent` and `scope`; Context Manager still uses the registration closure as the authoritative ownership seam rather than making provider ownership depend on optional assembly metadata;
- HMR/unload must remove every Context Manager registration from already-live Agents and leave stock DSH behavior;
- reload must attach idempotently to Agents that already existed before the plugin reloaded.

Use a fixed Agent-scoped placeholder set (one empty section slot per supported system anchor plus one empty runtime-context slot) and one Agent-scoped `system-prompt/assemble` waterfall expander. The expander resolves the effective profile/resources exactly once for that assembly and replaces each visible placeholder with independent per-binding assembled contributions. This preserves PromptResource interpolation boundaries and eliminates the need for `WeakMap<AssembleContext, Plan>` memoization. Never register one native provider per PromptResource, and never cache runtime truth across model steps. The owning Agent comes from the Agent-scoped registration closure; optional `context.agent` metadata is not the ownership mechanism.

Runtime/effective output must distinguish at least:

```text
no-default-profile
profile-unusable
preset-identity-unavailable
base-preset-mismatch
active
```

and per-binding states such as disabled, missing-resource, eligible, effective, or suppressed by the native composition.

M4 completion evidence covers:

- representative native system-prompt compositions, including generic complete-section and runtime-context suppression behavior without preset-id special cases;
- exact base-preset match and mismatch with no fallback;
- M3B-observed live identity switch `A -> B -> A`: matching overlay active on A, absent with `base-preset-mismatch` on B, and active again after returning to A without provider re-registration or Context Manager-driven switching; M3B's own published-package coverage remains the evidence for native preset projection/selection semantics;
- deleted native preset + still-live matching Session identity at the effective-profile boundary;
- stable local ordering and deterministic tie breaking;
- PromptResource edit/reorder reflected on the next model step without duplicate registrations;
- enable/disable lifecycle;
- default-profile change reflected on the next model step without creating a Session binding;
- concurrent initial-adoption / `agent/created` attachment coalescing, unload/HMR cleanup, and reload of already-live Agents;
- runtime-context projection and native suppression semantics;
- independent native interpolation boundaries plus propagation of native template-variable errors without rewriting source PromptResource text;
- real DSH Agent/recording-model E2E coverage on the retained legacy and current runtime lines;
- no modification of native preset files.

Cold/resume profile-binding semantics remain a later M9 concern because M4 has no Session/Workspace profile binding persistence of its own.

M4 is complete only after M4C2 proves real model-visible behavior. M4A/M4B alone remain model-inert.

---

## Milestone 5 — Skill policy runtime

Goal: make Pinned / Auto / Manual / Off real while keeping DSH's native Skill registry and source providers authoritative.

The implementation is split deliberately so compatibility/performance work lands before any model-visible skill-policy change. See [m5-plan.md](m5-plan.md).

### 5A — Public contract + runtime foundation

**Status:** complete in PR #15; model-inert for skills.

M5A establishes the prerequisites shared by M5B and M5C:

- pin the public SkillRegistry / Scope seams across all five retained DSH generations;
- execute scope precedence, same-layer rank/tie behavior, provider invalidation/disposal, invocation-policy preservation, policy-neutral `get()`, `renderSkillContent()`, and `scopeParentOf()` in CI;
- add a targeted default-profile Domain read so request-time runtime code parses only the configured default profile rather than the complete reusable profile library;
- move M4C2 prompt assembly to that targeted read without changing EffectiveProfileResolver outcomes;
- publish a payload-free `dsh-context-manager/change` authority invalidation from the existing Settings attach/change/detach lifecycle.

M5A does **not** register a Context Manager SkillProvider, change invocation policy, hide skills, or inject Pinned instructions.

### 5B — Agent-scoped Skill policy overlay

**Status:** complete in PR #16; model-effective for native skill invocation policy.

M5B uses one Context Manager provider in each live Agent scope to shadow only managed non-Auto skills. Resolve the underlying native winner through the Agent scope's parent view so the overlay does not recursively select itself and the original filesystem/provider remains authoritative. Catalog construction stays summary-only; full native bodies are loaded lazily only from the proxy provider's `get()`. Proxy candidates must use the Context Manager provider name rather than copying the native candidate's `provider` field.

Mode semantics:

- **Auto** — contribute no Context Manager shadow. Preserve the native winning skill's exact invocation policy; do not force `true / true`.
- **Manual** — if the native skill exists, shadow it as `{ modelInvocable: false, userInvocable: true }`.
- **Off** — if the native skill exists, shadow it as `{ modelInvocable: false, userInvocable: false }`.
- **Pinned** — if the native skill exists, also shadow it as `{ modelInvocable: false, userInvocable: false }`. Pinned instructions are supplied separately by M5C, not by native discovery/invocation.
- A missing bound skill remains a runtime diagnostic. Context Manager must not fabricate a definition.

The implemented shadow rank is `Number.MAX_VALUE`, the largest finite numeric rank accepted by the public contract. Because lower ranks win, this is the lowest-priority finite rank. Ordinary same-layer Agent-local candidates with any lower rank therefore take precedence over Context Manager, but this is not an absolute same-layer guarantee: another `Number.MAX_VALUE` candidate ties and provider registration order decides. M5B tests and documents only the precedence guarantee actually proven by the native registry.

On `dsh-context-manager/change`, M5B coalesces the authority change to at most **one** registry invalidation through one currently active CM `SkillProviderControl`. DSH invalidation is registry-wide; invalidating every Agent provider would only create redundant revision bumps and `skills/change` events. Do not create a `skills/change -> Context Manager invalidation -> skills/change` feedback loop; native provider changes already invalidate SkillRegistry's catalog.

M5B lifecycle tests must cover existing/new Agents, preset standing scopes, same-name precedence, profile/basePreset switches, native provider invalidation, scope disposal, HMR/unload/reload, user/model invocation paths, and leakage from farther scopes.

### 5C — Pinned durable full-instruction bundle

**Status:** complete in PR #17; model-effective Pinned full-instruction runtime.

Pinned means full instructions are deliberately included by Context Manager even though the native skill is hidden from both model discovery and native user invocation.

M5C loads the underlying native definition through the dynamic parent-scope view and renders it with native `renderSkillContent()`. Injection is allowed only when M5B's Agent-view policy proxy is actually effective for that Pinned skill; conflicts remain diagnostic and do not create a half-effective Pinned state. The bundle is deterministic in code-unit skill-name order.

The retained-version re-audit rejected durable `agent/pre-step` message injection because accepted messages enter Session history, and rejected a new direct Session Surface adapter because the replacement contract changed across retained generations. M5C instead owns one Agent-scoped system-prompt slot. A literal-safe prompt-variable indirection preserves arbitrary `{{...}}` Skill text on legacy SystemPrompt generations.

On retained DSH 0.1.2+ lines, where `startsRequestSeries` is a public `PreStepDecision` field, a longer-lived request-series coordinator compares the final CM-owned pinned contribution between real requests and fences only the Agent whose actual contribution changed. Payload-free/unfiltered Context Manager, SkillRegistry, and SystemPrompt notifications are not treated as proof that every Agent needs a new request series. They only dirty each runtime's final-projection observation; that Agent's next pre-step lazily reassembles once without a request signal so post-waterfall `complete` restoration is included before fingerprint comparison. Explicit force remains for first attach/resume and retirement cleanup. It preserves downstream pre-step messages/decisions and adds `startsRequestSeries: true` only when reconciliation is required. A pre-step enter is proposal state only: CM advances the admitted fingerprint/force baseline after the fenced request publishes native `session/event: request/header`, so cancellation/failure in the later `agent/request` or `prepareCall()` phases cannot consume the boundary. Async Pinned resolution also performs final effective-profile plus dynamic-parent coherence reads, including after downstream prompt assembly; a concurrent transition to Off/Manual/Auto, a base-preset/profile change, or Agent re-parent fails closed instead of relying on the indistinguishable Off/Pinned disabled proxy policy or a stale parent snapshot. Native DSH request-series/SystemPrompt handling then clears or consolidates stale system nodes. Retiring an active M5C contribution leaves one next-request fence so M5C runtime hot-detach/recompose does not leak old pinned instructions while the bundle-level coordinator remains active. A permanent unload of the entire bundle necessarily removes that coordinator too; retained DSH has no cross-resume public seam for an already-unloaded plugin to force a later series, and synthetic core Session/Surface writes are deliberately rejected. Context Manager therefore restores its providers/hooks immediately on total unload but does not claim cleanup of already-admitted in-history pinned bytes after the bundle is gone. The retained 0.1.1 line predates this public field and its legacy prompt path does not rely on the fence for M5C correctness.

M5 is complete after model discovery, user invocation, Pinned instruction visibility, native-provider changes, dynamic scope changes, in-history reconciliation, and lifecycle cleanup are proven through supported DSH paths.

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

**Prompt library listing path** — metadata/diagnostics only; prompt bodies are fetched by targeted resource id and are not copied into ordinary library snapshots.

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
