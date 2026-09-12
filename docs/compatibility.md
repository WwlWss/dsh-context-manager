# DSH compatibility

DeepSeek Harness evolves quickly. Context Manager separates **installable/tested package compatibility** from **source-forward review against the latest official repository** so the plugin can follow upstream architecture without confusing source review with package/runtime evidence.

## Current compatibility matrix

| Track | DSH reference | How it is used |
| --- | --- | --- |
| Legacy regression | `dsh-v0.1.1-rc.2` | The committed development dependency set. The full type/build/Domain suite exercises the legacy module-level `installSettingsSection(...)` generation. Focused published-package lanes exercise the M3A roster seam, the M3B legacy live-Session identity path through `Session.events`, and the M3C Host `read/copy/remove` authoring contract plus a real native authoring cycle. |
| Prior modern regression | `dsh-v0.1.2-rc.1` | Dedicated ephemeral CI keeps the first modern Settings generation and native Session `agentPreset` projection under regression. The full Settings suite, AgentPreset M3A/M3C declaration/behavior/native-runtime checks, M3B contract/runtime smoke, and bundle composition smoke all run here. |
| 0.1.5 published regression | `dsh-v0.1.5-rc.1` | Retained because it remains an important published/default-install line. CI reruns modern Settings, AgentPreset M3A/M3C declaration/behavior/native-runtime checks, M3B Session contract/runtime smoke, and full bundle composition smoke against it. |
| Newest reviewed published line | `dsh-v0.1.5-rc.2` | Install-tested forward line matching the AgentPreset generation currently present on official `master`. CI runs modern Settings, M3A/M3C compile and real-native authoring, M3B projection/runtime, strict packed-package peer installation, and full DSH bundle composition against this generation where applicable. |
| Latest official repository | `master` / `c291e796...` | Source-forward architecture target reviewed from official source. At this commit the AgentPreset package identifies itself as `0.1.5-rc.2` and preserves the same M3B projection/consumer pattern and copy-only native authoring model. Source review remains a separate assertion even when the same package generation is also install-tested. |

Support claims must name what was actually tested. A GitHub source tree and an installable npm package remain distinct evidence even when their package version currently matches.

The modern published lines used by CI ship `@deepseek-ai/cordis@4.0.2` and `@deepseek-ai/schemastery@3.18.2`; compatibility lanes use those public package generations while the ordinary development lockfile remains on the legacy generation. Keeping the frozen legacy lock means both Settings API shapes and both M3B Session-read branches remain visible instead of silently raising the minimum baseline.

## Settings compatibility rule

Context Manager owns the `dsh-context-manager` Settings namespace and never reads or writes DSH settings files directly.

The Settings public surface changed between the legacy and modern lines:

- `0.1.1-rc.2` exported `settingsNamespace()` and a module-level `installSettingsSection()` helper.
- `0.1.2-rc.1+`, including `0.1.5-rc.1`, `0.1.5-rc.2`, and current source, validates namespace strings in the Settings service and exposes the optional-consumer lifecycle as `settings.installSection(owner, ns, schema, entry, hooks)`.

`src/adapters/settings.ts` owns the narrow version seam:

1. if the legacy module-level `installSettingsSection(...)` export exists, delegate to it;
2. otherwise attach to the optional Settings service and require the modern `settings.installSection(...)` method;
3. keep the namespace value local and stable instead of importing the removed `settingsNamespace()` helper;
4. never reimplement DSH's detach/unload policy when one of its native public helpers is available;
5. never inspect a fork identity or import DSH implementation internals.

This is a DSH API-generation adapter, not a WwlWss-fork adapter. The same Context Manager package must run unchanged on official DSH and on a patched DSH fork that preserves one of the supported public Settings contracts.

The rest of the PR2 persistence model remains unchanged:

- Settings is authoritative storage;
- descriptor revisions are compare-and-swap fences;
- invalid external edits keep last-good resolved state without being silently repaired;
- semantic writes inspect the exposed raw user section before mutating from last-good state;
- no second Context Manager settings cache is maintained;
- `__proto__` remains rejected at Context Manager's advanced-write/path boundary while upstream Settings still carries its property-safe-construction limitation.

Two Settings limits are intentionally not papered over by Context Manager:

1. namespace write serialization/revision fencing is an in-process guarantee; cross-process convergence remains provider-defined;
2. Context Manager does not reach into provider internals to repair malformed storage or strengthen lifecycle guarantees beyond the public service contract.

