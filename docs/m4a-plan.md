# M4A — Storage-backed Prompt Library

M4A is deliberately model-inert. It introduces durable reusable prompt bodies and nothing that can yet alter an Agent request. Prompt bindings belong to M4B; DSH `systemPrompt` integration belongs to M4C.

## Host boundary

Use DSH's public `storageDomain` capability. Context Manager does not read or write `$DSH_HOME` directly and does not own a second JSON/file-lock protocol. The Prompt Library service is dependency-gated on `storageDomain`; if that Host capability is absent, only this feature stays inactive while the existing profile/preset/session services remain available. There is no fallback to Settings.

Production code consumes the minimum structural public seam only: `storageDomain.open()`, domain `table()` / `close()`, and table `get()` / `entries()` / `put()` / `delete()` / `update()`. It does not import DSH implementation packages or expose backend paths.

## Durable domain

Domain name: `dsh_context_manager_prompts`  
Domain version: `1`  
Table: `resources`

The table key is the stable `PromptResourceId`; it is independent from the display name and never becomes a filesystem path.

A durable resource has these currently known fields:

```ts
interface PromptResource {
  readonly name: string
  readonly description?: string
  readonly content: string
  readonly revision: number
  readonly [futureField: string]: unknown
}
```

`content` is stored literally: no trimming, newline normalization, template escaping, tag parsing, or other repair. Empty text is valid. M4A does not interpret `{{...}}`; DSH template semantics become relevant only when a later runtime milestone contributes the resource to `systemPrompt`.

The Zod record schema uses `passthrough()`. DSH storage-domain stores the result of `schema.parse(raw)` as the authoritative in-memory record, so a stripping object schema would erase unknown future siblings during the next narrow update. Unknown fields are therefore preserved across reopen and structured edits.

## Host service

`ctx.dshContextPromptLibrary` exposes explicit resource operations:

```text
list()
get(id)
createPrompt(id, input)
replacePrompt(id, input, expectedRevision)
setPromptName(id, name, expectedRevision)
setPromptDescription(id, description | undefined, expectedRevision)
setPromptContent(id, content, expectedRevision)
deletePrompt(id, expectedRevision)
```

There is intentionally no generic `save()` mutation.

`createPrompt()` requires the exact stable id supplied by the caller and starts `revision` at `1`. A duplicate id rejects rather than overwriting. Later import/export can therefore preserve resource identities instead of forcing Host-generated replacements.

Every subsequent mutation requires an exact positive `expectedRevision`. All Context Manager writes first pass through one service-owned operation chain. Native table `update()` then performs the revision comparison inside storage-domain's serialized read-modify-write slot. Stale writes reject with a Context Manager conflict error and are never retried, merged, or normalized automatically. Cross-process concurrency remains owned by the configured DSH storage provider; Context Manager does not add a second filesystem or distributed locking protocol.

Structured replace/edit operations preserve unknown durable siblings. Clearing `description` removes only that known field. M4A does not add an advanced raw-resource overwrite API.

Reads are detached snapshots. DSH table values are authoritative in-memory objects and must not be mutated in place, so callers never receive the live stored object.

## Lifecycle

The service opens one domain during its Cordis initialization and owns `domain.close()` through its plugin effect. Unload/HMR therefore releases the domain so a replacement Context Manager fiber can reopen the same durable unit. No watcher or filesystem polling is added.

## Compatibility contract

M4A uses only the public storage-domain intersection present across the explicitly supported DSH generations:

- `0.1.1-rc.2`
- `0.1.2-rc.1`
- `0.1.5-rc.1`
- `0.1.5-rc.2`

It does not consume newer optional DomainSpec features such as `layout`, `compatibleVersions`, or `invalidRecords`.

The compatibility job compiles the minimum public `DomainSpec` seam and runs a real Host smoke with native `Storage`, `StorageJson`, and `StorageDomain` on every supported generation.

## Required regression coverage

Unit-level service tests cover exact ids/text, duplicate create, revision conflicts, narrow edits, structured replace, description deletion, preservation of unknown siblings, detached reads, explicit delete, malformed structured input, malformed-present storage capability, and lifecycle close/reopen.

The real native-storage smoke additionally proves:

1. prompt text containing leading/trailing whitespace, CRLF and LF, CJK, emoji, `{{variable}}`, and `{{unknown}}` survives create → close → reopen byte-for-byte as a string;
2. a future unknown field added through the already-open native storage-domain record survives close → reopen plus a normal `setPromptContent()` write;
3. the service can be unloaded and reopened against the same JSON storage root.

M4A's exit criterion is durable, lossless prompt-body CRUD with revision fencing on all supported DSH storage generations, while Agent/model behavior remains identical to stock DSH.
