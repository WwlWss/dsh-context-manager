# DSH compatibility

DeepSeek Harness evolves quickly. Context Manager separates **installable/tested package compatibility** from **source-forward review against the latest official repository** so the plugin can follow upstream architecture without pretending an unpublished package is already runnable in CI.

## Current compatibility matrix

| Track | DSH reference | How it is used |
| --- | --- | --- |
| Legacy API regression | `dsh-v0.1.1-rc.2` | Development dependency for unit/type regression. This keeps the older Settings API generation visible so the adapter cannot accidentally depend only on the new method shape. |
| Latest installable DSH | `dsh-v0.1.2-rc.1` | Required bundle smoke target. npm currently reports this as the latest published `@deepseek-ai/dsh` package. |
| Latest official repository | `dsh-v0.1.3-alpha.1` / `d347e703...` | Source-forward architecture target. The GitHub release and repository carry this version, but the umbrella `@deepseek-ai/dsh@0.1.3-alpha.1` package is not currently available from npm, so this line is reviewed from official source rather than claimed as an install-tested release. |

Support claims must name what was actually tested. A GitHub release/source tree and an installable npm package are deliberately not treated as the same thing.

## Settings compatibility rule

Context Manager owns the `dsh-context-manager` Settings namespace and never reads or writes DSH settings files directly.

The Settings public surface changed between the legacy and current lines:

- `0.1.1-rc.2` exported `settingsNamespace()` and a module-level `installSettingsSection()` helper.
- `0.1.2-rc.1+` validates namespace strings in the Settings service and exposes the optional-consumer lifecycle as `settings.installSection(owner, ns, schema, entry, hooks)`.
- the latest official `0.1.3-alpha.1` source still uses the `settings.installSection(...)` shape.

`src/adapters/settings.ts` owns the narrow version seam:

1. if the legacy module-level `installSettingsSection(...)` export exists, delegate to it;
2. otherwise attach to the optional Settings service and require the current `settings.installSection(...)` method;
3. keep the namespace value local and stable instead of importing the removed `settingsNamespace()` helper;
4. never reimplement DSH's detach/unload policy when one of its native public helpers is available;
5. never inspect a fork identity or import DSH implementation internals.

This is a DSH API-generation adapter, not a WwlWss-fork adapter. The same Context Manager package must run unchanged on official DSH and on a patched DSH fork that preserves one of the supported public Settings contracts.

The rest of the PR2 persistence model remains unchanged:

- Settings is authoritative storage;
- descriptor revisions are compare-and-swap fences;
- invalid external edits keep last-good resolved state without being silently repaired;
- semantic writes inspect the exposed raw user section before mutating from last-good state;
- no second Context Manager settings cache is maintained;
- `__proto__` remains rejected at Context Manager's advanced-write/path boundary while upstream Settings still carries its property-safe-construction limitation.

## AgentPreset compatibility

The public `ctx.agentPresets` roster remains the intended foundation for Milestone 3.

The latest installable line and the latest official source still expose the core roster facts Context Manager needs:

- `list()`;
- `defaultId`;
- `authorable`;
- preset identity/metadata including `id`, `trust`, optional `name`/`description`, and optional `broken` reason.

Current official source also exposes path-free Remote roster data and richer composition inventory APIs. Context Manager should consume native public APIs instead of scanning preset directories or parsing `agent.cordis.yml` itself.

The first AgentPreset integration remains deliberately narrow: one native roster read per aggregate snapshot, configured -> resolved/missing/broken/unavailable diagnostics, no fallback to `standard`, and no mount/recompose side effects.

## Session compatibility boundary

`0.1.2` and the latest `0.1.3-alpha.1` source substantially changed Session APIs:

- eager `Session.events` access moved toward `seq`, `eventAt()`, and `snapshotEvents()`;
- Session persistence is lifecycle-owned through `SessionHandle` in the new source line;
- `agentLoop.create()` became asynchronous there;
- Session format v2 introduced generation migration and durable assistant settlements.

None of those APIs are currently required by the model-inert profile Domain. Future effective-session identity and history transforms must target the then-current public Session/projection contracts rather than reviving the old API surface.

This is why Milestone 3 remains split conceptually:

- roster/configured resolution first;
- effective live/durable Session identity later.

## Windows fork fixes are not plugin dependencies

Context Manager must never depend on private fixes in `WwlWss/deepseek-harness`.

In particular, the local Win32 directory-picker safety patch and any future Session/projection performance patch are DSH-fork implementation changes. Context Manager may rely on public capability values and semantics, but never on their private implementation or event/broadcast frequency.

A user must be able to switch official DSH <-> patched DSH without installing a different Context Manager build.

## Compatibility rules for future PRs

When a PR begins using a new DSH seam:

1. identify the public package/service/Remote/Slot contract that owns the behavior;
2. compare the latest installable DSH package with the latest official repository source;
3. add a focused adapter only for an actual signature/semantic difference;
4. never import production code from DSH `src/` internals;
5. add a regression test or bundle smoke that fails when the relied-on installable contract disappears;
6. use source-forward review for unreleased repository changes and do not label them install-tested until packages exist;
7. keep unsupported/missing optional capabilities explicit instead of simulating them;
8. update this document when the minimum tested DSH line moves.

The compatibility objective is **one plugin codebase across supported official DSH lines and compatible forks**, not one plugin version per host build.
