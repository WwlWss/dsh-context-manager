# dsh-context-manager

Modular preset, prompt, and skill context manager for DeepSeek Harness, inspired by SillyTavern's preset and Lorebook workflow.

## Status

Early scaffold. The first milestone proves that the project can be installed as an optional DSH bundle without replacing or modifying the built-in Standard, PTC, Minimal, or Create presets.

## Design goals

- Keep the existing DSH presets usable and untouched.
- Add a right-side Context Manager UI instead of replacing the existing left workspace/session sidebar.
- Treat built-in presets as locked base presets and layer modular prompt/skill overlays on top.
- Provide a reusable central module library without copying skills into every project.
- Support skill states such as Always, Auto, Manual, and Off.
- Preserve DSH's native skill invocation and Agent runtime whenever possible.
- Fail soft: an optional Context Manager feature should not make the host unusable when a capability is missing or a configuration is invalid.

## Planned milestones

1. Installable DSH bundle scaffold.
2. Host-side settings and profile model.
3. Modular prompt overlay assembly.
4. Filtered skill provider and skill state model.
5. Web client package and right-side panel.
6. Preset / Skills / Preview tabs.
7. Project and Session overrides.
8. Compatibility and regression tests against the built-in presets.

## Development installation

Once the scaffold has a buildable release, it is intended to install into an existing DSH profile with:

```sh
dsh plugin --profile web add github:WwlWss/dsh-context-manager
```

Git-hosted TypeScript dependencies run their `prepare` build during installation. pnpm 10+ blocks dependency build scripts by default, so users may need to allow the exact package key printed by pnpm in the profile's `pnpm-workspace.yaml` before retrying the install.

## License

Apache-2.0.
