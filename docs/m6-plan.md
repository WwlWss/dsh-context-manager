# M6 — Host Remote API implementation plan

Status: **M6A in progress**.

M6 creates the stable Host/browser boundary before Context Manager ships a substantial Web client. The Host remains authoritative; Remote methods project JSON-safe views and explicit mutations rather than exporting Cordis Service objects.

## Split

- **M6A — strict Typert Remote foundation:** generated Host/Remote artifacts, package contract, one `contextManager.protocol()` handshake, and retained-version compatibility proof.
- **M6B — profiles and Prompt Resources:** redacted browser reads, revision-fenced profile mutations, PromptResource CRUD, and stable business-result codes.
- **M6C — preset/runtime diagnostics and change hints:** path-free preset projection, existing runtime inspections, and pull-on-change notification where the Host generation exposes the public event carrier.

M6A intentionally contains no profile/resource mutation, no runtime preview, no Client bundle, and no `dsh.client` manifest.

## M6A public surface

The only business endpoint is:

```text
contextManager.protocol()
  -> {
       apiVersion: 1,
       transport: "typert",
       strict: true
     }
```

It is side-effect free. Its purpose is to prove that Context Manager is mounted through a generated strict Typert descriptor rather than Gateway SRC fallback.

The package publishes:

```text
./typert -> lib/typert.host.{js,d.ts}
./remote -> lib/typert.remote-client.{js,d.ts}
```

M7 will consume `./remote`; M6A does not yet publish `./client`.

## Standalone-package generator compatibility

Current retained DSH Typert generators only register package projects under a workspace `packages/` tree. Their `@Remote` identity check also recognizes `@deepseek-ai/dsh-typert-protocol` only when that declaration belongs to a registered workspace package or an ambient declaration with that exact module name.

That is an upstream build-time constraint for third-party npm plugin repositories, not a reason to use Gateway SRC fallback.

`scripts/generate-typert.mjs` therefore creates a disposable generation workspace:

1. copy the real `src/remote/protocol-controller.ts` into `.typert-build/packages/context-manager`;
2. provide only a build-time ambient declaration for the public Typert decorator/service identity;
3. run the official `WorkspaceTypertGenerator`;
4. write the generated Host and Remote artifacts into the package `lib/`;
5. delete the disposable workspace.

Production source and generated runtime artifacts still import/use the official DSH packages. The shim is never published and must never grow business behavior.

## Cross-generation strict codec projection

Retained 0.1.1 through 0.1.5 strict descriptors carry:

```text
{ mode: "strict", typeSymbol, schema }
```

0.1.6-alpha.1+ changed the public registry contract to lazy materialization:

```text
{ mode: "strict", typeSymbol, create: () => schema }
```

M6A generates from the oldest retained toolchain and mechanically augments each generated strict codec so one descriptor carries both fields. Older registries consume `schema`; newer registries consume `create`. Context Manager does not branch at runtime or publish per-Host package builds.

CI must execute the same packed artifact against:

- 0.1.1-rc.2;
- 0.1.2-rc.1;
- 0.1.5-rc.1;
- 0.1.5-rc.2;
- 0.1.6-alpha.2.

## Error and event boundaries

M6A has no domain-error surface.

M6B must not make `RemoteError` the only carrier of Context Manager business failures because the unified DSH RemoteError vocabulary starts after 0.1.1. Cross-generation Context Manager business outcomes will use a package-owned JSON result envelope while unexpected defects remain Gateway/infrastructure failures.

Likewise, Remote event streaming is not a correctness dependency: retained 0.1.1 predates that carrier. Future change notifications are hints to pull authoritative snapshots, never state replication.

## M6A exit criteria

M6A is complete only when:

1. a clean build and git `prepare` both produce `./typert` and `./remote`;
2. package-contract tests prove the generated files are shipped;
3. the generated endpoint is strict, not SRC fallback;
4. one packed M6A artifact is registered and invoked through the real published Typert Registry/Gateway on all five retained DSH generations;
5. the strict result codec rejects an invalid result in the compatibility fixture;
6. disposal withdraws the strict descriptor, the Gateway fails the previously strict endpoint closed instead of downgrading to SRC, and reload restores it;
7. no Client bundle, browser-side source of truth, arbitrary Host path, profile mutation, or M8 effective-context preview is introduced.
