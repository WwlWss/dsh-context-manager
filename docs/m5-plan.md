# M5 — Skill Policy Runtime

M5 makes Context Manager skill bindings model-effective without replacing DSH's native Skill registry, filesystem provider, user invocation surfaces, or Agent lifecycle.

The implementation is split into three reviewable parts:

- **M5A — compatibility + runtime foundation**: model-inert. Pin the public Skill/Scope contracts, add a targeted default-profile read path, move M4C2 off whole-library profile normalization, and publish one Context Manager invalidation event for later runtime caches.
- **M5B — Agent-scoped Skill invocation policy overlay**: make Auto / Manual / Off / Pinned discovery and invocation semantics effective through a native Agent-local Skill provider shadow.
- **M5C — Pinned durable instruction bundle**: inject full pinned instructions through one Context Manager-owned durable Session/Surface replacement contribution, not repeated append-only pre-step copies.

M5 must remain structurally compatible with every DSH package line retained by CI:

- 0.1.1-rc.2
- 0.1.2-rc.1
- 0.1.5-rc.1
- 0.1.5-rc.2
- 0.1.6-alpha.2

Current official source-forward DSH remains a separate review target.

## 1. Product semantics

Context Manager skill modes mean:

| Mode | Model discovery / model load | User invocation | Context Manager pinned instructions |
| --- | --- | --- | --- |
| Pinned | hidden | hidden | included |
| Auto | preserve native winning definition | preserve native winning definition | not included |
| Manual | hidden | allowed | not included |
| Off | hidden | hidden | not included |

Important consequences:

- **Auto is native pass-through.** Context Manager must not force `{ modelInvocable: true, userInvocable: true }`; the native winning skill's invocation policy stays authoritative.
- Manual / Off / Pinned are managed overlays over a native definition. Manual resolves to `{ modelInvocable: false, userInvocable: true }`; Off and Pinned resolve to `{ modelInvocable: false, userInvocable: false }`. Context Manager never edits the source skill file or replaces the filesystem provider.
- Pinned is not a synonym for native model discovery. Full instructions are deliberately supplied by Context Manager through the later M5C context contribution.

## 2. M5A scope

M5A is deliberately model-inert.

It must:

- prove the public Skill/Scope contract on all retained DSH generations before production Skill integration starts;
- add a targeted read for the current configured default profile;
- move M4C2 effective-profile resolution to that targeted read;
- preserve every existing EffectiveProfileResolution status and exact base-preset fence;
- publish one process-local Context Manager invalidation event from the authoritative Settings lifecycle;
- update roadmap/architecture/compatibility/development guidance to mark M4 complete and M5A current.

M5A must not:

- register a SkillProvider;
- alter any native skill invocation policy;
- hide or expose skills;
- inject Pinned instructions;
- add a production dependency on `@deepseek-ai/dsh-skill` or `@deepseek-ai/dsh-scope` merely for compatibility tests;
- cache runtime truth across model steps.

## 3. Why the targeted default-profile read comes first

M4C2 currently calls the full Context Manager Domain snapshot on every prompt assembly. The full snapshot normalizes every stored profile and therefore parses every skill and prompt binding even though the runtime only needs the configured default candidate.

M5 would add another per-step skill consumer. Repeating the whole-library normalization in both prompt and skill runtime would turn a known O(profile-library) editor read into a hot-path cost.

M5A therefore adds a targeted read that resolves only:

```text
schemaVersion
     |
defaultProfileId
     |
exact stored payload for that id
     |
parse one profile
```

It must not enumerate the profile library.

Suggested public Domain read model:

```ts
export type DefaultProfileCandidate =
  | {
      readonly status: 'schema-incompatible'
      readonly configuredProfileId?: string
    }
  | {
      readonly status: 'no-default-profile'
    }
  | {
      readonly status: 'missing-default-profile'
      readonly profileId: string
    }
  | {
      readonly status: 'invalid-default-profile'
      readonly profileId: string
    }
  | {
      readonly status: 'candidate'
      readonly profileId: string
      readonly profile: ContextProfile
    }
```

