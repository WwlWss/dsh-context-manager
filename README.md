# dsh-context-manager

Modular preset, prompt, skill, transform, and presentation context manager for DeepSeek Harness, inspired by SillyTavern's preset, Lorebook, regex, and helper workflows.

## Status

The installable/test-gated DSH bundle foundation, Settings-backed Host profile Domain, native AgentPreset discovery/identity/authoring work (M3A–M3C), the complete prompt stack (M4A–M4C2), and the complete M5 Skill Policy Runtime (M5A–M5C) are implemented. PromptBindings are model-effective through native DSH prompt assembly. Skill bindings are model-effective through an Agent-scoped native SkillRegistry policy overlay: Auto preserves the native winner; Manual disables model invocation while preserving explicit user invocation; Off disables both native invocation surfaces; and Pinned disables both native invocation surfaces while M5C separately injects the underlying native full instructions through one Agent-scoped Context Manager prompt contribution. M5C uses native `renderSkillContent()`, parent-scope native resolution, literal-safe prompt-variable indirection, and native request-series reconciliation on the retained 0.1.2+ lines that expose that public seam, so changing/clearing Pinned state does not accumulate stale in-history system prompts while the request-series coordinator remains installed. The coordinator treats `agent/pre-step` as a proposal only and commits its fingerprint baseline after DSH publishes the fenced request's durable `request/header`, so failures in `agent/request` or `prepareCall()` cannot consume a required boundary. A permanent unload of the whole Context Manager bundle removes that coordinator too; retained DSH exposes no cross-resume public seam that lets an already-unloaded plugin guarantee cleanup of previously admitted in-history prompt bytes, so no such post-unload guarantee is claimed. The retained 0.1.1 line uses its legacy prompt path and does not depend on `startsRequestSeries`. A nearer/higher-priority same-layer provider can still win under DSH's native precedence rules; runtime inspection reports that case as `policy-not-effective` and M5C does not inject a half-effective Pinned body.

Context Manager is an editor, not a policy engine. It preserves explicit user intent, reports unresolved or malformed resources as diagnostics, and does not silently fallback, repair, normalize, reorder, or delete user-authored configuration.

The plugin is deliberately additive: installing it must not rewrite or replace DSH's shipped `standard`, `ptc`, `minimal`, or `cordis` agent presets, the built-in skill filesystem provider, the left workspace/session sidebar, or the existing Tool Details surface.

## Design goals

- Treat DSH's native agent presets as locked base compositions and layer Context Manager policy on top.
- Reuse DSH's native preset roster and authoring Host APIs instead of scanning or mutating DSH package directories directly.
- Add modular prompt/context definitions through DSH prompt assembly rather than replacing the agent loop.
- Preserve DSH's skill registry and providers; apply managed visibility/invocation policy by scope when possible.
- Provide four skill states: Pinned, Auto, Manual, and Off.
- Keep skill bindings extensible so future placement/order/activation metadata can be added without changing the storage shape or being erased by a mode edit.
- Support distinct future transform families instead of collapsing them into one regex hook: Host prompt/source transforms, Host history-Surface replacements, Client display transforms, and isolated renderer/helper execution.
- Store reusable profile state through DSH settings instead of building a parallel settings database.
- Preserve unresolved references and malformed advanced-editor profile payloads; diagnostics describe health without becoming content-policy gates.
- Expose advanced stored-payload editing where DSH storage integrity can still be guaranteed.
- Render the Web UI as an additive right-side Drawer through the shell overlay, without taking over the single-occupant `details` slot.
- Keep browser presentation separated from Host filesystem/state through DSH's Host -> Remote -> Client -> UI architecture.
- Make uninstall/disable restore stock DSH behavior without migration or repair work. Explicit user-authored native presets remain DSH resources and are not deleted on plugin uninstall.

Project documentation:

- [Architecture and non-negotiable design constraints](docs/architecture.md)
- [Maintainer development guide](docs/development-guide.md)
- [Long-term implementation roadmap](docs/roadmap.md)
- [Reviewed/tested DSH compatibility baselines](docs/compatibility.md)

## Current Host profile model

The Host service stores a global reusable profile library plus an optional `defaultProfileId` through DSH Settings. Project/Session binding is intentionally not faked as a Settings feature; those scopes are later milestones.

A profile contains Domain-defined display metadata, a native `basePreset` reference, desired skill bindings, and PromptBindings that reference durable Prompt Library resources. Skill bindings remain object-shaped values such as `{ mode: "manual" }`. PromptBindings became model-effective in M4C2 through Agent-scoped native prompt assembly; skill bindings became model-effective in M5B, with M5C completing the separate Pinned full-instruction path.

The object-shaped binding is deliberate. Later versions can add sibling data such as placement, ordering, activation, or triggers, while `setSkillMode()` changes only the `.mode` leaf and preserves unknown siblings. Removing the whole binding is a separate explicit operation.