The package peer declaration explicitly opts into the supported `0.1.5` prerelease series with `^0.1.5-rc.1`. This is necessary because prerelease semver ranges do not implicitly opt into a different `major.minor.patch` prerelease tuple. CI verifies the built tarball by installing it in a fresh consumer with `--strict-peer-dependencies` against `@deepseek-ai/dsh-settings@0.1.5-rc.2`; compatibility is therefore checked using the package manager's real peer-resolution rules rather than a string assertion.

## AgentPreset compatibility

Milestones 3A and 3C consume the optional public Host capability exposed as `ctx.agentPresets`. Production does **not** import or bundle `@deepseek-ai/dsh-agent-presets`.

The stable Host-service intersection shared by all supported published lines and current official source contains the M3A roster reads:

- `defaultId` — current native default id;
- `authorable` — whether the deployment has a user-authorable preset root;
- `list()` — one unmemoized roster read returning Host rows with `id`, `trust`, optional `name` / `description`, optional `broken`, plus Host-only implementation fields such as the absolute composition `path`;

and the M3C authoring methods:

- `read(id)` — asynchronous exact native composition text;
- `copy(from, id, name?)` — asynchronous DSH-owned whole-preset copy into its writable user root;
- `remove(id)` — asynchronous DSH-owned removal of a locally authorable preset.

Current published DSH declarations return `Promise<void>` from `copy()` and `remove()`, but Context Manager deliberately does **not** make that success payload part of its compatibility contract. Production only awaits completion and exposes `void`; CI therefore requires `Promise<unknown>` for those two operations while keeping their input signatures strict. A future DSH version may enrich the resolved success value without forcing a Context Manager compatibility break. `read()` remains strict `Promise<string>` because Context Manager consumes its resolved content.

The local structural interfaces are intentionally smaller than the native class. They prevent unnecessary coupling to package-root types, constructors, filesystem helpers, Remote clients, mount internals, and newer DTOs that did not exist on the legacy line.

This is still a native-first design. DSH owns discovery, root precedence, health, defaults, authorability, id containment, writable-root selection, collisions, copy/delete mechanics, and standing-mount lifecycle. Context Manager consumes the public service seam and never scans or mutates native preset directories directly.

### M3A runtime boundary

The structural seam is intentionally loose at package-resolution time but not unchecked at runtime.

- `ctx.get('agentPresets') === undefined` is the only condition mapped to capability `unavailable`.
- A present service must expose `list()`; otherwise M3A fails loud as an unsupported Host API rather than pretending the capability is absent.
- `defaultId` must be a string and `authorable` a boolean.
- `list()` must resolve to an array whose minimum consumed row fields match the supported Host contract: string `id`, `trust` of `system | user`, and optional string `name` / `description` / `broken`.
- Unknown additional service or row fields are ignored. The guard validates the minimum contract only; it does not inspect `path`, `order`, mount state, class identity, DSH version, or fork identity.

A widening of a field whose semantics Context Manager actually consumes, such as a new `trust` category, intentionally fails loud until reviewed. Pure additive metadata does not.

### AgentPreset upstream contract and runtime lanes

Runtime structural typing by itself would not make TypeScript notice an upstream declaration change. CI therefore has a compile contract fixture against:

- `@deepseek-ai/dsh-agent-presets@0.1.1-rc.2`;
- `@deepseek-ai/dsh-agent-presets@0.1.2-rc.1`;
- `@deepseek-ai/dsh-agent-presets@0.1.5-rc.1`;
- `@deepseek-ai/dsh-agent-presets@0.1.5-rc.2`.

The fixture loads the native package's public Cordis module augmentation and derives the consumed capability from `Context['agentPresets']`. It asserts the actual Host seam still provides the M3A roster fields/methods and the M3C operation signatures. For M3C, the exact input vocabulary and Promise completion boundary are pinned while `copy/remove` success payloads are deliberately allowed to widen because production ignores them. The check does not depend on package-root class identity or native implementation helpers.

Each AgentPreset lane then performs two runtime layers:

1. `preset-authoring.test.mjs` runs the structural bridge tests, including exact argument preservation, path-local validation, attach/detach behavior, native error identity, and intentional suppression of native success payloads;
2. `preset-authoring-upstream-runtime.mjs` mounts the real published `AgentPresets` service with explicit temporary system/user roots and executes an actual Context Manager `copy -> read -> native roster observation -> remove` cycle.

