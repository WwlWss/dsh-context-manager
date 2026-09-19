# M4C1 — DSH system-prompt placement compatibility adapter

M4C1 is the compatibility boundary between Context Manager's persisted semantic PromptPlacement vocabulary and DeepSeek Harness's native system-prompt/runtime-context ordering contract.

It remains **model-inert**. This milestone does not register Context Manager prompt providers on Agents, does not fetch PromptResource bodies for model use, and does not select an effective Context Profile. Those behaviors belong to M4C2.

## 1. Scope

M4B persists five semantic placements:

```text
before-persona
after-persona
before-tool-guidance
after-tool-guidance
runtime-context
```

M4C1 must translate those stable meanings into the currently composed public DSH Host contract without persisting or exposing native numeric prompt orders as Context Manager Domain state.

The adapter must:

- distinguish native system-prompt sections from native runtime-context contributions;
- support every DSH generation already retained by Context Manager CI;
- use public capability shape rather than package-version or fork identity branching;
- keep numeric order knowledge inside the compatibility adapter;
- fail loud when a present `systemPrompt` capability has an incompatible shape;
- keep capability absence distinct from malformed capability presence;
- remain side-effect free with respect to prompt registration.

M4C1 must not:

- call `systemPrompt.section()` or `systemPrompt.context()` in production;
- install Agent-scoped providers;
- read PromptResource content;
- resolve the global default profile;
- compare profile `basePreset` with a live Agent/Session preset;
- add per-assembly caching;
- implement effective preview;
- special-case a preset id such as `minimal`.

## 2. Reviewed upstream baselines

The public contract was re-read from the matching official DeepSeek Harness source for every install-tested generation.

| DSH line | Reviewed source commit | system-prompt ordering generation |
| --- | --- | --- |
| 0.1.1-rc.2 | `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e` | legacy numeric convention |
| 0.1.2-rc.1 | `cea08311a0d1004f405dc950f7353949d0b04e98` | named sparse allocation |
| 0.1.5-rc.1 | `183f08e9c6dde7e36cd2318eaee70b0da08fb35e` | named sparse allocation, persona prefix/suffix |
| 0.1.5-rc.2 | `fb2c4b9e698e30edb738bca4cf0618587db7d203` | named sparse allocation, persona prefix/suffix |
| 0.1.6-alpha.2 | `ddefc45fbc7f8e46dd73185e68295696d1297887` | named sparse allocation plus newer guidance slots |

At the time of this review, official `master` also resolves to `ddefc45fbc7f8e46dd73185e68295696d1297887`. Install-tested package claims and source-forward review remain separate evidence even while those commits currently coincide.

## 3. Stable public contract shared by all retained generations

Every retained generation exposes the same core registry semantics:

- `ctx.systemPrompt.section(PromptSection)` registers one ordered system-prompt section and returns a disposer;
- `ctx.systemPrompt.context(PromptContext)` registers one ordered dynamic runtime-context contribution and returns a disposer;
- scoped registrations shadow same-named global registrations;
- `systemPrompt.assemble()` resolves sections and contexts for one assembly;
- section and context orders are independent numeric sequences;
- `suppressRuntimeContext()` suppresses the complete runtime-context channel for the matching scope;
- an effective `complete: true` section is restored after the cooperative assembly waterfall as the sole system-prompt section;
- more than one effective complete section is an assembly error.

The Agent loop calls `systemPrompt.assemble(assembleContextFor(agent, signal))`. The base `@deepseek-ai/dsh-system-prompt` declaration defines `scope` and `signal`; `@deepseek-ai/dsh-agent` publicly augments `AssembleContext` with optional `agent?: Agent`, and `assembleContextFor()` supplies both `agent` and `scope` on the ordinary Agent path in all five retained generations.

M4C2 should still capture the owning Agent in the registration closure. That is an ownership/lifecycle design choice, not a claim that the public augmented assembly context lacks `agent`.

## 4. Legacy 0.1.1 ordering contract

0.1.1-rc.2 exports a single deployment persona at order `0` and documents the system-section convention directly:

```text
harness identity    -100
deployment persona     0
tool guidance      100-199
```

It does not expose `getSectionOrder()` or `getContextOrder()`.

The first-party runtime-context contributors already use:

