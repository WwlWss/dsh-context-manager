# M5B — Agent-scoped Skill Policy Overlay

M5B is the first model-effective Skill milestone. It applies Context Manager skill modes through DSH's native scoped SkillRegistry without replacing source providers, rewriting skill files, or injecting Pinned full instructions.

M5A already established the compatibility/runtime foundation:

- five-generation Skill/Scope public contract coverage;
- targeted default-profile runtime reads;
- exact effective-profile / live-preset fence reuse;
- `dsh-context-manager/change` authority invalidation;
- dynamic scope rebind behavior;
- provider-candidate ownership validation;
- same-layer rank/tie behavior.

M5B consumes those seams. M5C remains responsible for the durable Pinned full-instruction bundle.

## 1. Product semantics

| Mode | Native model discovery/load | Native user invocation | Pinned body |
| --- | --- | --- | --- |
| Auto | preserve native winner exactly | preserve native winner exactly | none |
| Manual | disabled | enabled | none |
| Off | disabled | disabled | none |
| Pinned | disabled | disabled | M5C only |

Rules:

- Auto is a true no-override state. Never coerce it to `true / true`.
- Manual resolves to `{ modelInvocable: false, userInvocable: true }`.
- Off resolves to `{ modelInvocable: false, userInvocable: false }`.
- Pinned resolves to the same native invocation policy as Off. M5C later supplies the full instructions separately.
- A missing bound skill is diagnostic state. Context Manager must not fabricate a skill definition.

## 2. Native DSH behavior M5B relies on

Across all retained generations:

- the live Agent object is the Skill lookup scope key;
- AgentPreset composition binds that Agent key to a standing preset scope, forming `agent -> preset -> global`;
- `scopeParentOf(agent)` observes the current parent and changes after preset recompose;
- SkillRegistry catalog resolution follows that live scope chain without requiring an explicit registry invalidation for a parent rebind;
- nearest scope wins duplicate names before same-layer rank is considered;
- lower candidate rank wins within one scope layer;
- `Number.MAX_VALUE` is the largest finite numeric rank and therefore the lowest-priority finite rank;
- equal ranks tie on provider registration order;
- provider candidates must advertise the provider that returned them;
- `get()` is policy-neutral; DSH consumers apply `modelInvocable` / `userInvocable`;
- DSH ToolSkill filters model catalog/tool loading by model policy and user `/skill` loading by user policy.

Therefore M5B changes only the Agent-scoped winning Skill definition. Native model/user consumers continue unchanged.

## 3. Runtime architecture

Install exactly one Context Manager Skill provider per live Agent.

```text
DSH SkillRegistry
    |
global providers
    |
standing AgentPreset scope
    |
live Agent scope
    |
Context Manager policy provider
```

The provider is fixed for the Agent lifetime. Binding changes do not register/unregister providers; they invalidate the registry catalog and the provider re-reads current effective state.

Use the existing `attachAgentRuntimeBridge()` for:

- existing Agent adoption;
- future `agent/created`;
- exact Agent object identity;
- attach races;
- same-id replacement;
- transactional initial rollback;
- Agent disposal;
- plugin unload/reload.

## 4. Dynamic parent lookup

Never cache the Agent's parent scope.

Every provider `list()` and `get()` must call:

```ts
scopeParentOf(agent)
```

at execution time.

A blank-session preset recompose may move the same Agent key from preset A to preset B without recreating the Agent or invalidating the Skill registry. Dynamic parent reads are therefore correctness-critical.

If there is no parent scope, the parent view is the global Skill layer and the lookup omits `scope`.

## 5. Provider identity

Provider name:

```text
dsh-context-manager-policy
```

Every proxy `SkillCandidate.provider` must equal that name because DSH validates candidate ownership.

Underlying native provider identity must be retained separately in the proxy locator/inspection metadata.

Loaded SkillDefinitions should preserve native definition provenance and content whenever the public contract permits:

- native `provider`;
- `source`;
- `resourceBase`;
- `path`;
- `metadata`;
- `content`.

M5B changes only `invocation`.

The five-generation production contract must explicitly test this loaded-definition behavior rather than assuming it.

## 6. Provider list()

Provider discovery stays metadata-only.

