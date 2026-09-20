# M6A Plan — Strict Typert Remote Foundation

## Goal

Establish a generated, version-tested Host Remote boundary before any browser-facing Context Manager CRUD API is added.

M6A is intentionally narrow:

- add one Host Remote service under the `contextManager` namespace;
- expose only `protocol()`, returning a JSON-safe protocol-version DTO;
- generate and publish strict Typert Host and Remote artifacts;
- prove those artifacts and the runtime endpoint across the retained DSH generations;
- do not add profile, prompt, preset, runtime-diagnostic, event-stream, or Web Client behavior yet.

## Public seam

M6A consumes only the public Typert contract:

- `TypertRemoteService`;
- `@Remote`;
- generated `./typert` and `./remote` package artifacts;
- DSH Typert Loader / Gateway runtime behavior in compatibility tests.

The production Host service remains an ordinary Cordis service. Browser/client code will consume only the generated Remote projection in later milestones.

## Service shape

```text
ContextManagerRemoteService
  Cordis key: dshContextRemote
  Remote namespace: contextManager

contextManager.protocol()
  -> { apiVersion: 1 }
```

`apiVersion` versions the Context Manager wire surface, not the package version, DSH version, stored schema, or runtime profile.

## Build topology

The public Typert analyzer intentionally discovers package registrations only below `<workspace>/packages/*`. Context Manager is a standalone repository whose published package is the repository root, so neither package-mode nor workspace-mode tsdown artifact emission can register the root package directly.

M6A therefore keeps the upstream tsdown transform only for standard-decorator lowering and runs an explicit post-bundle generator script. That script creates a short-lived `.typert-workspace-*/packages/dsh-context-manager` workspace, copies the exact production `src/service/remote.ts` bytes as its only source, invokes the public `WorkspaceTypertGenerator`, copies the generated Host/Remote artifacts into root `lib/`, and deletes the temporary workspace in `finally`.

This is an isolation adapter, not a second Remote contract: there is no separately maintained service/method declaration. It also prevents the first Typert opt-in from accidentally publishing the existing M2-M5 Cordis Services as reflection surface.

Both normal build and git-install `prepare` run the same generator script. A successful build must emit:

```text
lib/typert.host.js
lib/typert.host.d.ts
lib/typert.remote-client.js
lib/typert.remote-client.d.ts
lib/typert.remote-client.d.ts.map
```

The package exports only `./typert` and `./remote` in M6A. It does **not** add `./client` or a `dsh.client` manifest; those belong to M7.

## Compatibility strategy

The development generator is pinned to the oldest retained public Typert generation, `0.1.1-rc.2`, so the authored decorator/base-class contract cannot accidentally depend on newer protocol APIs.

Runtime CI then installs each retained DSH line and proves the same published artifacts remain accepted:

- 0.1.1-rc.2;
- 0.1.2-rc.1;
- 0.1.5-rc.1;
- 0.1.5-rc.2;
- 0.1.6-alpha.2.

The lane must verify strict descriptors are present. Passing through Gateway SRC fallback is not sufficient evidence.

## Error and event boundary

M6A exposes no business mutation and therefore adds no Context Manager wire error vocabulary yet.

Later M6B must not rely on DSH `RemoteError` for cross-generation business error semantics because the retained 0.1.1 Gateway predates that vocabulary. M6A records that constraint but does not pre-implement the later result envelope.

Likewise, M6A adds no Remote event. Retained 0.1.1 has no Gateway Remote-event stream, so later change notifications must remain an optional pull-on-change accelerator rather than a correctness dependency.

## Tests

### Local/package contract

- build emits all five generated artifacts;
- package exports point exactly at those artifacts;
- `./remote` imports as a generated contribution for package `dsh-context-manager`;
- the contribution contains exactly the M6A `contextManager/protocol` endpoint;
- the strict descriptor names service, namespace, method, implementation, direct invocation, zero parameters, and a strict result codec;
- the Host entry exports the Remote service and protocol DTO type;
- the generated Host reflection surface contains only `dshContextRemote` and the one M6A invocation, not M2-M5 Host services;
- git-install `prepare` emits the same runtime + Typert artifacts from a clean `lib/`.

### Retained DSH runtime matrix

For every retained DSH generation:

1. install that generation's Cordis, Typert protocol/registry/loader, API Gateway, and required peers;
2. build Context Manager;
3. import/register the generated Host Typert contribution;
4. invoke `contextManager/protocol` through the real Gateway strict descriptor;
5. assert `{ apiVersion: 1 }`;
6. assert the strict descriptor is resolved from the registry and not reconstructed through SRC fallback.

## Exit criteria

M6A is complete when:

- clean `pnpm install --frozen-lockfile` remains valid;
- normal build and git-install prepare both emit strict Typert artifacts;
- package contracts include `./typert` and `./remote`, but no Web Client surface;
- the minimal endpoint is callable through the generated strict contract;
- all retained DSH runtime lanes pass;
- no existing M2–M5 Host/runtime behavior changes.
