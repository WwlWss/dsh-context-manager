# M4C2 — Agent-scoped Prompt Runtime

M4C2 is the first Context Manager milestone that deliberately changes model-visible DSH runtime composition.

M4A owns PromptResource storage. M4B owns PromptBinding Domain intent. M4C1 owns the semantic-placement-to-native-order compatibility boundary. M4C2 joins those pieces at runtime without taking ownership of AgentPreset selection, Session lifecycle, DSH prompt rendering, or native preset files.

The implementation must remain structurally compatible with every DSH package line retained by CI:

- 0.1.1-rc.2
- 0.1.2-rc.1
- 0.1.5-rc.1
- 0.1.5-rc.2
- 0.1.6-alpha.2

Current official source-forward DSH remains a separate review target.

## 1. Scope

M4C2 must:

- install Context Manager prompt/runtime-context runtime only inside live Agent scopes;
- adopt Agents already live when Context Manager loads or reloads;
- attach to later Agents through the public lifecycle event;
- select only the current global default Context Profile in M4C2 while keeping effective-profile selection independent from prompt registration;
- require exact `profile.basePreset === live Session preset identity`;
- re-resolve profile, bindings, PromptResources, and live preset identity on every prompt assembly;
- map the five semantic PromptPlacement values through the M4C1 compatibility adapter;
- preserve PromptBinding deterministic local order;
- preserve each PromptResource as an independent DSH interpolation unit;
- expose fresh runtime diagnostics/inspection without persisting runtime health;
- clean every registration on Agent disposal, plugin unload, and HMR/reload;
- prove actual model-visible behavior through real AgentLoop tests.

M4C2 must not:

- create Workspace or Session profile bindings;
- search for a fallback matching profile;
- substitute DSH's native default preset for a missing/null live identity;
- call native AgentPreset `select()`, `recompose()`, `mount()`, or authoring methods;
- rewrite Context Profile `basePreset`;
- register one native provider per PromptBinding/PromptResource;
- cache profile/resource/preset truth across model steps;
- emit synthetic `system-prompt/change` notifications for dynamic content edits;
- introduce a Context Manager prompt-template syntax;
- add an M8 rendered effective-preview engine;
- modify native preset files.

## 2. Runtime architecture

M4C2 uses a fixed Agent-scoped registration set:

```text
4 system-section placeholders
+ 1 runtime-context placeholder
+ 1 scoped system-prompt/assemble waterfall expander
```

The placeholders are empty and exist only to let native DSH place Context Manager extension slots using the M4C1 mapping. The single scoped waterfall resolves current Context Manager state once and replaces each visible placeholder with zero or more independent assembled contributions.

Conceptually:

```text
DSH Agent lifecycle
  agents.list() / agent/created
            |
            v
attach one Agent runtime
            |
   +--------+---------+
   |                  |
4 section slots   1 context slot
   |                  |
   +--------+---------+
            |
system-prompt/assemble waterfall
            |
EffectiveProfileResolver
            |
global default profile
            |
exact M3B live preset fence
            |
PromptPlan resolver
            |
sorted bindings + deduped resource reads
            |
expand placeholders in-place
            |
next() / remaining native waterfall
            |
native complete/suppression/interpolation
            |
model
```

This replaces the earlier design of five text-producing aggregate providers plus a `WeakMap<AssembleContext, Plan>`.

## 3. Why placeholders instead of one concatenated aggregate string

PromptResource content must keep independent DSH interpolation boundaries.

If two resources are concatenated before native interpolation, text that is harmless in isolation can accidentally form a new cross-resource `{{variable}}` group. Example:

```text
resource A:  foo {{
resource B:  bar}}
```

Each resource can be independently valid/literal under DSH parsing rules, while concatenating them creates a new malformed/reference-shaped group.

M4C2 therefore expands one placeholder into one assembled contribution per eligible PromptBinding. Native DSH later interpolates each section/context independently.

This also preserves binding-level diagnostics: a native interpolation error names the individual Context Manager binding contribution rather than one large aggregate section.