Algorithm:

1. Resolve current effective profile using the same targeted default-profile + M3B live preset fence as M4C2.
2. If inactive, return an empty complete observation.
3. Select only non-Auto bindings, sorted deterministically by skill name.
4. Resolve the current parent scope with `scopeParentOf(agent)`.
5. Read the native parent catalog through `ctx.skills.snapshot({ cwd, signal, scope: parent })`.
6. Match managed bindings by exact skill name.
7. Missing native skills produce no proxy candidate.
8. For each matched binding, emit one CM-owned proxy candidate:
   - original name/description/whenToUse/source/resourceBase as available;
   - `provider: dsh-context-manager-policy`;
   - `rank: Number.MAX_VALUE`;
   - managed invocation policy;
   - locator with enough native identity to diagnose/reload safely.
9. Propagate parent `snapshot.complete`.

Discovery must never call `skills.get()` or otherwise read full skill bodies.

## 7. Provider get()

Body loading is lazy.

For the requested proxy candidate:

1. Re-read the current effective profile.
2. Re-read `scopeParentOf(agent)`.
3. Load the current native winner through the parent view with `ctx.skills.get(name, ...)`.
4. If the native definition disappeared, return `undefined`.
5. Re-read the current binding mode from the effective profile.
6. If the profile became inactive, binding disappeared, or binding became Auto, return the current native definition unchanged.
7. Otherwise return the native definition with only `invocation` replaced by the current managed policy.

The binding mode stored in the proxy candidate/locator is diagnostic metadata only and is not policy authority. This closes the window between a synchronous Settings state change and asynchronous registry invalidation delivery.

## 8. Cancellation

Every parent lookup must respond to both:

- caller `options.signal`;
- registration-scoped `SkillProviderControl.signal`.

Use one combined signal when both exist. Agent/runtime/provider disposal must therefore abort in-flight discovery/body loads even if the caller signal remains live.

## 9. Context Manager invalidation

M5A publishes:

```text
dsh-context-manager/change
```

One authority change must cause at most one registry-wide Skill invalidation.

DSH `SkillProviderControl.invalidate()`:

- increments the registry catalog revision;
- clears completed collect caches globally;
- emits `skills/change`.

Therefore M5B must not call `invalidate()` once per live Agent.

The Skill runtime tracks currently active provider controls and selects one non-aborted control as an invalidation coordinator:

```text
one CM change
    |
one active CM control.invalidate()
    |
one SkillRegistry revision/event
```

If no live provider exists, no invalidation is necessary; a later Agent provider reads current Domain state on first discovery.

Never listen to `skills/change` merely to trigger CM invalidation.

## 10. Same-layer precedence

The CM candidate uses:

```ts
rank: Number.MAX_VALUE
```

This intentionally lets ordinary Agent-local candidates with lower ranks win.

Consequences:

- a nearer/lower-rank Agent-local skill can defeat a Context Manager Manual/Off/Pinned proxy;
- an equal-`Number.MAX_VALUE` Agent-local candidate ties on provider registration order.

M5B must not claim policy is effective when another same-layer candidate actually wins.

## 11. Runtime inspection

Add:

```ts
ctx.dshContextSkillRuntime.inspect(agentId)
```

Inspection is metadata-only and must never load skill bodies.

Suggested result shape:

```ts
type SkillRuntimeInspection =
  | { status: 'runtime-unavailable' }
  | { status: 'agent-not-live'; agentId: string }
  | {
      status: 'resolved'
      agentId: string
      profile: EffectiveProfileResolution
      catalogComplete: boolean
      bindings: readonly SkillRuntimeBindingInspection[]
    }
```

Binding states:

- `native-pass-through` — Auto; report current native provider/policy if present;
- `policy-applied` — the CM proxy is the actual Agent-view winner;
- `policy-not-effective` — another Agent-view provider wins the same name;
- `missing-native-skill` — managed binding exists but parent catalog has no native skill;
- `catalog-incomplete` — parent discovery is incomplete, so absence/effectiveness cannot be claimed.

Inspection should expose enough metadata to debug provider precedence without exposing full skill bodies.

## 12. Production dependencies and packaging