This read is Domain state, not effective runtime state. It does not observe AgentPreset identity, native skill state, PromptResources, or roster health.

## 4. EffectiveProfileResolver after M5A

M4C2 and future M5 runtime must share one exact eligibility fence.

After M5A:

```text
ContextManagerService.defaultProfileCandidate()
                 |
                 v
         EffectiveProfileResolver
                 |
       M3B live preset identity
                 |
 exact profile.basePreset === live presetId
```

The resolver keeps the current runtime result vocabulary:

- `no-default-profile`
- `profile-unusable`
  - `schema-incompatible`
  - `missing-default-profile`
  - `invalid-default-profile`
- `preset-identity-unavailable`
- `base-preset-mismatch`
- `active`

There is still no native-default substitution, fallback profile search, roster-health gate, or profile rewrite.

## 5. Context Manager invalidation event

M5B needs a way to invalidate DSH SkillRegistry provider catalogs when authoritative Context Manager state changes.

M5A publishes one process-local event:

```text
dsh-context-manager/change
```

The event means only:

> The authoritative resolved Context Manager Domain may have changed. Derived runtime caches should pull current state again.

It carries no profile payload, diff, or revision.

The event is emitted from the existing Settings section lifecycle's `onChange` hook. DSH already calls that hook after:

- Settings provider attachment;
- committed resolved section changes;
- Settings provider detachment back to the composition fallback.

DSH suppresses the consumer hook during the consumer's own unload, so Context Manager must not duplicate that lifecycle logic.

M5B may react to this event by calling the exact borrowed `SkillProviderControl.invalidate()` for each attached Agent provider.

Context Manager must **not** listen to `skills/change` and recursively invalidate its own provider. `skills/change` is the downstream native notification produced by SkillRegistry invalidation, not Context Manager's authority source.

## 6. Upstream Skill contract pinned by M5A

The M5A compatibility lane must compile and execute the public seams production M5B/M5C will rely on.

Required Skill seams:

- `SkillRegistry.registerProvider(create)`;
- `SkillProviderControl.signal`;
- `SkillProviderControl.invalidate()`;
- `SkillRegistry.list()`;
- `SkillRegistry.snapshot()`;
- `SkillRegistry.get()`;
- `SkillInvocationPolicy.modelInvocable`;
- `SkillInvocationPolicy.userInvocable`;
- finite numeric `SkillCandidate.rank`;
- `skills/change`;
- `renderSkillContent()`.

Required Scope seam:

- `scopeParentOf()`;
- nearest-scope shadow behavior.

The runtime fixture must prove:

1. nearest scope wins a duplicate skill name over farther layers;
2. rank orders duplicates only within one layer;
3. `Number.MAX_VALUE` is accepted as a finite rank;
4. equal ranks still fall through to provider registration order;
5. `control.invalidate()` invalidates completed catalog state and publishes `skills/change` only while that exact provider registration remains active;
6. disposed provider controls no longer invalidate the registry;
7. all four invocation-policy boolean combinations survive the registry;
8. `get()` remains invocation-policy-neutral;
9. `renderSkillContent()` remains the canonical full-body rendering seam;
10. `scopeParentOf()` observes the live parent relationship used by M5B.

## 7. Rank and same-layer shadow boundary

DSH resolution is:

```text
nearest scope layer
    |
lower candidate rank
    |
provider registration order
    |
candidate local order
```

M5B intends to register its managed shadow in the Agent layer with:

```ts
rank: Number.MAX_VALUE
```

This is the lowest public finite rank and therefore gives ordinary Agent-local candidates every normal rank opportunity to win.

It is **not** an absolute mathematical guarantee that Context Manager can never win a same-layer duplicate: another candidate may also use `Number.MAX_VALUE`, in which case provider registration order breaks the tie.

M5A must pin this upstream fact in the runtime fixture. M5B may only claim the hard same-layer behavior actually proven by its real Agent lifecycle and registration-order tests.

## 8. M5B planned overlay architecture