## 4. No per-assembly WeakMap cache

The earlier aggregate-provider design needed shared per-assembly memoization because five callbacks could independently request the same resolution.

The placeholder design has exactly one resolving waterfall callback. It therefore resolves once by construction and does not need an `AssembleContext` cache.

Benefits:

- no reused-context stale-plan risk;
- no cleanup/finally protocol for WeakMap entries;
- no concurrency ambiguity when a caller reuses a context object;
- one explicit read boundary per assembly;
- next assembly always re-reads authoritative current state.

A local `Map<PromptResourceId, ResourceResolution>` inside one prompt-plan resolution is still required to deduplicate multiple bindings that reference the same resource. That map is discarded immediately after the assembly resolution.

## 5. EffectiveProfileResolver

Profile selection must be independent from DSH prompt registration.

M4C2 implements only:

```text
Session binding       future M9
Workspace binding     future M9
Global default        M4C2
       |
candidate profile
       |
exact basePreset / live Session preset identity
       |
active or diagnostic
```

The resolver consumes current Domain snapshot plus M3B SessionPresetIdentity and returns a runtime-only result.

Suggested shape:

```ts
type EffectiveProfileResolution =
  | { status: 'no-default-profile' }
  | {
      status: 'profile-unusable'
      configuredProfileId?: string
      reason:
        | 'schema-incompatible'
        | 'missing-default-profile'
        | 'invalid-default-profile'
    }
  | {
      status: 'preset-identity-unavailable'
      profileId: string
      reason: 'session-store-unavailable' | 'session-not-live'
    }
  | {
      status: 'base-preset-mismatch'
      profileId: string
      expectedPresetId: string
      actualPresetId: string | null
    }
  | {
      status: 'active'
      profileId: string
      profile: ContextProfile
      presetId: string
    }
```

Resolution order:

1. reject schema-incompatible Domain snapshots;
2. if no configured default exists, return `no-default-profile`;
3. if the configured default has no usable parsed profile, derive the specific unusable diagnostic from the current Domain snapshot;
4. observe the exact live Session preset identity through M3B;
5. `unavailable` and `not-live` remain distinct runtime diagnostics;
6. exact string equality is the only base-preset eligibility test;
7. `presetId: null` is an exact observed state and mismatches every string `basePreset`;
8. roster health is not consulted.

No native-default substitution is allowed. A deleted preset may be missing from the current roster while an already-live Session still records that exact preset id; the overlay remains eligible.

## 6. Prompt plan resolution

PromptPlan resolution runs only after EffectiveProfileResolver returns `active`.

Bindings are traversed in deterministic local order:

```text
order ascending
then PromptBindingId JavaScript code-unit ascending
```

Do not use `localeCompare()`.

Disabled bindings are recorded diagnostically and do not trigger Prompt Library reads.

For enabled bindings:

- read each unique `resourceId` at most once per assembly;
- missing resource -> binding-local `missing-resource`, continue;
- stored resource that exists but fails current PromptResource parsing -> binding-local `invalid-resource`, continue;
- empty-string content -> binding-local `empty-content`, no assembled contribution;
- whitespace-only content is authored content and must not be trimmed;
- unexpected infrastructure/Host failures propagate and fail the assembly.

Do not use a blanket `catch { return '' }`: storage/capability failure is not equivalent to an intentionally empty prompt.

Suggested binding states:

```text
disabled
missing-resource
invalid-resource
empty-content
eligible
```

Native final-assembly inspection may later refine eligible contributions to `present`, `suppressed`, or `transformed`.

## 7. Native contribution identity

Production registers stable placeholder names so duplicate leaked HMR registrations fail loud instead of silently double-injecting prompt text.

Suggested placeholders:

```text
dsh-context-manager:slot:before-persona
dsh-context-manager:slot:after-persona
dsh-context-manager:slot:before-tool-guidance
dsh-context-manager:slot:after-tool-guidance
dsh-context-manager:slot:runtime-context
```

