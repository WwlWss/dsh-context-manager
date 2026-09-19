# M4A — Storage-backed Prompt Library

M4A is deliberately model-inert. It introduces durable reusable prompt bodies and nothing that can yet alter an Agent request. Prompt bindings belong to M4B; DSH `systemPrompt` integration belongs to M4C.

## Host boundary

Use DSH's public `storageDomain` capability. Context Manager does not read or write `$DSH_HOME` directly and does not own a second JSON/file-lock protocol. Production code consumes only `storageDomain.open()`, domain `table()` / `close()`, and table `get()` / `entries()` / `put()` / `delete()` / `update()`.

## Stored payload versus Domain view

Domain name: `dsh_context_manager_prompts`  
Domain version: `1`  
Table: `resources`

The table key is the exact stable `PromptResourceId`. It is independent from display name and remains arbitrary authored text.

Storage and current Domain validity are intentionally separate:

```text
StoredPromptPayload (opaque JSON record)
        ↓ per-resource parse
PromptResource | invalid-resource summary
```

The storage-domain record schema accepts the opaque stored payload. `PromptResource` parsing happens independently for each record. A future or malformed resource therefore cannot make the entire authoritative library fail to open; usable siblings remain available and the malformed id remains visible through `list()` diagnostics.

The current usable Domain shape is:

```ts
interface PromptResource {
  readonly name: string
  readonly description?: string
  readonly content: string
  readonly revision: number
  readonly [futureField: string]: unknown
}
```

`content` is literal. There is no trimming, newline normalization, template parsing, fallback, repair, or sorting.

## Structured authoring and unknown fields

`createPrompt()` and `replacePrompt()` validate the known authoring fields while preserving caller-supplied JSON-shaped extension fields. `revision` is library-owned and an authored `revision` is rejected explicitly rather than silently overwritten.

Structured writes preflight extension data so values that JSON persistence would silently change, such as `undefined`, non-finite numbers, or class instances, are rejected before the durable write. Storage-specific authoring does not inherit the Settings-specific property-path restriction; valid JSON property names are not cosmetically banned.

`replacePrompt()` merges extension fields conservatively: existing unknown siblings survive when omitted, newly authored unknown siblings are accepted, and an explicitly supplied new unknown value replaces the old sibling with the same key. Known fields and the new library-owned revision are written last.

## Host service

`ctx.dshContextPromptLibrary` exposes:

```text
list() -> metadata/diagnostic summaries only
get(id) -> detached full usable resource
createPrompt(id, input) -> mutation receipt
replacePrompt(id, input, expectedRevision) -> mutation receipt
setPromptName(id, name, expectedRevision) -> mutation receipt
setPromptDescription(id, description | undefined, expectedRevision) -> mutation receipt
setPromptContent(id, content, expectedRevision) -> mutation receipt
deletePrompt(id, expectedRevision)
```

There is no generic `save()` mutation and no raw-resource overwrite API in M4A.

`list()` deliberately excludes `content` and arbitrary extension payloads so future Remote/UI directory reads do not clone or transport every prompt body. Targeted `get(id)` returns the complete detached usable body.

Mutations return only `{ id, revision }`. A successful durable path-local repair therefore cannot be reported as a failed mutation merely because unrelated fields still fail the complete current Domain parser.

## Revision fencing and path-local repair

Create starts at revision `1`. Every later mutation requires an exact positive `expectedRevision`. All Context Manager writes pass through one service-owned operation chain; native `table.update()` performs read-modify-write in DSH's serialized domain write slot.

Leaf setters require only an object-shaped stored record, a usable revision fence, and validity of the requested new leaf. They do not require unrelated current fields to parse first. This lets a user repair one malformed known field without replacing unrelated stored intent. A malformed or missing revision rejects with `prompt-resource-path-not-editable` because a safe compare-and-set cannot be performed.

## Lifecycle and adapter cleanup

The service opens one domain during Cordis initialization and owns `domain.close()` through its plugin effect. The storage adapter validates the returned public capability before exposing it. If `open()` succeeded but later capability validation fails, the already-owned native domain is closed before the validation error is rethrown; the successful path registers exactly one normal lifecycle close.

## Backend/layout decision

M4A intentionally keeps the common legacy-compatible DomainSpec and does not request `layout: 'per-record'`.

Two constraints make that deliberate:

1. `layout` is not in the oldest supported public DomainSpec generation;
2. current JSON per-record storage turns record keys into path-safe names, while `PromptResourceId` intentionally remains arbitrary authored text.

The JSON single layout can rewrite the whole unit on one write. Large/frequently edited libraries should use DSH provider routing to a backend such as SQLite rather than forcing Context Manager to invent a second storage protocol. A future JSON per-record design would require an internal path-safe storage key plus an explicit storage-version migration; it must not silently narrow external PromptResourceId.

## Compatibility and regression contract

Supported generations remain:

- `0.1.1-rc.2`
- `0.1.2-rc.1`
- `0.1.5-rc.1`
- `0.1.5-rc.2`
- `0.1.6-alpha.2`

Compatibility evidence must compile the public DomainSpec fixture and run the real Storage/StorageJson/StorageDomain reopen smoke for every generation. The smoke proves exact prompt text and unknown fields survive reopen, one malformed stored resource does not brick the library, and a normal path-local update preserves unknown durable siblings.

Unit tests additionally cover metadata-only list reads, malformed-resource diagnostics, path-local repair, unusable revision fences, caller extension preservation, reserved revision rejection, JSON-shape preflight, detached targeted reads, explicit delete, and lifecycle close/reopen.

M4A's exit criterion is durable and tolerant prompt-body CRUD with revision fencing on all supported DSH storage generations while Agent/model behavior remains identical to stock DSH.