```text
sandbox policy          110
approval policy         115
subagent delegation     120
```

Equal-order system sections are sorted only by numeric order on this line, so equal external ranks inherit stable JavaScript insertion order. Context Manager must not encode PromptBinding-local order as many native sections on this generation.

## 5. Named sparse ordering contract from 0.1.2 onward

0.1.2 introduces public `getSectionOrder()` and `getContextOrder()` lookups backed by centrally allocated sparse ranks.

The common boundaries needed by Context Manager are present on every 0.1.2+ retained line:

```text
persona opening                    0
PLAN_POLICY                      500
TEAM_POLICY                      600
PTC_ONLY                         800
FILE_REFERENCE                   900
TOOL_BASH                       1000
... ordinary/higher-level tool guidance ...
TOOLS_SDK                       5000
DELIVERABLE_FILE_REFERENCES     9000
STRUCTURED_OUTPUT               9900
```

The independent runtime-context sequence remains:

```text
SANDBOX_POLICY             110
APPROVAL_POLICY            115
SUBAGENT_DELEGATION        120
```

0.1.5 changes the persona representation from one `deployment:persona` section to `deployment:persona-prefix` at order `0` plus a late `deployment:persona-suffix` at `10200`. Context Manager's persona anchor means the **opening/prefix persona slot at order 0**. The suffix is a later DSH-owned section and is not a second Context Manager persona anchor.

0.1.6 adds ordinary textual guidance positions for computer use / MCP below `TOOLS_SDK`; this does not change the extension windows selected below.

From 0.1.2 onward equal-order sections use locale-independent code-unit section-name ordering after comparing numeric order.

## 6. Semantic placement mapping

M4C1 maps one future Context Manager **aggregate contribution per semantic anchor**. PromptBinding-local ordering stays inside the future resolved aggregate plan:

```text
PromptBinding.order ASC
then PromptBindingId code-unit ASC
```

M4C2 must concatenate/resolve bindings in that order. It must not turn individual PromptBinding order values into native DSH numeric section offsets.

### 6.1 System-section anchors

| Context Manager placement | 0.1.1 legacy | 0.1.2+ named sparse | Meaning |
| --- | ---: | ---: | --- |
| `before-persona` | `-1` | `-1` | after DSH opening/identity material, immediately before persona opening |
| `after-persona` | `1` | `1` | immediately after persona opening, before DSH policy/guidance groups |
| `before-tool-guidance` | `99` | `getSectionOrder('TOOL_BASH') - 1` (currently `999`) | after policy/invocation prelude, before ordinary tool guidance |
| `after-tool-guidance` | `200` | `getSectionOrder('TOOLS_SDK') - 1` (currently `4999`) | after ordinary/higher-level textual tool guidance, before generated tool protocol |

The modern adapter deliberately queries only named boundaries common to every 0.1.2+ retained generation. It does not probe an invalid persona key to distinguish `DEPLOYMENT_PERSONA` from `DEPLOYMENT_PERSONA_PREFIX`.

`after-tool-guidance` is defined against DSH's textual guidance grouping. It does not mean after tool schemas, because tool schemas are an independent assembly sequence. It also does not mean after generated protocol/final-output obligations: `TOOLS_SDK` is the next DSH group boundary.

### 6.2 Runtime-context anchor

`runtime-context` maps to the native `PromptContext` channel, never to a system-prompt section.

The retained contract places Context Manager's future aggregate context after the current DSH policy/delegation trio:

```text
0.1.1:          130
0.1.2+:         getContextOrder('SUBAGENT_DELEGATION') + 10
current result: 130
```

This is an independent context sequence. No cross-order relationship is implied between a context order and a system-section order.

## 7. Capability-shape detection

Production must not branch on `package.json`, semver strings, repository identity, or a patched-fork marker.

The adapter observes the optional `ctx.systemPrompt` service:

```text
service absent
  -> capability unavailable

section/context missing or malformed
  -> fail loud: unsupported systemPrompt API

getSectionOrder absent AND getContextOrder absent
  -> legacy convention

getSectionOrder present AND getContextOrder present
  -> named sparse convention

only one named-order method present / non-function
  -> fail loud: incompatible partial Host API
```

For the named sparse branch, the adapter reads only:

```text
TOOL_BASH
TOOLS_SDK
SUBAGENT_DELEGATION
```

