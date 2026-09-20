# M5C — Pinned full-instruction runtime

## Status

Planned implementation for PR M5C, based on main after merged M5B (PR #16).

M5C is the final M5 runtime slice. M5B already makes `Pinned` non-invocable through native model/user Skill surfaces. M5C adds the separate model-facing full-instruction contribution.

## Contract re-audit and design change

The earlier roadmap intentionally left the exact Session/Surface/`agent/pre-step` seam unresolved. Re-audit across the retained DSH lines changes the implementation choice:

- `agent/pre-step` exists on all retained lines and can rewrite accepted messages, but accepted user messages are durable Session input. Injecting one pinned message every step would become append-only history.
- Session Surface replacement is public, but the replacement contract is not stable across the retained lines: the legacy shape uses `{ start, end }`, while newer lines use branded `{ startSeq, endSeq }`; newer Session formats also add `system/message` as a surface node.
- `system-prompt/assemble`, `SystemPrompt.section()`, scoped Agent composition, and the M4C1 placement adapter are already proven across the retained five-generation matrix.

Therefore M5C uses one Agent-scoped, Context-Manager-owned **system-prompt replacement slot**. The slot is registered once and starts empty. Every native prompt assembly re-resolves the current effective profile and parent native Skill view, then replaces that slot with the current pinned bundle or removes it from the assembly.

This gives the required replacement/clear semantics without writing repeated pinned bodies into durable Session history.

## Semantics

For one live Agent and one assembly:

1. Resolve the effective Context Manager profile with the same exact base-preset gate used by M4C2/M5B.
2. Select bindings whose mode is exactly `pinned`, sorted by skill name in JavaScript code-unit order.
3. Resolve Skill winners through the **dynamic parent scope** of the Agent, never the Agent view. This bypasses the M5B policy proxy while preserving native global/preset precedence.
4. If parent catalog discovery is incomplete, do not load or inject bodies for that assembly; inspection reports `catalog-incomplete`.
5. For each known pinned winner, lazily load the native definition from the same parent view.
6. Render each loaded definition with DSH native `renderSkillContent()` so resource hints, provider identity, escaping, and canonical `<skill_content>` framing remain native-owned.
7. Join rendered blocks deterministically into one Context Manager bundle.
8. Replace the one fixed CM slot with that bundle. An empty bundle removes the slot from the current assembly.

Pinned does **not**:
- make a Skill model-invocable;
- make a Skill user-invocable;
- fabricate a missing native Skill;
- load through the Agent-scoped M5B proxy;
- append a new Session message per step.

## Placement

M5C contributes a system-prompt section, not runtime-context history.

The section sits in the already-proven semantic tool-guidance extension region:
- after M4's `after-tool-guidance` placeholder;
- before the native generated tool protocol boundary.

M4C1 resolves the native anchor. M5C derives a distinct finite order inside the same integer gap, rather than hard-coding a new Host generation table.

The fixed name is:

```text
dsh-context-manager:slot:pinned-skills
```

A native `complete: true` system-prompt section may suppress this slot. Inspection must report that suppression instead of claiming the pinned bundle is model-visible.

## Cancellation and hot-path behavior

The AgentLoop passes the turn AbortSignal through `assembleContextFor(agent, signal)` on every retained generation. M5C forwards that signal to parent Skill discovery/body loading.

There is no M5C cross-step cache.

Caching/invalidating remains native-owned:
- Context Manager profile state is re-read each assembly;
- Agent parent identity is re-read each assembly;
- SkillRegistry owns its own catalog cache/revision;
- provider invalidation naturally changes the next assembly;
- M5C does not listen to `skills/change` and does not create an invalidation loop.

## Missing and incomplete state

A missing configured pinned Skill is diagnostic only.

Per-binding inspection states:

```text
present
missing-native-skill
catalog-incomplete
definition-unavailable
```

Assembly-level visibility additionally distinguishes:

```text
empty
present
native-suppressed
transformed
```

Inspection never exposes full Skill body content.

## Lifecycle

M5C reuses `attachAgentRuntimeBridge()`:
- adopt already-live Agents;
- attach future Agents;
- dispose exact Agent registrations;
- roll back partial attachment failures;
- unload/reload without duplicate slots/listeners.

Repeated steps and changes therefore behave as follows:

```text
Pinned -> Pinned edit/provider change : next assembly replaces bundle
Pinned -> Off/Manual/Auto             : next assembly clears bundle
basePreset A -> B mismatch            : next assembly clears bundle
basePreset A -> B -> A                : bundle disappears then returns
runtime unload                        : CM slot/listener disappears
runtime reload                        : exactly one slot/listener returns
```

## Planned code

```text
docs/m5c-plan.md

src/adapters/skill-view.ts
src/adapters/pinned-skill-runtime.ts
src/runtime/types.ts
src/service/pinned-skill-runtime.ts
src/index.ts

tests/pinned-skill-runtime.test.mjs
tests/pinned-skill-runtime-agent-loop.e2e.mjs
.github/workflows/ci.yml

README.md
docs/roadmap.md
docs/architecture.md
docs/compatibility.md
docs/development-guide.md
```

The small shared `skill-view.ts` helper centralizes dynamic parent lookup, cwd extraction, and signal composition already needed by M5B and M5C. M5B behavior must remain unchanged under its existing regression matrix.

## Required tests

Unit/runtime:
- no pinned bindings => no body loads and no final slot;
- deterministic code-unit ordering;
- canonical `renderSkillContent()` including directory/url/opaque resource hints;
- parent native definition is loaded, never the CM proxy;
- incomplete catalog => no body loads and no overclaim;
- missing native Skill => no fabricated content;
- definition disappearing between snapshot/get => diagnostic without stale content;
- current assembly signal aborts in-flight body load;
- native complete section suppresses slot and avoids unnecessary body loads where observable;
- repeated assemblies produce one current bundle, not accumulated messages;
- Pinned -> Off/Manual/Auto clears on the next assembly;
- base-preset A -> B -> A clears/restores;
- dynamic parent rebind changes the underlying native winner;
- provider invalidation/body change appears on next assembly;
- unload/reload leaves no duplicate registration.

Real AgentLoop E2E on oldest and newest retained lines:
- Pinned body appears in the actual model request;
- Pinned description/native Skill catalog remains hidden by M5B;
- `skill` tool and explicit `/skill` invocation remain disabled;
- resource hint text comes from native `renderSkillContent()`;
- mode changes clear/restore the body without historical duplicate accumulation in subsequent requests;
- preset mismatch bypasses both M5B policy and M5C body injection;
- unload restores stock behavior; reload restores one pinned bundle.

## Exit criteria

M5 is complete when:
- Auto remains native pass-through;
- Manual is user-only;
- Off is absent from managed model/user invocation;
- Pinned is absent from native discovery/invocation but its full underlying native instructions are visible through exactly one CM-owned replacement bundle;
- provider/profile/preset changes take effect without stale cross-step state;
- inspection states what is actually visible and does not expose bodies;
- oldest/current real AgentLoop E2E and the retained-generation contract/runtime matrix pass.