The settings envelope is intentionally tolerant so one malformed profile payload cannot take every other profile offline. Context Manager separates stored payloads from parsed Domain profiles; runtime/effective resolution remains a separate layer.

Structured creation/replacement validates the full current profile shape. Narrow edits such as one skill mode validate only the path they touch, so unrelated malformed fields do not block an explicit local repair. Every write is fenced to a DSH Settings revision, including calls that omit an explicit `expectedRevision`, which prevents a stale path check from being applied after another queued writer changed the profile.

DSH intentionally keeps a last-good resolved value when an externally edited Settings section becomes schema-invalid. Before a semantic write, Context Manager also inspects the exposed raw user section when available and refuses to mutate from stale last-good assumptions. It does not rewrite the invalid document automatically.

The advanced stored-payload seam accepts Domain-invalid JSON-shaped content without auto-repair. It still refuses values DSH cannot preserve losslessly: `undefined`, and currently the JSON property key `__proto__` because DSH Settings has an upstream property-safe-construction limitation for that key. Names such as `constructor` and `prototype` remain valid.

## Native AgentPreset observation and authoring

Milestone 3A adds a separate read model over the native Host roster. It intentionally consumes only the stable public Host-service intersection shared by the supported DSH lines: `defaultId`, `authorable`, and one `list()` call per aggregate snapshot.

The read model keeps the configured profile string unchanged inside `basePreset.configuredId` and reports one of four states:

- `resolved` — the exact configured id is present and native discovery did not mark it broken;
- `missing` — the AgentPreset capability exists but the exact configured id is absent;
- `broken` — the id exists and DSH discovery supplied a `broken` reason;
- `unavailable` — the current composition has no `agentPresets` capability.

There is no fallback to DSH's default preset. The native `defaultId` is roster metadata only. The projected roster is path-free and does not expose `order`, filesystem locations, or invented policy fields such as `editable`. Context Manager does not cache the roster across snapshots and does not call preset mount/recompose/standing APIs.

Milestone 3B separately observes the effective AgentPreset identity recorded by a currently live DSH Session. Configured profile intent, current roster resolution, and live Session identity remain separate facts; deleting or losing a native preset can therefore make a profile `missing` while an already-running Session still records that exact preset id.

Milestone 3C bridges DSH-native authoring without taking ownership of preset storage. The Host service delegates exact `read(id)`, `copy(from, id, name?)`, and `remove(id)` operations to the optional native `ctx.agentPresets` service at call time. It does not preflight the roster, normalize ids/names, parse composition YAML, expose filesystem paths, or import `@deepseek-ai/dsh-agent-presets` in production.

Native authoring is deliberately copy-only. A new user preset is a DSH-owned snapshot copy of an existing preset's complete directory; it is not an inheriting child of the source. Shipped presets remain read-only, and `trust: "user"` is provenance rather than a guarantee that a row is removable. DSH's native operation remains the authority for writable-root ownership, id containment, collisions, default cleanup, and standing-mount lifecycle.

Deleting a native preset never repairs or rewrites Context Manager profile references. A profile that still names the deleted id becomes `missing` on the next M3A snapshot. Existing Sessions remain DSH-owned and may continue running the composition they already mounted.

## Important compatibility notes

The install-tested compatibility matrix retains four published regression lines — legacy `0.1.1-rc.2`, prior-modern `0.1.2-rc.1`, `0.1.5-rc.1`, and stable `0.1.5-rc.2` — plus the install-tested forward alpha `0.1.6-alpha.2`. Source review of the exact official repository commit remains a separate claim from package testing. See [docs/compatibility.md](docs/compatibility.md) for the exact matrix.

The M3A/M3C AgentPreset adapters do not import or bundle `@deepseek-ai/dsh-agent-presets`. The capability is optional and discovered through Cordis. CI temporarily installs exact published AgentPreset packages to compile the minimum public Host contract, runs the structural bridge behavior suite, and then mounts the real published `AgentPresets` service against temporary roots to execute an actual `copy -> read -> remove` cycle through Context Manager on every supported AgentPreset generation.

The compile contract deliberately fixes only semantics production consumes. `read()` must remain asynchronously string-valued. `copy()` and `remove()` must remain asynchronous with the same input shape, but their native success payload may be enriched by DSH because Context Manager intentionally discards that payload and exposes `void`. This prevents an incidental upstream DTO from becoming part of Context Manager's public API.

The packaged plugin is also installed into clean consumers with strict peer-dependency checking against `@deepseek-ai/dsh-settings@0.1.5-rc.2` and `@deepseek-ai/dsh-settings@0.1.6-alpha.2`. Full DSH bundle composition smoke runs on `0.1.2-rc.1`, `0.1.5-rc.1`, `0.1.5-rc.2`, and `0.1.6-alpha.2`.