Each returned boundary must be finite and leave room for the selected adjacent extension slot. Invalid or collapsed bounds fail loud instead of silently moving the user's placement to another anchor.

## 8. Template interpolation is native runtime semantics

M4A stores PromptResource content literally and never rewrites the stored body. That does not mean M4C2 bypasses DSH prompt rendering.

0.1.1 through 0.1.5 interpolate complete `{{variable}}` groups in system sections. 0.1.6 adds `PromptSection.interpolate?: boolean`, but PromptContext still follows native interpolation and M4B has no interpolation-mode field.

Therefore M4C1 does **not** introduce a version-specific literal-text mode and M4C2 must not silently set `interpolate: false` only on 0.1.6. The current cross-version runtime contract remains native DSH interpolation; native template-variable errors propagate while the stored PromptResource text remains unchanged.

If Context Manager later wants an author-controlled literal-brace mode, that requires an explicit Domain vocabulary and a separate compatibility review.

## 9. Complete sections and runtime-context suppression

The adapter maps where a contribution can be registered. Registration capability is not the same as final effective capability for one Agent composition.

Two stable native behaviors matter to M4C2:

- an effective `complete: true` section removes other system-prompt sections from the final assembled section list;
- an active runtime-context suppressor removes runtime-context contributions from the final assembled context list.

M4C1 must not special-case the shipped `minimal` preset. M4C2 diagnostics must determine whether Context Manager's own registered aggregate contribution survives the actual native assembly/composition and report suppression without relocating the binding.

## 10. Planned code structure

M4C1 adds a narrow Host adapter:

```text
src/adapters/prompt-placement.ts
```

Conceptually:

```ts
type NativePromptPlacementTarget =
  | { channel: 'section'; order: number }
  | { channel: 'runtime-context'; order: number }

type NativePromptPlacementCompatibility =
  | { status: 'unavailable' }
  | {
      status: 'available'
      targets: Record<PromptPlacement, NativePromptPlacementTarget>
    }
```

The native target type is Host compatibility state only. It must not be added to ContextProfile, PromptBinding, Settings, Prompt Library records, Remote DTOs, or UI state.

M4C1 may expose a model-inert read service that reports semantic availability without exposing native numeric ranks; the numeric mapping itself stays in the adapter.

## 11. Testing strategy

### Unit contract

Focused tests must cover:

- absent `systemPrompt` -> unavailable;
- exact legacy mapping;
- named sparse mapping using public boundary lookups;
- no call to `section()` or `context()` while observing compatibility;
- partial named-order API -> fail loud;
- non-function required registration methods -> fail loud;
- non-finite/collapsed named boundaries -> fail loud;
- immutable returned compatibility data.

### Upstream compile/runtime matrix

Add one CI lane for:

```text
0.1.1-rc.2
0.1.2-rc.1
0.1.5-rc.1
0.1.5-rc.2
0.1.6-alpha.2
```

Compile fixtures pin the public `Context['systemPrompt']` registration surface. The legacy fixture additionally pins the absence of named-order methods and persona order `0`. The named fixture requires `TOOL_BASH`, `TOOLS_SDK`, `SUBAGENT_DELEGATION`, and either the single-persona or persona-prefix public vocabulary.

Runtime smoke mounts the real published `SystemPrompt` service and verifies:

- the production adapter selects the expected compatibility branch;
- mapped anchors sort around native boundary probes as intended;
- runtime context is a separate ordered channel;
- a native complete section suppresses ordinary Context Manager section probes;
- native runtime-context suppression removes Context Manager context probes;
- registration/disposal remains owned by native Cordis effects.

The probes live only in tests. M4C1 production remains model-inert.

## 12. Exit criteria

M4C1 is complete when:

- the compatibility research above is recorded in project docs;
- M4B is marked complete after merged PR #12;
- the adapter derives the five native targets without version-string branching;
- native numeric ranks remain outside Domain/persistence/Remote/UI;
- all five published compatibility lanes compile and execute the real SystemPrompt runtime smoke;
- current source-forward DSH has been reviewed separately;
- no Context Manager prompt/context provider is registered in production;
- ordinary plugin behavior remains model-inert.

Only then should M4C2 register Agent-scoped aggregate providers and make PromptBindings model-effective.