Placeholder text is always `''`. Placeholders are not `complete` and do not request generation-specific interpolation behavior.

Expanded binding contribution names must not embed arbitrary raw BindingId directly. Use a stable log-safe encoding over UTF-16 code units (or an equivalent encoding that supports lone surrogates) rather than `encodeURIComponent()`.

The runtime should use `Map`, not user-keyed ordinary objects, for BindingId/PromptResourceId lookup caches.

## 8. Waterfall expansion semantics

The Agent-scoped listener runs before delegating to remaining listeners:

```ts
agentCtx.on('system-prompt/assemble', (assembly, context, next) => {
  resolve once
  replace visible Context Manager placeholders
  return next()
})
```

M4C2 must not wait for `next()` and then forcibly reinsert its content. Native/third-party expert waterfall listeners remain authoritative over the final assembly.

The expander searches for the fixed placeholder names and replaces each placeholder at its current array position. It does not re-sort the whole native assembly.

For each semantic system placement, zero or more independent assembled sections replace the placeholder.

For `runtime-context`, zero or more independent assembled contexts replace the context placeholder.

## 9. Runtime-context suppression

Native `suppressRuntimeContext()` is applied before the assembly waterfall. When active, the Context Manager runtime-context placeholder is absent from `assembly.contexts`.

The expander must interpret placeholder absence as native suppression and must not read PromptResources that are used only by suppressed runtime-context bindings.

This prevents unnecessary runtime-context resource reads on suppressed compositions and lets inspection identify native suppression from actual composed behavior rather than a preset-id special case.

## 10. Complete system-prompt behavior

Native complete sections are restored as the sole system section after the cooperative assembly waterfall. Therefore Context Manager system placeholders may still exist and be expanded before DSH restores the complete section.

M4C2 must not special-case `minimal` or any preset id to avoid those reads. A copied/custom composition can have the same complete behavior.

Accepted consequence:

- a candidate system PromptResource may be read during an assembly that later suppresses it through a native complete section;
- final native assembly/model output still excludes it;
- final diagnostics determine suppression from the returned native assembly;
- no Context Manager interpolation is performed before native complete restoration.

This is a public-seam limitation, not a reason to infer composition internals from preset ids.

## 11. Native interpolation contract

M4C2 stores and reads PromptResource content literally but delegates rendering/interpolation to DSH.

Do not silently set 0.1.6-only `PromptSection.interpolate = false`: older supported generations do not expose equivalent behavior and PromptContext remains native-interpolated.

Unknown/malformed/unvalued native `{{variable}}` references therefore fail on the native render path. M4C2 must not rewrite stored PromptResource content in response.

Each expanded binding remains a separate native interpolation unit.

## 12. Agent lifecycle compatibility boundary

Production continues the existing project rule: no runtime import/bundle dependency on DSH Agent packages merely to access lifecycle types. Consume Cordis capabilities structurally.

Minimum Agents capability:

```ts
interface HostAgent {
  readonly id: string
  readonly ctx: Context
}

interface AgentsCapability {
  get(id: string): unknown
  list(): readonly unknown[]
}
```

The lifecycle adapter also validates `agent/created` payload Agent shape.

Installation sequence:

1. wait for required `agents` and `systemPrompt` capabilities through Cordis dependency injection;
2. register the new-Agent listener before enumerating existing Agents;
3. attach every Agent in `agents.list()`;
4. track attachments by Agent object identity, not Session id;
5. later `agent/created` attaches exactly once;
6. Agent-scoped effect disposal removes registrations automatically on Agent teardown;
7. plugin-level disposal explicitly cleans all still-live attachments.

Reusing the same Session id with a new Agent object is a new lifecycle and must receive a new attachment.

## 13. Transactional attachment

Installing one Agent runtime registers several native effects. Partial installation must roll back.

If any placeholder or listener registration throws:

- dispose every registration already created for that Agent in reverse order;
- leave no partial Context Manager runtime on that Agent;
- propagate the error.