The shipped Minimal preset is intentionally restrictive: it uses a complete persona and disables runtime context. Context Manager must report those placement limitations honestly. Users who need to change Minimal's native composition can make a DSH-native user preset copy; the shipped preset remains untouched.

SillyTavern-style arbitrary historical `depth=N` insertion is not treated as equivalent to DSH prompt placement. History replacement/shadowing is a separate future capability: it may be implemented only through a public DSH Session/Surface seam whose exact current contract is verified when that milestone begins. Context Manager must not treat conceptual support for replacement as permission to bind to obsolete Session APIs.

Display-only regex behavior is a different client concern. Stock DSH assistant Markdown intentionally disables raw HTML, and stock Chat owns its keyed assistant renderer, so richer presentation should use additive public client surfaces rather than patching stock Chat internals.

Future HTML/JavaScript helper rendering must run in an isolated browser runtime with an explicit capability bridge for any DSH interaction. This keeps arbitrary user-enabled scripts possible without granting model output ambient authority over the parent DSH application.

DSH Settings revision fencing is an in-process guarantee. If multiple DSH processes share one settings provider/document, cross-process convergence remains provider-defined; Context Manager does not add a second locking system on top of DSH. Native AgentPreset filesystem authoring likewise remains owned by DSH. Context Manager deliberately does not add a local mutex and then claim global serialization across Context Manager, the stock DSH authoring UI, other plugins/processes, and manual filesystem writers. Concurrent native-write correctness belongs at the DSH `AgentPresets` authoring transaction boundary.

## Planned milestones

1. **Complete** — Installable DSH bundle scaffold, build contract tests, and CI.
2. **Complete** — Host-side Context Manager domain and settings-backed reusable profile model.
3. **Complete** — M3A native AgentPreset roster resolution, M3B live Session effective identity, and M3C DSH-owned copy-only native preset authoring bridge.
4. **Complete** — Storage-backed Prompt Library, PromptBinding Domain state, five-generation placement compatibility, and Agent-scoped prompt/runtime-context composition.
5. **Complete** — five-generation Skill/Scope contracts, targeted effective-profile hot-path reads, Context Manager invalidation, the Agent-scoped Pinned / Auto / Manual / Off native invocation-policy overlay, and the separate Pinned full-instruction replacement/reconciliation path.
6. **In progress** — strict Host Remote API: M6A foundation complete; M6B profiles/Prompt Resources underway; preset/runtime diagnostics follow in M6C.
7. Web client package and additive right-side Drawer.
8. Preset / Prompt / Skill editor and effective-context preview.
9. Project and Session bindings without mutating shipped preset files.
10. Transform/resource milestones, history-Surface transforms, display transforms, renderer/helper runtime, import/export, and advanced inspection follow in the detailed roadmap.

The detailed dependency-ordered implementation plan lives in [docs/roadmap.md](docs/roadmap.md).

## Development

Requirements follow current project baselines:

- Node.js `^22.19.0 || >=24.0.0`
- pnpm `11.7.0`

Run:

```sh
pnpm install --frozen-lockfile
pnpm run check
```

`pnpm run check` performs type checking, a clean production build, and package/domain/runtime tests against the legacy development dependency set. CI additionally runs modern Settings regressions through the install-tested forward alpha `0.1.6-alpha.2`, five AgentPreset Host-contract plus real-native-runtime lanes, five Session preset identity lanes, five Prompt Library Storage Domain lanes, five Prompt placement/runtime lanes, the five-generation M5 Skill/Scope contract lane, the five-generation M5B production policy lane, the five-generation M5C pinned-runtime lane, oldest/first-series/first-in-history/current M5C AgentLoop coverage, oldest/current ToolSkill + AgentLoop E2E, strict packed-package peer installation checks for the stable and forward-alpha Settings lines, and bundle composition smoke tests against `0.1.2-rc.1`, `0.1.5-rc.1`, `0.1.5-rc.2`, and `0.1.6-alpha.2`.

Before changing runtime integration or adding a Web capability, read [docs/development-guide.md](docs/development-guide.md). It records the project's persistence, lifecycle, DSH-integration, transform, client, performance, and testing rules.

The git-install `prepare` path is intentionally smaller than the development build: it transpiles only the runtime JavaScript required by the declared package entry. Type checking and declaration generation remain development/CI responsibilities.

## Development installation into DSH

Install the current repository into an existing DSH profile with:

```sh
dsh plugin --profile web add github:WwlWss/dsh-context-manager
```

Git-hosted TypeScript dependencies run their `prepare` build during installation. pnpm 10+ blocks dependency build scripts by default, so the first install may ask the user to allow the exact package key in the profile's `pnpm-workspace.yaml` before retrying.

For reproducible testing, pin a commit SHA when installing an unreviewed development version.

## License

Apache-2.0.
