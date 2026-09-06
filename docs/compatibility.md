# DSH compatibility

DeepSeek Harness evolves quickly. Context Manager therefore separates the **minimum API generation it can still compile/test against** from the **current published DSH lines it must load inside**.

## Current compatibility matrix

| Track | DSH reference | How it is used |
| --- | --- | --- |
| Legacy API regression | `dsh-v0.1.1-rc.2` | Development dependency for unit/type regression. This keeps the old Settings API generation visible so compatibility code cannot accidentally depend only on the new method shape. |
| Current published baseline | `dsh-v0.1.2-rc.1` | Required bundle smoke target. This is the first supported line where optional Settings wiring moved from the module helper to `settings.installSection(...)`. |
| Latest published/source-forward target | `dsh-v0.1.3-alpha.1` / `d347e703...` | Required bundle smoke target and current architecture review target. It includes the Session v2 / `SessionHandle` persistence changes, but those APIs are not yet consumed by Context Manager. |

Support claims should name tested versions. Reading `master` is useful for architecture review, but a source inspection alone is not a compatibility test.

## Settings compatibility rule

Context Manager owns the `dsh-context-manager` Settings namespace and never reads or writes DSH settings files directly.

The Settings public surface changed between the legacy and current lines:

- `0.1.1-rc.2` exported `settingsNamespace()` and a module-level `installSettingsSection()` helper.
- `0.1.2-rc.1+` validates namespace strings in the Settings service and exposes the optional-consumer lifecycle as `settings.installSection(owner, ns, schema, entry, hooks)`.

Production Context Manager code does **not** import either generation-specific helper. `src/adapters/settings.ts` owns the narrow compatibility seam:

1. use current `settings.installSection()` when the mounted provider exposes it;
2. otherwise reproduce the same optional-consumer behavior only from the public common denominator: `ctx.inject(['settings'])`, `settings.register()`, `scope.watch()`, and Cordis effects;
3. keep the service alive when Settings is absent;
4. never inspect DSH package internals or branch on a fork identity.

This is a DSH-version adapter, not a WwlWss-fork adapter. The same Context Manager package must run unchanged on official DSH and on a patched DSH fork that preserves the public service contract.

The rest of the PR2 persistence model remains unchanged:

- Settings is authoritative storage;
- descriptor revisions are compare-and-swap fences;
- invalid external edits keep last-good resolved state without being silently repaired;
- semantic writes inspect the exposed raw user section before mutating from last-good state;
- no second Context Manager settings cache is maintained;
- `__proto__` remains rejected at Context Manager's advanced-write/path boundary while upstream Settings still carries its property-safe-construction limitation.

## AgentPreset compatibility

The public `ctx.agentPresets` roster remains the intended foundation for Milestone 3.

The current lines still expose the core roster facts Context Manager needs:

- `list()`;
- `defaultId`;
- `authorable`;
- preset identity/metadata including `id`, `trust`, optional `name`/`description`, and optional `broken` reason.

Current DSH also exposes path-free Remote roster data and richer composition inventory APIs. Context Manager should consume native public APIs instead of scanning preset directories or parsing `agent.cordis.yml` itself.

The first AgentPreset integration remains deliberately narrow: one native roster read per aggregate snapshot, configured -> resolved/missing/broken/unavailable diagnostics, no fallback to `standard`, and no mount/recompose side effects.

## Session compatibility boundary

`0.1.2` and `0.1.3` substantially changed Session APIs:

- eager `Session.events` access moved toward `seq`, `eventAt()`, and `snapshotEvents()`;
- Session persistence is now lifecycle-owned through `SessionHandle`;
- `agentLoop.create()` became asynchronous;
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
2. compare the current published baseline with latest published/master source;
3. add a focused adapter only for an actual signature/semantic difference;
4. never import production code from DSH `src/` internals;
5. add a regression test or bundle smoke that fails when the relied-on contract disappears;
6. keep unsupported/missing optional capabilities explicit instead of simulating them;
7. update this document when the minimum tested DSH line moves.

The compatibility objective is **one plugin codebase across supported official DSH lines and compatible forks**, not one plugin version per host build.
