# dsh-context-manager

Modular preset, prompt, and skill context manager for DeepSeek Harness, inspired by SillyTavern's preset and Lorebook workflow.

## Status

Early scaffold. PR #1 establishes an installable, test-gated DSH bundle before feature code is added.

The plugin is deliberately additive: installing it must not rewrite or replace DSH's shipped `standard`, `ptc`, `minimal`, or `cordis` agent presets, the built-in skill filesystem provider, the left workspace/session sidebar, or the existing Tool Details surface.

## Design goals

- Treat DSH's native agent presets as locked base compositions and layer Context Manager policy on top.
- Reuse DSH's native preset roster/Remote APIs instead of scanning DSH package directories.
- Add modular prompt/context definitions through DSH prompt assembly rather than replacing the agent loop.
- Preserve DSH's skill registry and providers; apply managed visibility/invocation policy by scope when possible.
- Provide four skill states: Pinned, Auto, Manual, and Off.
- Store UI/configuration state through DSH settings when available instead of building a parallel settings database.
- Render the Web UI as an additive right-side Drawer through the shell overlay, without taking over the single-occupant `details` slot.
- Keep browser presentation separated from Host filesystem/state through DSH's Host -> Remote -> Client -> UI architecture.
- Fail in isolation for malformed Context Manager resources while keeping DSH's normal fail-fast behavior for invalid Cordis deployment configuration.
- Make uninstall/disable restore stock DSH behavior without migration or repair work.

The maintained project constraints live in [docs/architecture.md](docs/architecture.md), and the reviewed/tested DSH baselines live in [docs/compatibility.md](docs/compatibility.md).

## Important compatibility notes

The shipped Minimal preset is intentionally restrictive: it uses a complete persona and disables runtime context. Context Manager must report those placement limitations honestly. Users who need to change Minimal's composition can create a DSH-native preset copy/modular variant; the shipped preset remains untouched.

SillyTavern-style arbitrary historical `depth=N` insertion is not currently treated as equivalent to DSH prompt placement. Context Manager will use DSH's supported system-prompt/runtime-context primitives unless DSH exposes an authoritative history-transform extension point in the future.

## Planned milestones

1. Installable DSH bundle scaffold, build contract tests, and CI.
2. Host-side Context Manager domain and settings-backed profile model.
3. Native agent-preset roster/read integration and locked base-preset structural view.
4. Modular system-prompt/runtime-context overlay model with capability-aware placement.
5. Scoped skill policy model for Pinned / Auto / Manual / Off, with leakage and resume tests.
6. Web client package and additive right-side Drawer.
7. Preset / Skills / Preview UI, including final-context diagnostics.
8. Project and Session overrides without mutating shipped preset files.
9. Compatibility/regression tests across supported DSH releases and all shipped presets.

## Development

Requirements follow current DSH development baselines:

- Node.js `^22.19.0 || >=24.0.0`
- pnpm `11.7.0`

Run:

```sh
pnpm install --frozen-lockfile
pnpm run check
```

`pnpm run check` performs type checking, a clean production build, and package-contract tests.

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
