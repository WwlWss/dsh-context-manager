# M5C — Pinned full-instruction runtime

## Status

Implemented in PR #17, based on main after merged M5B (PR #16).

M5C is the final M5 runtime slice. M5B already makes `Pinned` non-invocable through native model/user Skill surfaces. M5C adds the separate model-facing full-instruction contribution.

## Contract re-audit and design change

The earlier roadmap intentionally left the exact Session/Surface/`agent/pre-step` seam unresolved. Re-audit across the retained DSH lines changes the implementation choice:

- `agent/pre-step` exists on all retained lines and can rewrite accepted messages, but accepted user messages are durable Session input. Injecting one pinned message every step would become append-only history.
- Session Surface replacement is public, but the replacement contract is not stable across the retained lines: the legacy shape uses `{ start, end }`, while newer lines use branded `{ startSeq, endSeq }`; newer Session formats also add `system/message` as a surface node.
- `system-prompt/assemble`, `SystemPrompt.section()`, scoped Agent composition, and the M4C1 placement adapter are already proven across the retained five-generation matrix.

Therefore M5C uses one Agent-scoped, Context-Manager-owned **system-prompt replacement slot**. The slot is registered once and starts empty. Every native prompt assembly re-resolves the current effective profile and parent native Skill view, then replaces that slot with the current pinned bundle or removes it from the assembly.

For routes that support DSH's `systemPromptUpdate: 'in-history'`, changing a non-empty assembled prompt can otherwise append a newer complete system message after the cached history while leaving the older one on the Session surface. M5C therefore fingerprints the **final CM-owned pinned contribution** after the prompt waterfall with SHA-256. A separate process-local request-series coordinator owns the Agent-scoped `agent/pre-step` listener. When the active M5C guard reports a changed fingerprint, the coordinator preserves the downstream decision/messages and adds `startsRequestSeries: true`. If an M5C contribution retires after admitting real model-visible state, the coordinator keeps one next-request fence so the stale native system-prompt surface is reconciled even though the pinned slot itself has already disappeared. Native `SystemPromptProjection` then consolidates the system-prompt surface: old active system nodes are cleared and the head is replaced with the current complete prompt.

The first admitted request after attaching/re-attaching M5C also starts a fresh series, so a resumed Session does not depend on process-local knowledge of its prior pinned state. Only the fingerprint is retained between steps; full Skill bodies are never cached. Unchanged pinned state does not restart the request series and therefore preserves the normal KV-cache path.

This gives replacement/clear semantics without writing repeated pinned bodies into durable user-message history and without accumulating stale pinned system nodes on in-history routes.

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

The fixed section name is:

```text
dsh-context-manager:slot:pinned-skills
```

Pinned bodies must remain literal native Skill content. Retained DSH generations before 0.1.6 interpolate every assembled section and do not expose `interpolate: false`. M5C therefore uses one reserved Agent-scoped prompt variable:

```text
dsh_context_manager_pinned_skill_bundle
```

The section text is only `{{dsh_context_manager_pinned_skill_bundle}}`. The async assembly waterfall writes the already-rendered bundle into `assembly.variables`. DSH interpolation substitutes a variable value without rescanning that value, so arbitrary `{{...}}` text inside native Skill instructions remains literal on every retained generation.

A native `complete: true` system-prompt section suppresses this slot after the cooperative waterfall. Because DSH restores the complete section only after listeners return, M5C cannot know that suppression before loading the bundle. Inspection must report the final suppression instead of claiming visibility; M5C does not claim that complete-prompt assemblies avoid body loads.

## Cancellation and hot-path behavior

The AgentLoop passes the turn AbortSignal through `assembleContextFor(agent, signal)` on every retained generation. M5C forwards that signal to parent Skill discovery/body loading.

There is no M5C cross-step Skill/body cache. The only cross-step state is the SHA-256 fingerprint of the final CM-owned pinned prompt contribution used to decide whether the next accepted step must start a new request series.

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
loaded
missing-native-skill
catalog-incomplete
definition-unavailable
policy-not-effective
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
unchanged Pinned                       : same signature; no forced series restart
Pinned -> Pinned edit/provider change : next assembly replaces bundle + one native consolidation
Pinned -> Off/Manual/Auto             : next assembly clears bundle + one native consolidation
basePreset A -> B mismatch            : next assembly clears bundle + one native consolidation
basePreset A -> B -> A                : bundle disappears then returns, each transition consolidated
complete prompt suppress/restore      : final slot signature changes and is consolidated
runtime unload                        : CM slot/listeners disappear
runtime reload/resume                 : first admitted request consolidates once, then steady state
```

## Planned code

```text
docs/m5c-plan.md

src/adapters/skill-view.ts
src/adapters/pinned-skill-runtime.ts
src/runtime/types.ts
src/service/pinned-skill-runtime.ts
src/index.ts

tests/pinned-skill-runtime.runtime.mjs
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
- literal preservation of Skill bodies containing valid, unknown, malformed, and nested-looking `{{...}}` text on legacy prompt interpolation;
- parent native definition is loaded, never the CM proxy;
- incomplete catalog => no body loads and no overclaim;
- missing native Skill => no fabricated content;
- definition disappearing between snapshot/get => diagnostic without stale content;
- current assembly signal aborts in-flight body load;
- native complete section suppresses the final slot and inspection reports that suppression;
- repeated unchanged assemblies produce one current bundle without forced series restarts;
- in-history routes consolidate old system nodes on Pinned/body/suppression changes;
- Pinned -> Off/Manual/Auto clears on the next assembly;
- base-preset A -> B -> A clears/restores;
- dynamic parent rebind changes the underlying native winner;
- provider invalidation/body change appears on next assembly;
- unload/reload leaves no duplicate registration.

Real AgentLoop E2E on the oldest retained line, the first retained in-history line, and the newest retained line:
- Pinned body appears in the actual model request;
- Pinned description/native Skill catalog remains hidden by M5B;
- `skill` tool and explicit `/skill` invocation remain disabled;
- resource hint text comes from native `renderSkillContent()`;
- mode/body/suppression changes clear or replace stale pinned system nodes even with `systemPromptUpdate: 'in-history'`;
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