When adopting a set of already-live Agents, if one adoption fails during initial installation, previously adopted Agents from that installation attempt must also be cleaned before the capability installation fails.

Stable duplicate placeholder names intentionally turn leaked prior registrations into loud lifecycle failures rather than double prompt injection.

## 14. Dynamic edits do not re-register providers

The native registration set is fixed for the lifetime of one Agent attachment.

The following changes affect only the next fresh assembly:

- PromptResource content/revision;
- PromptBinding enabled/resourceId/order/placement;
- defaultProfileId;
- profile basePreset;
- live native AgentPreset switch.

M4C2 must not respond by disposing/re-registering native prompt providers.

Do not manually emit `system-prompt/change` for these dynamic content changes. Upstream defines that event around registry registration/disposal and the AgentLoop deliberately re-assembles per step instead of relying on invalidation signals.

## 15. Runtime inspection

M4C2 may expose a Host-only fresh inspection API for later Remote/UI diagnostics, but it must not maintain a last-assembly authoritative cache.

Suggested service:

```text
ctx.dshContextPromptRuntime.inspect(agentId)
```

Inspection:

1. finds the exact currently live Agent;
2. creates a fresh native assembly context for that Agent using public scope/agent fields where available;
3. invokes the same native SystemPrompt assembly path;
4. reuses the same Context Manager runtime resolver/expander;
5. compares Context Manager binding contribution identities with the final returned assembly.

Because `assemble()` returns resolved-but-not-yet-interpolated sections/contexts, M4C2 inspection must not call this state “fully model-effective rendered text”.

Per binding native state:

```text
present
suppressed
transformed
```

- `present`: its independent contribution survives with the text produced by Context Manager;
- `suppressed`: the contribution is absent from final native assembly;
- `transformed`: the named contribution remains but downstream expert assembly changed its text.

Fully rendered effective preview remains M8 territory. Real AgentLoop tests prove actual model-visible behavior.

## 16. Unload/HMR semantics

Cleanup must remove Context Manager registrations from every still-live Agent and stop future `agent/created` attachment.

M4C2 does not cancel active user turns merely because the plugin unloads.

Precise guarantee:

- an assembly that started before cleanup may finish using contributions it already resolved;
- after cleanup completes, every new fresh assembly has no Context Manager registration;
- reload can adopt already-live Agents once without duplicate providers.

## 17. Public/runtime read model

Runtime health remains separate from stored Domain state.

At minimum the effective-profile result distinguishes:

```text
no-default-profile
profile-unusable
preset-identity-unavailable
base-preset-mismatch
active
```

Per-binding plan state distinguishes:

```text
disabled
missing-resource
invalid-resource
empty-content
eligible
```

Fresh native inspection may refine eligible into:

```text
present
suppressed
transformed
```

Do not add runtime health fields to ContextProfile or PromptBinding persistence.

## 18. Planned code structure

```text
src/runtime/types.ts
src/runtime/effective-profile.ts
src/runtime/prompt-plan.ts
src/adapters/agent-runtime.ts
src/adapters/prompt-runtime.ts
src/service/prompt-runtime.ts
```

Responsibilities:

- `runtime/types.ts`: immutable runtime/effective vocabulary only;
- `effective-profile.ts`: pure global-default candidate + exact live preset fence;
- `prompt-plan.ts`: deterministic binding order, per-assembly resource dedupe, binding health;
- `agent-runtime.ts`: structural Agents/Agent lifecycle capability validation;
- `prompt-runtime.ts`: placeholder registration, safe contribution identities, waterfall expansion, final assembly classification helpers;
- `service/prompt-runtime.ts`: lifecycle orchestration and fresh inspection.

M4C1's prompt-placement adapter remains the only owner of native numeric placement ranks.

## 19. Commit sequence

Implement M4C2 as reviewable stages:

1. **docs: plan M4C2 agent-scoped prompt runtime**
   - this plan;
   - roadmap/architecture/development-guide synchronization;
   - still model-inert.