The native runtime smoke uses a minimal empty composition and disables derived real user/shipped roots where the generation supports those switches. Its purpose is to prove the bridge crosses the real Cordis/native service boundary, not to duplicate DSH's own tests for permissions, metadata rewriting, symlink handling, collision rollback, or root ownership.

This creates a deliberate evidence stack:

```text
production runtime: loose package coupling + narrow runtime validation
CI declaration:    minimum public TypeScript contract
CI bridge tests:   Context Manager semantics with controlled fakes
CI native smoke:   real published AgentPresets + temporary filesystem roots
```

### M3A rules

- Perform **at most one** native `list()` per aggregate Context Manager preset snapshot.
- Keep no roster cache across snapshots; native discovery is deliberately unmemoized so authored/deleted presets appear on the next read.
- Preserve `profile.basePreset` exactly; never trim, lowercase, rewrite, or replace it with `defaultId`.
- Distinguish `unavailable` (no capability) from `missing` (capability present, id absent) and `broken` (native discovery supplied a reason).
- Project fields explicitly. Never spread the Host `AgentPreset` object, because that would leak absolute `path` and other implementation fields into a future Remote/UI contract.
- `trust` is descriptive provenance, not an invented `editable` / `deletable` policy. Native authoring operations own those decisions.
- Do not call `resolve()` once per profile: it re-enters unmemoized discovery and would turn N profiles into N root scans.
- Do not call `mount()`, `recompose()`, `standingKeyFor()`, or any other composition-affecting API from M3A.
- Do not catch a failing `list()` and label it `unavailable`; only capability absence means unavailable. A present native service that fails discovery must fail loud.
- Treat the aggregate result as an authoritative best-effort observation, not an atomic transaction spanning Settings and the preset filesystem.
- Treat the aggregate snapshot as a control-plane read. Native roster discovery is filesystem-backed and intentionally unmemoized, so future Remote/UI code must not poll it per render frame, token, Session event, or request hot path.
- Keep adapter mechanics private to the package. The root package exports stable read-model types and `ContextManagerPresetDirectory`, not discovery/validation/builder helpers.

### M3C native authoring compatibility

M3C uses only the Host methods that existed unchanged across the four install-tested published lines. It deliberately does not call the newer Remote authoring facade even though modern DSH exposes one, because the legacy-compatible Host intersection is sufficient and keeps browser transport out of the Host plugin.

The bridge is path-local:

- `read()` validates only the presence/result shape of native `read()`;
- `copy()` validates only native `copy()`;
- `remove()` validates only native `remove()`;
- every operation resolves `ctx.get('agentPresets')` at call time, so optional capability attach/detach cannot leave a stale cached service;
- ids and display names are passed exactly as authored; Context Manager does not trim, lowercase, pre-validate DSH's preset-id regex, or substitute defaults;
- native failures propagate without message parsing or legacy/modern error translation;
- native `copy/remove` success payloads are intentionally discarded, keeping DSH DTO evolution outside Context Manager's API.

This error rule matters because `0.1.1-rc.2` reports dedicated Error subclasses such as `PresetExistsError`/`PresetNotWritableError`, while modern DSH maps corresponding refusals to stable `RemoteError` codes. M3C does not make legacy message text part of its own contract. A future browser Remote layer may define a transport-level normalization only when that layer is implemented.

Native `copy()` and `remove()` are the transaction boundaries. Context Manager must not call exported lower-level helpers such as `copyComposition()` or `deleteComposition()` because that would bypass DSH-owned roster collision policy, standing-mount invalidation, and native-default cleanup.

`authorable` is a diagnostic/capability hint, not a substitute for executing the native operation. Likewise `trust: "user"` does not prove removability: deployments with multiple user roots may discover a `user` preset outside the first writable root, and native `remove()` correctly refuses it.

M3C keeps Stored / Resolved / Effective state independent. Removing a native preset does not rewrite any Context Manager profile and does not alter a live Session's recorded identity. Tests explicitly assert the post-delete state can be:

```text
Stored profile basePreset = "my-preset"
M3A resolved state       = missing
M3B live Session preset  = "my-preset"
```

### Native authoring concurrency boundary

