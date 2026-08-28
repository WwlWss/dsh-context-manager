# DSH compatibility

DeepSeek Harness is evolving quickly. Context Manager separates a **published compatibility baseline** from a **source-forward review target** so development does not accidentally depend on an unreleased implementation detail.

## Current baselines

| Track | DSH reference | Purpose |
| --- | --- | --- |
| Published baseline | `dsh-v0.1.1-rc.2` | Minimum line whose public architecture has been reviewed for the features Context Manager plans to use. The CI bundle smoke test uses the published `@deepseek-ai/dsh@0.1.1-rc.2` CLI. |
| Source-forward target | `dsh-v0.1.2-alpha.1` (`cd5ef814...`) | Review current DSH direction and avoid designing against an API already superseded upstream. It is not a substitute for testing an installable published package. |

Support claims should name a tested DSH version. Reading `master` or an unreleased tag is useful for design review, but is not by itself a compatibility test.

## Public seams verified in the published baseline

The following capabilities are present in `dsh-v0.1.1-rc.2` and are therefore valid foundations for the planned architecture:

### Agent presets

- `ctx.agentPresets` owns preset discovery and standing per-preset composition.
- Preset registrations resolve through agent -> preset -> global scope chains.
- The service can list/resolve/read/copy/remove presets and can resolve a standing scope for cold/session reconstruction paths.
- User authoring is copy-based; shipped presets remain deployment-owned inputs.

Context Manager should consume this domain instead of scanning the DSH installation tree.

### System prompt and runtime context

- `ctx.systemPrompt.section()` contributes ordered, scoped prompt sections.
- `ctx.systemPrompt.context()` contributes ordered dynamic context.
- `complete: true` is an explicit final-prompt constraint.
- Runtime context can be disabled/suppressed by the active composition.

Placement features must respect these constraints rather than emulating success when the active preset prevents an insertion.

### Skills

- `ctx.skills` is layered by global/preset/agent scope.
- A nearer scope shadows the same skill name from a farther scope.
- Invocation policy independently models model and user visibility.
- Provider invalidation and scoped catalog lookup are part of the public service model.

This is the basis for the planned policy-overlay prototype. Hard Off/Manual behavior is still a feature-level claim that requires leakage, cold-session, resume, and invalidation tests in this repository.

### Settings

- `ctx.settings` supports schema-owned namespaces.
- Resolution layers schema defaults, composition base, and user overrides.
- Writes are validated and revision-aware.
- Externally observed invalid user data retains the last good resolved value; boot/registration validation remains fail-fast.

Use this for Context Manager configuration state rather than reproducing its concurrency and persistence rules.

### Web client and Slots

- Packages advertise a Web face through `dsh.client` and an exported `./client` bundle.
- A missing/malformed advertised client bundle is a loud Web composition failure, so enabling the Web face requires package-contract coverage.
- `details` is a single occupied slot; replacing it removes the shipped Conversation details subtree.
- `shell.overlay` is an additive root-scoped list slot.

The right-side Context Manager surface therefore starts as an overlay Drawer rather than replacing DSH layout occupants.

## Compatibility rules for future PRs

When a PR begins using a new DSH seam:

1. Identify the public package/service/Remote/Slot contract that owns the behavior.
2. Check it against the published baseline and the current source-forward target.
3. Add a focused adapter only when signatures/semantics actually differ; do not create a generic compatibility abstraction pre-emptively.
4. Add a regression test that fails when the relied-on contract disappears or changes materially.
5. Update this document when the minimum tested DSH line moves.

Avoid importing DSH `src/` internals into production code. Type-only imports of public declarations are preferred where possible; runtime behavior should cross public Cordis services, Remotes, package exports, or declared Slots.
