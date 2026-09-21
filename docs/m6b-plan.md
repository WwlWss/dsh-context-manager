# M6B — Profiles and Prompt Resources Remote plan

Status: **implementation in progress**.

M6B is the first business Remote slice after the strict Typert foundation shipped in merged PR #19. It exposes browser-safe profile state and explicit profile/PromptResource mutations while keeping the Host services authoritative.

## Scope

M6B owns:

- redacted browser profile snapshots;
- revision-fenced profile mutations;
- profile-local SkillBinding and PromptBinding mutations;
- PromptResource metadata/list/get/create/replace/delete;
- package-owned machine-readable business-result errors;
- strict generated Typert descriptors for every endpoint;
- retained five-generation Gateway execution of the same oldest-generated artifact.

M6B deliberately does not own:

- native preset roster projection or native preset authoring;
- live Session preset identity;
- Prompt/Skill/Pinned runtime inspections;
- Remote change events;
- browser Client packaging or `dsh.client`;
- advanced raw Stored-profile editing;
- whole-profile replacement from a browser view;
- rendered effective-context preview.

Those remain M6C, M7, M8, or later advanced-editor work.

## Host prerequisites

The existing Host service remains the Domain/persistence owner.

M6B adds:

```ts
snapshotForWire()
setProfileName()
setProfileDescription()
setProfileBasePreset()
```

`snapshot()` remains the verbatim Host-authoritative read. `snapshotForWire()` uses DSH Settings `describe({ redactSecrets: true })` before Domain normalization. Remote code then performs an explicit field-by-field projection, so future Host fields cannot widen the wire accidentally.

Profile editing over Remote is path-local. M6B does not expose `replaceProfile()` or `setRawProfile()`: a browser view is intentionally narrower/redacted and must never rebuild a whole Stored profile from incomplete data.

## Wire vocabulary

`src/remote/types.ts` owns the browser protocol. DTOs are JSON-safe and deliberately separate from Host Domain types.

The profile snapshot carries:

- schema compatibility;
- configured/usable default ids;
- usable profiles with known profile/SkillBinding/PromptBinding fields only;
- Domain diagnostics;
- persistence availability/writability and Settings revision.

PromptResource list responses remain metadata-only. Full content crosses only through targeted `getPromptResource(id)`.

## Business failures

Retained `0.1.1-rc.2` predates the later shared `RemoteError` vocabulary, so correctness cannot depend on it.

Expected business failures use:

```ts
type ContextManagerRemoteResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ContextManagerRemoteError }
```

Context Manager error codes are mapped directly. Native `SettingsConflictError` is projected as `profile-conflict` with `expectedRevision` and `actualRevision`.

Invalid wire revisions are rejected as `invalid-revision` before mutation.

Unexpected programming defects, incompatible Host shapes, Gateway failures, or unknown infrastructure exceptions are not converted into business results. They remain thrown failures.

## Profile mutation results

Every successful profile mutation returns a fresh redacted authoritative profile snapshot rather than a bare acknowledgement or revision.

This prevents a browser from pairing stale local data with a newer fence when another writer lands between mutation commit and response projection.

## PromptResource mutation results

PromptResource storage already owns a per-resource positive revision. Create/replace return the Host mutation receipt; delete returns the deleted id. List remains metadata-only and get returns the narrow content DTO.

## Structural Host ports

The Remote controller does not import Context Manager Host service classes.

It depends on narrow structural ports under `src/remote/host-ports.ts`. A separate compile-only assertion proves `ContextManagerService` and `ContextManagerPromptLibrary` satisfy those ports.

The isolated Typert generation workspace copies only:

- `src/service/remote.ts`;
- `src/remote/types.ts`;
- `src/remote/host-ports.ts`;
- `src/remote/project.ts`;
- `src/remote/results.ts`.

It does not copy M2-M5 Host service implementations, so Typert reflection cannot widen to those services.

## Public Remote methods

Profiles:

- `profiles()`
- `createProfile(id, input, expectedRevision)`
- `deleteProfile(id, expectedRevision)`
- `setDefaultProfile(id | null, expectedRevision)`
- `setProfileName(...)`
- `setProfileDescription(...)`
- `setProfileBasePreset(...)`
- `setSkillMode(...)`
- `removeSkillBinding(...)`
- `addPromptBinding(...)`
- `setPromptBindingResourceId(...)`
- `setPromptBindingEnabled(...)`
- `setPromptBindingPlacement(...)`
- `setPromptBindingOrder(...)`
- `removePromptBinding(...)`

Prompt Resources:

- `listPromptResources()`
- `getPromptResource(id)`
- `createPromptResource(id, input)`
- `replacePromptResource(id, input, expectedRevision)`
- `deletePromptResource(id, expectedRevision)`

Together with M6A `protocol()`, the strict contribution contains 21 direct endpoints.

## Compatibility proof

Generation remains pinned to the oldest retained `0.1.1-rc.2` generator/protocol.

CI builds one exact `lib/` artifact once, applies the existing strict-codec dual-ABI projection, uploads it, and reuses those same bytes against:

- `0.1.1-rc.2`
- `0.1.2-rc.1`
- `0.1.5-rc.1`
- `0.1.5-rc.2`
- `0.1.6-alpha.2`

The Gateway matrix verifies every parameter/result codec exposes both retained ABI forms, then executes representative profile reads/mutations/conflicts and PromptResource CRUD through the real Registry/Gateway.

## Exit criteria

M6B is complete when:

1. Host wire snapshot redaction and profile leaf mutations pass Domain tests;
2. Remote profile and PromptResource behavior passes direct service tests;
3. generated Host reflection still exposes no M2-M5 service/event surface;
4. generated Remote method set is exactly the intended 21 endpoints;
5. every generated parameter/result remains strict with the retained dual codec ABI;
6. the same oldest-generated artifact executes representative M6B flows through all five retained Gateways;
7. packed/prepare contracts remain valid;
8. no M6C runtime/preset surface, Remote event, M7 Client artifact, M8 preview, raw-profile Remote, or arbitrary Host path is introduced.