2. **feat: add effective profile runtime resolver**
   - pure runtime result types;
   - global-default source only;
   - exact M3B preset fence;
   - unit tests;
   - still model-inert.

3. **feat: add Agent runtime lifecycle compatibility bridge**
   - structural Agents capability;
   - existing/new Agent lifecycle;
   - transactional/idempotent cleanup tests;
   - still model-inert.

4. **feat: add scoped prompt placeholder runtime**
   - PromptPlan resolver;
   - fixed scoped placeholders;
   - single assembly expander;
   - first model-effective commit.

5. **feat: add prompt runtime inspection**
   - fresh Host inspection;
   - final native present/suppressed/transformed classification;
   - no persisted/last-result cache.

6. **test: prove M4C2 model-visible behavior across DSH**
   - five-generation public/runtime compatibility;
   - oldest/newest real AgentLoop recording-adapter E2E;
   - native preset switch and dynamic edit regressions.

## 20. Test matrix

### Pure resolver tests

- no default;
- schema incompatible;
- dangling default;
- invalid default profile;
- Session identity unavailable;
- Session not live;
- exact string match;
- exact mismatch;
- `presetId: null` mismatch without native-default substitution;
- deleted/missing roster fact does not participate in match.

### Prompt plan tests

- deterministic order + code-unit tie-break;
- disabled bindings do not read resources;
- duplicate resource references read once per assembly;
- missing resource isolated;
- invalid resource isolated;
- empty content isolated;
- whitespace-only content retained;
- placement partitioning;
- next resolution sees edited resource/binding immediately;
- unexpected Prompt Library failure propagates.

### Lifecycle tests

- adopts already-live Agents;
- attaches future Agents;
- same Agent object attaches once;
- same Session id on a new Agent object attaches separately;
- Agent disposal cleans scoped registrations;
- plugin unload cleans all live registrations;
- reload adopts surviving Agents;
- partial Agent attach rolls back;
- failed initial adoption rolls back previously adopted Agents.

### Native SystemPrompt tests

- placeholders occupy M4C1 slots;
- expansion preserves independent sections/contexts;
- runtime-context suppression prevents runtime-context resource reads;
- complete section removes final CM system contributions;
- downstream waterfall removal/transform is reflected in inspection;
- no provider re-registration across content/order/profile/preset changes;
- native interpolation errors propagate without storage rewrite.

### Five-generation compatibility lanes

Each retained DSH generation compiles/runs the structural Agents + SystemPrompt seams consumed by M4C2.

### Real AgentLoop E2E

At minimum oldest 0.1.1-rc.2 and newest 0.1.6-alpha.2 use a recording LLM adapter and a real live Agent.

Prove:

- matching profile reaches real model request;
- preset mismatch removes CM content;
- native A -> B -> A re-evaluates without re-registration;
- PromptResource edit is visible on next model step;
- binding order/edit/disable is visible on next model step;
- default profile change is visible on next model step;
- runtime-context appears through DSH's real runtime snapshot path;
- suppressing runtime context clears/removes stale CM runtime context through native semantics;
- complete composition suppresses system slots;
- template variable errors are native and stored resource remains unchanged;
- unload removes CM content from the next fresh assembly/request.

## 21. Exit criteria

M4C2 is complete only when:

- M4C1 numeric placement state remains encapsulated;
- all production Context Manager prompt/context registrations are Agent-scoped;
- existing/new Agent lifecycle and HMR cleanup are proven;
- global default is only a selection source, never a global provider;
- exact live preset identity gates contribution on every assembly;
- current bindings/resources are re-read every assembly;
- one resource is read at most once inside one plan;
- independent PromptResource interpolation boundaries are preserved;
- native complete/suppression behavior is diagnosed from actual composition, not preset ids;
- no cross-step truth cache or synthetic prompt-change signal exists;
- all retained DSH compatibility lanes are green;
- real AgentLoop E2E proves the same runtime resolution reaches model-visible requests.

At that point M4 is complete and Context Manager prompt configuration is genuinely model-effective.