M5B is expected to install exactly one Context Manager Skill provider per live Agent.

Conceptually:

```text
native SkillRegistry
      |
global / preset / Agent layers
      |
Agent-local CM provider
      |
current effective Context Profile
      |
managed skill bindings
```

For each currently managed binding:

- resolve the native winning definition from the parent view, not from the Agent view that already contains the CM provider;
- Auto contributes no shadow;
- Manual contributes the same definition metadata/body with `{ modelInvocable: false, userInvocable: true }`;
- Off contributes the same definition with both invocation booleans false;
- Pinned also contributes both invocation booleans false; its full instructions come only from M5C's separate durable Context Manager bundle.

The exact adapter and diagnostics remain M5B work, after M5A's contract lane is green.

## 9. M5C planned Pinned instruction bundle

Pinned full instructions must not be appended once per pre-step forever.

M5C should maintain one Context Manager-owned durable replacement contribution representing the current ordered Pinned bundle for the effective profile.

Properties:

- one owned bundle, not one durable record per step;
- native `renderSkillContent()` for each pinned definition;
- deterministic skill-name order unless future binding metadata introduces an explicit order;
- refreshed when effective profile, binding modes, or native definitions change;
- removed/replaced when the profile becomes ineligible;
- no duplicate durable accumulation across turns, resume, HMR, or native preset switching.

The exact Session/Surface seam is re-reviewed when M5C starts.

## 10. Planned M5A code structure

M5A should touch:

```text
docs/m5-plan.md
src/domain/model.ts
src/domain/normalize.ts
src/service/context-manager.ts
src/runtime/effective-profile.ts
src/service/prompt-runtime.ts
tests/default-profile-candidate.test.mjs
tests/effective-profile.test.mjs
tests/context-manager.test.mjs
tests/skill-runtime-upstream-contract.ts
tests/skill-runtime-upstream-runtime.mjs
.github/workflows/ci.yml
README.md
docs/roadmap.md
docs/compatibility.md
docs/development-guide.md
```

M5A should not add:

```text
src/adapters/skill-runtime.ts
src/runtime/skill-policy.ts
src/service/skill-runtime.ts
```

Those belong to M5B.

## 11. M5A commit sequence

1. **docs: plan M5 skill policy runtime**
2. **test: pin upstream skill runtime contracts**
3. **perf: add targeted default profile candidate read**
4. **refactor: move M4 runtime to targeted profile resolution**
5. **feat: publish Context Manager runtime invalidation event**
6. **docs: close M4 and establish M5A compatibility baseline**

## 12. M5A tests

### Targeted read

- schema incompatible;
- no configured default;
- missing configured default;
- stored-but-invalid configured default;
- valid candidate;
- exact profile identity retained;
- no profile-library enumeration;
- unrelated malformed sibling profiles do not participate;
- returned structures remain immutable.

### Effective profile regression

Every pre-M5A status remains unchanged after switching the resolver input from full snapshot to targeted candidate.

### Context Manager change event

- provider attach emits the authoritative-state invalidation;
- committed semantic write emits;
- external valid Settings publication emits;
- provider detach emits fallback invalidation;
- consumer unload does not synthesize a late invalidation;
- event has no payload and does not mutate stored state.

### Five-generation Skill runtime contract

All behaviors in section 6 run on every retained DSH version.

## 13. Exit criteria

M5A is complete only when:

- M4C2 no longer normalizes the whole profile library per prompt assembly;
- the targeted default candidate path has a regression that fails if implementation enumerates the full profile map;
- EffectiveProfileResolver preserves every existing runtime status and exact live-preset fence;
- one Context Manager authority invalidation event exists and follows native Settings attach/change/detach lifecycle;
- no SkillProvider is registered by production code;
- no skill invocation behavior changes;
- five retained DSH lines compile and execute the Skill/Scope contract used by future M5B;
- README/roadmap/compatibility/development docs describe M4 as complete and M5A as the current model-inert foundation.

Only then should M5B begin changing native skill behavior.
