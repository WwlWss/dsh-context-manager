# dsh-context-manager

Modular preset, prompt, skill, transform, and presentation context manager for DeepSeek Harness, inspired by SillyTavern's preset, Lorebook, regex, and helper workflows.

## Status

The installable/test-gated DSH bundle foundation, the model-inert Settings-backed Host profile Domain, and the DSH Settings compatibility seam are complete. Milestone 3A is now in development: Context Manager can observe the optional native AgentPreset roster and resolve each usable profile's configured `basePreset` as resolved, missing, broken, or unavailable without changing any Agent composition.

Context Manager is an editor, not a policy engine. It preserves explicit user intent, reports unresolved or malformed resources as diagnostics, and does not silently fallback, repair, normalize, reorder, or delete user-authored configuration.

The plugin is deliberately additive: installing it must not rewrite or replace DSH's shipped `standard`, `ptc`, `minimal`, or `cordis` agent presets, the built-in skill filesystem provider, the left workspace/session sidebar, or the existing Tool Details surface.

## Design goals

- Treat DSH's native agent presets as locked base compositions and layer Context Manager policy on top.
- Reuse DSH's native preset roster/Remote APIs instead of scanning DSH package directories.
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
- Make uninstall/disable restore stock DSH behavior without migration or repair work.

Project documentation:

- [Architecture and non-negotiable design constraints](docs/architecture.md)
- [Maintainer development guide](docs/development-guide.md)
- [Long-term implementation roadmap](docs/roadmap.md)
- [Reviewed/tested DSH compatibility baselines](docs/compatibility.md)

## Current Host profile model

The Host service stores a global reusable profile library plus an optional `defaultProfileId` through DSH Settings. Project/Session binding is intentionally not faked as a Settings feature; those scopes are later milestones.

A profile currently contains only state whose meaning is defined by the Domain: display metadata, a native `basePreset` reference, and desired skill bindings. Each binding is currently an object such as `{ mode: "manual" }`, not a scalar string. These values remain model-inert: saving `basePreset: standard` or `docker: { mode: "off" }` does not yet mount a preset or alter the native skill registry.

The object-shaped binding is deliberate. Later versions can add sibling data such as placement, ordering, activation, or triggers, while `setSkillMode()` changes only the `.mode` leaf and preserves unknown siblings. Removing the whole binding is a separate explicit operation.

The settings envelope is intentionally tolerant so one malformed profile payload cannot take every other profile offline. Context Manager separates stored payloads from parsed Domain profiles; runtime/effective resolution remains a separate layer.

Structured creation/replacement validates the full current profile shape. Narrow edits such as one skill mode validate only the path they touch, so unrelated malformed fields do not block an explicit local repair. Every write is fenced to a DSH Settings revision, including calls that omit an explicit `expectedRevision`, which prevents a stale path check from being applied after another queued writer changed the profile.

DSH intentionally keeps a last-good resolved value when an externally edited Settings section becomes schema-invalid. Before a semantic write, Context Manager also inspects the exposed raw user section when available and refuses to mutate from stale last-good assumptions. It does not rewrite the invalid document automatically.

The advanced stored-payload seam accepts Domain-invalid JSON-shaped content without auto-repair. It still refuses values DSH cannot preserve losslessly: `undefined`, and currently the JSON property key `__proto__` because DSH Settings has an upstream property-safe-construction limitation for that key. Names such as `constructor` and `prototype` remain valid.

## Native AgentPreset observation

Milestone 3A adds a separate read model over the native Host roster. It intentionally consumes only the stable public Host-service intersection that exists across the reviewed DSH lines: `defaultId`, `authorable`, and one `list()` call per aggregate snapshot.

The read model keeps the configured profile string unchanged and reports one of four states:

- `resolved` — the exact configured id is present and native discovery did not mark it broken;
- `missing` — the AgentPreset capability exists but the exact configured id is absent;
- `broken` — the id exists and DSH discovery supplied a `broken` reason;
- `unavailable` — the current composition has no `agentPresets` capability.

There is no fallback to DSH's default preset. The native `defaultId` is roster metadata only. The projected roster is path-free and does not expose `order`, filesystem locations, or invented policy fields such as `editable`. Context Manager does not cache the roster across snapshots and does not call preset mount/recompose/standing APIs.

This remains model-inert. Milestone 3A describes current native state; it does not change the preset used by an existing or future Agent.

## Important compatibility notes

The currently tested Settings generations are the legacy `dsh-v0.1.1-rc.2` line and the latest installable `dsh-v0.1.2-rc.1` line. CI runs the full Domain/runtime regression suite against both public Settings shapes. The latest official repository/GitHub release is `dsh-v0.1.3-alpha.1`; it is source-reviewed until the corresponding umbrella package is installable. See [docs/compatibility.md](docs/compatibility.md) for the exact matrix.

The M3A AgentPreset adapter does not import or bundle `@deepseek-ai/dsh-agent-presets`. The capability is optional and discovered through Cordis; the adapter deliberately models only the stable Host-service shape shared by the legacy, current installable, and source-forward lines. This avoids turning a missing optional Host capability or a newer Remote DTO export into an installation dependency.

The shipped Minimal preset is intentionally restrictive: it uses a complete persona and disables runtime context. Context Manager must report those placement limitations honestly. Users who need to change Minimal's composition can create a DSH-native preset copy/modular variant; the shipped preset remains untouched.

SillyTavern-style arbitrary historical `depth=N` insertion is not treated as equivalent to DSH prompt placement. History replacement/shadowing is a separate future capability: it may be implemented only through a public DSH Session/Surface seam whose exact current contract is verified when that milestone begins. Context Manager must not treat conceptual support for replacement as permission to bind to obsolete Session APIs.

Display-only regex behavior is a different client concern. Stock DSH assistant Markdown intentionally disables raw HTML, and stock Chat owns its keyed assistant renderer, so richer presentation should use additive public client surfaces rather than patching stock Chat internals.

Future HTML/JavaScript helper rendering must run in an isolated browser runtime with an explicit capability bridge for any DSH interaction. This keeps arbitrary user-enabled scripts possible without granting model output ambient authority over the parent DSH application.

DSH Settings revision fencing is an in-process guarantee. If multiple DSH processes share one settings provider/document, cross-process convergence remains provider-defined; Context Manager does not add a second locking system on top of DSH.

## Planned milestones

1. **Complete** — Installable DSH bundle scaffold, build contract tests, and CI.
2. **Complete** — Host-side Context Manager domain and settings-backed reusable profile model.
3. **In development — M3A** — Native AgentPreset roster plus configured -> resolved/missing/broken/unavailable observation. Effective Session/Agent identity remains a separate M3B; native authoring remains optional M3C.
4. Modular system-prompt/runtime-context overlay model with capability-aware placement.
5. Scoped skill policy model for Pinned / Auto / Manual / Off, with leakage and resume tests.
6. Web client package and additive right-side Drawer.
7. Preset / Skills / Preview UI, including final-context diagnostics.
8. Project and Session overrides without mutating shipped preset files.
9. Transformation pipeline: prompt/source transforms, durable history-Surface transforms, display regex, and isolated renderer/helper bindings.
10. Compatibility/regression tests across supported DSH releases and all shipped presets.

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

`pnpm run check` performs type checking, a clean production build, and package/domain/runtime-read-model tests against the legacy development dependency set. CI additionally runs the same suite against the latest installable Settings generation.

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
