# Contributing

Thanks for helping improve `dsh-context-manager`.

## Before changing code

Read [`docs/architecture.md`](docs/architecture.md), [`docs/development-guide.md`](docs/development-guide.md), and [`docs/compatibility.md`](docs/compatibility.md). The project is intentionally a DSH-native overlay, not a replacement agent runtime. Changes that bypass DSH's preset, settings, prompt, skill, lifecycle, Remote, or Slot contracts need a concrete compatibility reason and tests proving the native path is insufficient.

Before implementation, perform the upstream contract preflight described in the development guide: verify the public seam, packed exports/files, minimum retained generation, runtime loadability/lifecycle, compatibility hypothesis, and evidence plan. A source-visible monorepo helper is not automatically a published production seam.

## Development setup

Use the versions declared by `package.json` and the committed lockfile:

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm run check
```

CI additionally verifies the git-install `prepare` path on Linux and Windows and verifies the packed bundle surface.

## Pull requests

Keep changes narrow and test the contract they introduce. Feature PRs normally stay Draft through implementation/CI stabilization and become Ready only after the exact head has passed strict source review and required CI. Classify red CI before changing production code: production defect, harness defect, upstream publication/compatibility defect, or infrastructure/transient failure.

In particular:

- Do not edit shipped DSH preset files.
- Do not replace DSH providers or layout occupants when an additive/scoped extension point exists.
- Use Cordis-owned effects for registrations and cleanup.
- Prefer capability checks for optional integrations over undocumented internal imports.
- Treat user data errors as local resource failures; do not broadly swallow programming or deployment-configuration errors.
- Add regression coverage for any behavior that affects prompt visibility, skill visibility, session resume, preset scope, Client/Remote ABI, or package installation.
- When compatibility depends on generated artifacts, prefer build-once/consume-many tests so every retained consumer executes the exact bytes intended to ship.
- Do not widen peer ranges for a newly published DSH generation until a dedicated compatibility-intake slice proves the affected public seams.

By contributing, you agree that your contribution is licensed under the repository's Apache-2.0 license.