Context Manager does not claim to serialize the complete set of native AgentPreset writers. A Context Manager-local mutex could only coordinate Context Manager calls; it could not serialize the stock DSH authoring UI, another plugin/process, or a manual filesystem writer. Adding such a mutex would therefore provide a misleading partial guarantee.

Current DSH authoring source uses native collision checks/backstops and rollback. Source review also shows that global same-id cross-writer serialization is not a public consumer contract. Concurrent native-write correctness belongs in DSH's `AgentPresets` authoring transaction. If upstream needs stronger same-id ownership/cleanup semantics, that should be implemented and regression-tested there rather than reproduced by Context Manager.

A future Context Manager UI may suppress duplicate clicks while one explicit mutation is pending, but that is UX duplicate suppression, not a cross-writer transaction guarantee.

## M3B Session preset identity compatibility

Milestone 3B observes the AgentPreset identity recorded by a **currently live** DSH Session. It deliberately does not open Session persistence, acquire `SessionHandle`s, resume cold Sessions, or inspect archive storage. DSH owns creation, persistence, resume, and Agent composition; Context Manager observes the Session only after DSH has published it through the live SessionStore.

The public semantic rule is shared across the supported lines:

```text
creation header agentPreset
        ↓
newest committed agent-preset/selected event wins
        ↓
effective recorded Session preset identity
```

The read seam changed:

- `0.1.1-rc.2` exposes the immutable creation header and legacy public `Session.events`; M3B folds the small public record locally.
- `0.1.2-rc.1`, `0.1.5-rc.1`, `0.1.5-rc.2`, and current source expose native `agentPreset: string | null` Session projection state. M3B prefers `ctx.sessionProjections.stateOf(session, 'agentPreset')`.
- if the projection capability/key is genuinely absent, M3B may fall back to the public Session log representation (`snapshotEvents()` on modern Sessions, legacy `events` on the old line).
- if a present projection returns a value other than `string`, `null`, or absent, M3B fails loud instead of hiding an incompatible Host API behind the fallback.

`SessionPresetIdentity` is intentionally independent from M3A profile resolution:

- `unavailable` means the live SessionStore capability itself is absent;
- `not-live` means the requested id is not currently published in that SessionStore; it does **not** claim that no persisted Session with that id exists;
- `known.presetId` is exact `string | null`, with no trimming, normalization, roster lookup, default substitution, or health rewrite.

A Session can therefore truthfully record `foo` even if the current native roster no longer contains `foo`, and changing a Context Profile's configured base preset does not rewrite an existing Session's identity.

### M3B package and runtime boundary

Production does not import or bundle `@deepseek-ai/dsh-session`, `@deepseek-ai/dsh-session-projection`, or `@deepseek-ai/dsh-agent-presets`. It discovers the optional Cordis capabilities structurally through `ctx.get(...)` and validates only the fields/methods it consumes.

The separate `ContextManagerSessionPresetIdentity` Host service owns this read model. It is not added to `ContextManagerPresetDirectory` and it does not modify `ContextProfile`, because Session effective identity and profile configured/resolved state have different lifecycles and no authoritative binding exists yet.

M3B must not call native `list()`, `resolve()`, `mount()`, `recompose()`, `select()`, or any other composition-affecting operation. Native default id is irrelevant to an already-recorded Session identity.

### M3B compatibility lanes

CI executes both declaration contracts and runtime behavior against:

- `0.1.1-rc.2` — legacy `Session.events` branch;
- `0.1.2-rc.1` — native Session projection branch and prior-modern regression;
- `0.1.5-rc.1` — native Session projection branch on the retained 0.1.5 published line;
- `0.1.5-rc.2` — native Session projection branch on the newest reviewed published line.

The runtime smoke creates an actual published-package `Session`, appends an actual `agent-preset/selected` record, and on modern lines registers the actual native `agentPresetProjectionDefinition` with the actual `SessionProjectionRegistry`. This ensures the compatibility branches production relies on are executed rather than merely simulated by structural fakes.

Current official source at `c291e796...` was re-reviewed during M3C. It still defines the same `string | null` AgentPreset projection and first-party Session Controller reads it through `stateOf(session, 'agentPreset')`, so no additional source-forward adapter is needed.

## System prompt and runtime-context guardrails

Future prompt work must continue to use DSH-owned prompt/runtime-context composition rather than replacing the agent loop or rewriting native preset files.