M5B production code imports public DSH Skill/Scope APIs, so add peer dependencies for:

- `@deepseek-ai/dsh-skill`;
- `@deepseek-ai/dsh-scope`.

Development baseline uses the legacy retained generation.

Both tsdown configurations must externalize those Host packages.

In particular, **never bundle `@deepseek-ai/dsh-scope`**. Host preset composition and Context Manager must share the exact same scope-parent state/module identity.

Packed-package strict-peer smoke must include the new peers.

## 13. Files

Expected production files:

```text
src/runtime/skill-policy.ts
src/adapters/skill-runtime.ts
src/service/skill-runtime.ts
src/runtime/types.ts
src/index.ts
package.json
pnpm-lock.yaml
tsdown.config.ts
tsdown.prepare.config.ts
```

Implemented tests/CI:

```text
tests/skill-policy.test.mjs
tests/skill-runtime.test.mjs
tests/skill-runtime-service.test.mjs
tests/skill-runtime-agent-loop.e2e.mjs
.github/workflows/ci.yml
```

M5B does not add or modify durable Pinned instruction storage/injection. That is M5C.

## 14. Test matrix

### Pure policy

- Auto returns no override.
- Manual -> false/true.
- Off -> false/false.
- Pinned -> false/false.
- deterministic skill-name order.

### Provider behavior

- inactive profile -> no proxy candidates;
- Auto -> no proxy;
- Manual/Off/Pinned -> expected proxy invocation;
- missing native skill -> no fabricated candidate;
- parent incomplete -> incomplete observation propagates;
- discovery performs zero native `get()` calls;
- body loads lazily on proxy `get()`;
- current binding mode is re-read on `get()`;
- current parent scope is re-read on both `list()` and `get()`;
- caller + provider abort signals cancel parent work;
- loaded definition preserves native provenance/content with only invocation patched where supported.

### Runtime/lifecycle

- existing Agents adopted;
- new Agents attached;
- Agent disposal removes bookkeeping/provider;
- same-id replacement stays exact-identity safe;
- partial attach failure rolls back;
- plugin unload restores stock Skill behavior;
- reload creates no duplicate provider;
- one CM change with many Agents produces one registry invalidation;
- no `skills/change` feedback loop.

### Scope/precedence

- global -> preset -> Agent nearest-layer behavior;
- preset A -> B rebind changes parent winner without manual invalidate;
- lower-rank Agent-local candidate beats CM proxy;
- equal MAX_VALUE tie follows registration order;
- inspection reports `policy-not-effective` when CM loses.

### Native consumer E2E

Run real oldest/newest ToolSkill + AgentLoop tests.

Auto:
- preserve a deliberately non-default native policy.

Manual:
- absent from model catalog/tool;
- explicit user `/skill` still injects the native body.

Off:
- absent from model catalog/tool;
- explicit user `/skill` does not load/inject.

Pinned in M5B:
- same native behavior as Off;
- no full body appears unless M5C later supplies it.

## 15. Commit sequence

1. `docs: plan M5B Agent-scoped Skill policy overlay`
2. `build: add native Skill Scope runtime peers`
3. `feat: add pure Skill policy resolution`
4. `feat: add Agent-scoped Skill policy provider`
5. `feat: add Context Manager Skill runtime service`
6. `test: lock five-generation M5B Skill policy behavior`
7. `test: prove native ToolSkill behavior on oldest and newest DSH`
8. `docs: mark M5B complete and M5C next`

## 16. Exit criteria

M5B exit criteria (satisfied by PR #16):

- Auto preserves the actual native winning policy;
- Manual/Off/Pinned alter native model/user invocation exactly as specified;
- source skill files/providers remain untouched;
- discovery remains metadata-only;
- body loading remains lazy;
- missing skills are not fabricated;
- dynamic preset rebinds are honored without cached parent identity;
- one authority edit creates at most one registry invalidation regardless of live Agent count;
- same-layer precedence limitations are observable rather than silently misreported;
- unload/reload restores stock behavior without leaks;
- five retained DSH generations pass the production policy contract;
- oldest/newest real ToolSkill/AgentLoop E2E prove model and user surfaces;
- M5C can consume the same effective-profile/native-parent seams without redesigning M5B.
