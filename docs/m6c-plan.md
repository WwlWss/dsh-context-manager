# M6C — Preset / Runtime Diagnostics / Change Hints plan

Status: **implementation in progress**.

M6C completes the Host Remote API milestone after merged M6A and M6B. It projects already-existing native preset/runtime observations through explicit browser-safe DTOs and adds best-effort pull invalidation cursors. The Host remains authoritative; no browser cache, cursor, or event becomes a write fence or replicated source of truth.

## Scope

M6C owns three slices:

1. **Native Presets Remote**
   - path-free native preset roster and profile -> preset resolution;
   - exact composition read by preset id;
   - copy-only native preset authoring and removal through the existing DSH-owned Host bridge.

2. **Runtime Diagnostics Remote**
   - live Session preset identity;
   - Context Manager prompt-placement capability;
   - Prompt Runtime inspection;
   - Skill policy inspection;
   - Pinned Skill inspection.

3. **Change Hints**
   - a Host-lifetime instance id;
   - monotonic in-process invalidation cursors for profiles, Prompt Resources, preset observations, and runtime observations;
   - one unary `changes()` Remote method.

M6C deliberately does not own:

- a browser `./client` export or `dsh.client` manifest;
- Drawer/store/UI code;
- final rendered effective-context preview;
- Prompt or Pinned Skill body preview;
- Workspace/Session -> profile bindings;
- cold archived Session inspection;
- arbitrary Host filesystem targets;
- native preset YAML writes or blank-preset creation;
- correctness that depends on pushed Remote events.

## Why change hints are unary cursors

Retained `0.1.1-rc.2` has no usable Gateway Remote-event stream. Later retained generations do, but the forwarding source is selected centrally by `@deepseek-ai/dsh-api-remotes` through its static `API_REMOTE_FORWARDED_EVENTS` allowlist. A third-party package augmenting Typert event types does not add a runtime forwarding entry.

M6C therefore does **not** declare a custom forwarded Remote event. Doing so would risk a compile-time `ctx.remote.$on` surface that the Host never delivers.

Correctness remains pull-based:

```text
authoritative Host state
        ↓
unary strict Remote reads
```

`changes()` is only a best-effort invalidation hint.

## Change cursor contract

```ts
interface ContextManagerRemoteChangeSnapshot {
  instanceId: string
  generation: number
  profiles: number
  promptResources: number
  presets: number
  runtime: number
}
```

- `instanceId` changes on every Host process/service lifetime.
- `generation` increments whenever any channel changes.
- each channel increments only when a Remote surface depending on that channel may have changed.
- cursors are compared only for equality/inequality.
- cursors are never sent as `expectedRevision`.
- profile writes continue to use the DSH Settings revision.
- PromptResource writes continue to use the resource revision.
- a Host restart or changed `instanceId` invalidates every browser cache.

The tracker is intentionally not an audit log and does not promise to observe arbitrary out-of-band filesystem edits. Client correctness must also refresh after its own successful mutations, connection reset/reconnect, and normal UI lifecycle refreshes.

## Cursor dependencies

| Host fact changed | cursors bumped |
| --- | --- |
| Context Manager profile/settings change | profiles, presets, runtime |
| PromptResource durable mutation | promptResources, runtime |
| native preset copy/remove | presets |
| native `agent-presets` settings document update | presets |
| Agent created/disposed | runtime |
| live `agent-preset/selected` | runtime |
| native `skills/change` | runtime |

Failed mutations and stale-write refusals do not bump a cursor.

## Native Presets Remote

New methods:

```text
presets()
readPreset(id)
copyPreset(from, id, name | null)
removePreset(id)
```

The roster DTO is explicitly projected and path-free. Browser requests can identify only a native preset id; no endpoint accepts a filesystem path.

`readPreset(id)` returns the exact composition text DSH exposes. It does not parse, trim, normalize newlines, or rewrite YAML.

Copy/remove return a small successful receipt instead of chaining an independent roster read after the durable native operation. The Client re-pulls `presets()` after success.

Only stable Context Manager business errors join the package-owned result envelope. Native DSH refusal/errors and incompatible Host API shapes continue to throw instead of being flattened into an invented catch-all error.

## Runtime Diagnostics Remote

New methods:

```text
sessionPreset(sessionId)
promptPlacement()
inspectPromptRuntime(agentId)
inspectSkillRuntime(agentId)
inspectPinnedSkillRuntime(agentId)
```

M6C does not add Agent or Session roster APIs. DSH owns those lifecycles; Context Manager accepts their ids and reports only its own observations.

Runtime Remote DTOs are narrower than Host inspection objects. In particular an active effective-profile observation carries only:

```ts
{
  status: 'active'
  profileId: string
  presetId: string
}
```

The Host-only `profile: ContextProfile` object is never duplicated over the runtime wire. Browser profile content comes from `profiles()`.

Prompt diagnostics never carry PromptResource content. Skill/Pinned diagnostics never carry Skill instruction bodies, source paths, workspace paths, Scope objects, or native mutable objects.

## Structural Host ports

M6C extends the M6B structural-port pattern:

- Remote controller imports only pure `src/remote/*` contracts;
- runtime production resolves optional Host services with `ctx.get()`;
- compile-only assertions prove the real Host service classes satisfy the narrow ports;
- the isolated Typert workspace never copies M2-M5 Host service implementations or `src/runtime/types.ts`.

Pure M6C projector files are copied into the disposable Typert workspace and included in source-drift checks.

## Strict surface

M6B ships 21 direct strict endpoints. M6C adds 10:

```text
presets
readPreset
copyPreset
removePreset
sessionPreset
promptPlacement
inspectPromptRuntime
inspectSkillRuntime
inspectPinnedSkillRuntime
changes
```

The completed M6 Host Remote surface therefore contains **31** direct strict endpoints under the existing `contextManager` namespace and `dshContextRemote` service key. `apiVersion` remains 1 because this is additive completion of the same pre-client protocol surface.

## Compatibility proof

Generation remains pinned to the oldest retained `0.1.1-rc.2` toolchain. New wire types stay within the oldest generator's supported subset: interfaces, literals, unions, arrays, records, and nullable unions. Do not reuse Host runtime helper types containing `Readonly<T>`, `Extract`, conditional types, or other unsupported utility expansion.

CI builds one exact oldest-generated `lib/` artifact and runs those same bytes against:

- `0.1.1-rc.2`
- `0.1.2-rc.1`
- `0.1.5-rc.1`
- `0.1.5-rc.2`
- `0.1.6-alpha.2`

Every parameter/result codec must retain the dual `schema + create()` ABI established by M6A.

The five-generation Gateway fixture uses narrow fake Host ports to prove Typert/Registry/Gateway compatibility. Real Host semantic and lifecycle tests remain separate so the matrix does not rebuild the entire Agent runtime merely to test the transport ABI.

## Exit criteria

M6C is complete when:

1. change tracker lifecycle and exact post-commit bump behavior are covered;
2. preset roster/read/copy/remove Remote projection is path-free and exact;
3. runtime projections contain only the documented narrow facts;
4. active runtime profile projections do not contain the Host `ContextProfile`;
5. Prompt/Skill/Pinned diagnostic payloads contain no full instruction/content/path data;
6. generated Host reflection still exposes no M2-M5 service/event surface;
7. generated method set is exactly 31 endpoints;
8. every generated parameter/result codec remains strict with both retained ABI fields;
9. one oldest-generated artifact executes representative M6C flows through all five retained Gateways;
10. no custom pushed Remote event, browser Client surface, M8 render preview, M9 binding, arbitrary Host path, or native preset write API is introduced.