- placement must map to actual public DSH prompt/runtime-context capabilities;
- a restrictive preset such as Minimal must surface unavailable placement honestly rather than simulating success;
- arbitrary SillyTavern numeric historical `depth=N` insertion is not equivalent to system-prompt placement and must not be faked through a different seam;
- any future adapter must be rechecked against the then-current installable and source-forward DSH contracts before it ships.

These are architecture constraints, not claims that prompt overlays are implemented in the current build.

## Skills guardrails

DSH remains the owner of the native Skill registry/providers. Context Manager's future Pinned / Auto / Manual / Off behavior must be an explicit overlay over public Skill capabilities, not a rewrite of skill files or providers.

Before claiming hard Manual/Off semantics, tests must cover scope precedence, same-name shadowing, provider invalidation, cold/resumed sessions, disposal, and invocation leakage. If the current DSH version cannot faithfully express the requested policy, the capability must be reported unavailable rather than simulated.

These are future-runtime requirements; the current build only persists skill binding intent.

## Session and model-visible Surface boundary

Modern DSH substantially changed Session APIs relative to the legacy line:

- eager `Session.events` access moved to bounded/snapshot-oriented APIs such as `snapshotEvents()`;
- current Session persistence is lifecycle-owned through `SessionHandle` rather than being a loose read/write helper;
- Agent creation/resume and maintenance semantics are owned by DSH lifecycle services;
- the Session format and projection/cache machinery have continued to evolve.

M3B intentionally stays above that persistence seam. The `SessionHandle` migration matters only if a later Context Manager capability independently inspects a cold stored Session. Such a capability must be designed against the then-current Session Query/persistence contract rather than extending M3B's live-session reader downward.

The latest official source still defines model-visible Surface replacement and uses replacement/shadowing in built-in maintenance such as compaction. That remains a valid architectural foundation for later history transforms, but it does **not** mean Context Manager already has a verified public lifecycle/maintenance hook for arbitrary history transforms.

Therefore future history work must verify the complete current public extension path — Session ownership/locking, maintenance serialization, replacement commit rules, replay/resume, and coexistence with compaction — before implementation. Do not revive an old direct-Session pattern merely because the low-level Surface primitive still exists.

The small-summary pattern is only a representative user-authored preset/use case. Context Manager must provide generic authorable selectors/triggers/extractors/replacements; it must not hard-code `<summary>`, a turn threshold, or summary generation as special Domain semantics.

## Web client and presentation guardrails

Future Web work remains additive to DSH composition:

- advertise a `dsh.client` face only in the PR that actually ships and contract-tests the client artifact;
- do not replace the occupied single `details` surface merely to add Context Manager UI;
- prefer additive public shell/conversation slots when available;
- do not patch the stock keyed assistant renderer;
- display-only transforms must remain separate from model-visible history transforms;
- user-enabled HTML/JavaScript helpers must run in an isolated browser runtime with an explicit capability bridge, not with ambient parent-page authority.

As with the prompt and Skill sections, these are maintained architectural guardrails, not claims that a Web client already exists.

## Windows fork fixes are not plugin dependencies

Context Manager must never depend on private fixes in `WwlWss/deepseek-harness`.

In particular, local Win32 safety patches and any future Session/projection performance patch are DSH-fork implementation changes. Context Manager may rely on public capability values and semantics, but never on their private implementation or event/broadcast frequency.

A user must be able to switch official DSH <-> patched DSH without installing a different Context Manager build.

## Compatibility rules for future PRs

When a PR begins using a new DSH seam:

1. identify the public package/service/Remote/Slot contract that owns the behavior;
2. compare the newest relevant installable DSH package(s) with the latest official repository source;
3. add a focused adapter only for an actual signature/semantic difference;
4. never import production code from DSH `src/` internals;
5. add a focused runtime/contract test that actually executes every supported compatibility branch relied on by production code;
6. use real published-service smoke tests for mutation boundaries where structural fakes alone cannot prove integration;
7. use bundle smoke tests for installation/composition claims, not as a substitute for runtime API tests;
8. use source-forward review for repository changes and keep that evidence distinct from package testing;
9. keep unsupported/missing optional capabilities explicit instead of simulating them;
10. update this document when the minimum tested DSH contract changes.

The compatibility objective is **one plugin codebase across supported official DSH lines and compatible forks**, not one plugin version per host build.
