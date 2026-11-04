# M8C — Native AgentPreset UX (Capability & Implementation Contract)

**Status:** B0 source-contract audit and design; published-package M8C-specific preflight not yet completed. No M8C Client production behavior has been qualified.
**Immutable baseline:** merged \`main\` \`39b46b2603ed749b8fda80f4748bff4a84c4d14f\` (PR #42); independent Post-Merge Full #41237721472, 86/86 successful, **baseline only**.
**Branch:** \`feat/m8c-native-preset-ux\`; one Draft PR per implementation slice.
**Scope:** a third, additive Presets pane inside the existing Drawer for exact native roster browsing, on-demand read-only composition inspection, explicit copy and explicit remove.

## 1. Frozen outcome and exclusions

1. Use the DSH-owned AgentPresets API; no direct paths/files, no shipped composition edits, no synthesized blank preset, rename, overwrite, default mutation or live Session recompose.
2. Browser renders exact native IDs, trust provenance, default and broken metadata from the established Remote DTO. \`trust: 'user'\` is **not** proof that deletion is permitted; native \`remove()\` alone enforces writable-root ownership.
3. \`readPreset(id)\` retrieves original composition **only after an explicit View action**; display as escaped, read-only text (never parse/execute HTML/YAML and never insert raw HTML). No automatic body fetch, analytics, persistent browser storage, error logs containing body, or background polling. A security/privacy preflight must decide if full raw composition can safely cross the existing authenticated Remote/Renderer boundary; narrow to a safe read-only representation if not.
4. \`copyPreset(from, id, name: string | null)\` is a single native copy. \`null\` delegates omitted native display name. Preserve strings byte-for-byte; do not trim or normalize; no local emulation.
5. \`removePreset(id)\` is one native remove after visible explicit confirmation with the exact ID and a warning that Profiles and live Sessions are **not** automatically repaired.
6. Native result/roster are different authorities: success is an RPC receipt; fresh roster read-back is a **separate** observation. Never mutate authoritative roster from a write receipt. Confirmed-but-degraded, native refusal, and transport-unknown must remain distinct. Never auto-retry a write.
7. Keep all Host/Remote v3 method signatures and existing M3C semantics unchanged absent an independently reproduced source defect.
8. No DSH 0.1.7+/0.2.x support expansion (breaking AgentPresetRegistry and Settings ownership changes are recorded in \`docs/dsh-v02-feasibility.md\`).
9. Deferred: M8B B3 Agent-scoped Skill diagnostics, M8D preview, M8E advanced stored-payload editor, native authoring outside copy/remove, arbitrary filesystem opener.

## 2. Source-level evidence on main

| Boundary | Source | Verified behavior / unresolved preflight |
| --- | --- | --- |
| Native adapter | \`src/adapters/preset-authoring.ts\` | Late binds optional \`ctx.agentPresets\`; requires one method at a time; read returns exact string; copy/remove delegate native argument/ownership semantics. |
| Host service | \`src/service/preset-authoring.ts\` | Explicit \`markPresets()\` after confirmed copy/remove. No cross-resource cascade. |
| Remote | \`src/service/remote.ts\` | \`presets()\` is a single-layer read; \`readPreset/copyPreset/removePreset\` return **inner** \`ContextManagerRemoteResult\`; generated client adds outer Typert \`RemoteResult\`. |
| DTO | \`src/remote/types.ts\` | Directory \`available/unavailable\` and \`authorable\`, native row \`id/trust/isDefault/broken\`, document \`{id,content}\`, receipt \`{id}\`. |
| Error boundary | \`src/remote/results.ts\` | Only recognized typed codes map to business refusal; ordinary native errors are sanitized to a generic Remote failure. Do not parse native error messages to invent codes. |
| Change tracker | \`src/service/change-tracker.ts\` | \`presets\` cursor is an **invalidation hint**, **not** a native CAS revision or storage authority. |
| Client ports/model | \`src/client/remote-port.ts\`, \`src/client/model.ts\` | Roster is already baseline surface; Client port lacks authoring/read methods, model lacks keyed native-document reader and preset mutation controller. |
| UI state | \`src/client/presentation-store.ts\`, \`src/client/plugin.ts\` | Shared DSH Store currently has two panes; existing old-event authorization assumes only Profile/Resource. |
| Published Host evidence | \`tests/preset-authoring-upstream-runtime.mjs\`; CI \`agent-presets-contract\` | Real native temp-root copy/read/remove already executes on retained published Host matrix; **not** a complete Browser→Remote M8C proof. |
| Client qualification | \`tests/client-profile-drawer-runtime.mjs\`, \`tests/m8b/run-skill-renderer-probes.mjs\` | Four real retained Renderer generations and 36-case M8B suite must stay intact. |

## 3. Native ownership and race model

**No fabricated \`PresetMutationBasis\` or CAS.** The native \`read/copy/remove\` API has no expectedRevision/atomic compare-and-swap parameter. Compare a rendered/confirmed target with a fresh Client roster, exact selected ID and current locally known \`presets\` change cursor **before dispatch** to refuse provably stale UI intent. The native operation remains the sole final arbiter; external process changes after the check are a documented TOCTOU limitation. Do not treat \`instanceId\` (Profile authority) or a \`presets\` cursor as a native transaction lock.

One **global native-authoring single-flight lane** for copy/remove, independent of existing Profile and Resource mutation lanes. Synchronous claim must happen before async code; preserve exact frozen arguments; no second write dispatch while occupied. The operation result contract mirrors established \`applied:{refresh:fresh|degraded}\`, \`rejected\`, \`unknown:{refresh:fresh|degraded}\`, \`superseded/detached/disposed/incompatible\` classifications.

Post-RPC recovery: request authoritative \`reconcile(['presets'])\`, then check actual attached/compatible fresh roster, original operation lifetime and the expected ID observation; a missing copied target or still-present removed target is **unverified** even if the method returned success. Do not auto-reissue the RPC or silently write Profile references. A business refusal may still refresh the roster, but cannot become success. A transport error cannot be called a known refusal.

Per-Drawer operation token, pane/selection, mount-generation and \`openSessionEpoch\` must fence **user-originated** stale callbacks; already dispatched RPC responses must be settled by original Controller ownership, not retroactively authorized by a newly opened pane. Keep first terminal notice attached to the exact draft token (including confirmed-but-degraded and Unknown), and only an explicit token-matching Discard releases it.

Preset composition bodies are sensitive read surfaces. Use on-demand keyed reader with bounded memory, request ownership and invalidation when selection changes, Host detaches, roster cursor changes, or pane exits; body must not be leaked in errors, logs, persisted drafts or untrusted DOM.

## 4. Client code mapping (additive)

| File | Proposed change |
| --- | --- |
| \`src/client/remote-port.ts\` | Narrow \`ContextManagerClientPresetRemote\` with outer Typert and inner business result; include in existing BusinessRemote. |
| \`src/client/model-types.ts\` | Explicit keyed Preset Document read surface, no additional Host source of truth. |
| \`src/client/model.ts\` | \`loadNativePresetDocument(id)\`; keyed read ownership/eviction; inject isolated preset controller; refresh only \`presets\` after native operation. |
| \`src/client/preset-mutation-types.ts\` | Separate operation-result union, single-flight statuses and public copy/remove methods. |
| \`src/client/preset-mutation-controller.ts\` | Owner epoch/operation ID, exact input, preflight, one write RPC, bounded reconcile/read-back, no duplicate dispatch. |
| \`src/client/business-face.ts\` | Frozen explicit native read/mutation projection; no direct Remote, lifecycle or Controller internals exposed. |
| \`src/client/preset-editor.ts\`, \`preset-drawer.ts\` | Pure view/draft helpers + third-pane read-only View, Copy and Remove controls. |
| \`src/client/presentation-store.ts\` | Explicit third pane, Preset selected ID/draft/token/receipt; change all two-way pane/draft guards into exhaustive three-way guards. |
| \`src/client/plugin.ts\`, \`locales.ts\`, \`plugin.module.css\` | Additive third pane and localization; retain original public Slot registration and shared Store. |
| Tests | New typed controller/model/presentation + real retained published Renderer probes, no removal of earlier qualifications. |

## 5. Test inventory (RED first)

- **P01–P03**: exact roster/trust/default/broken; unavailable/read-only degradation; explicit on-demand body read only.
- **P04–P05**: keyed read race/eviction and escaped composition (no execution, body in logs or persistence).
- **P06–P08**: exact copy parameters, \`null\` vs empty display name, target collision/native refusal.
- **P09–P12**: unconfirmed remove = zero RPC; confirmed remove = one RPC; native permissions/refusal; simultaneous/double-click writes = at most one RPC.
- **P13–P15**: selected target flip, raw-null effective fallback, same-epoch pane unmount/remount and Close→Reopen old callbacks are inert.
- **P16–P18**: Remote detach/host replacement, applied-but-degraded readback, transport Unknown/native error never retried or relabeled.
- **P19–P21**: other pane drafts block Preset draft and vice versa; native remove never mutates Stored Profile references or live Session identity; generated \`./remote\` and \`./client\` typings match all four supported Client ABI lines.
- **P22–P24**: published Host native temp-root cycle + explicit Remote round-trip; same-built four-version Renderer contract; packed browser/real Host composition negative cases.

## 6. Frozen stage gates and evidence policy

- **B0:** published Host \`0.1.1-rc.2\`, \`0.1.2-rc.1\`, \`0.1.5-rc.1\`, \`0.1.5-rc.2\`, \`0.1.6-alpha.2\` contracts and real Typert \`read/copy/remove\` preflight; four retained Client generations; source audit is **not** a substitute for E4/E5 runtime.
- **B1:** typed and real Renderer tests-only RED for missing Client authorization/read/draft semantics. Record exact test-only HEAD; failure must be from genuine missing behavior, not broken fixture.
- **B2:** Controller, Client read surface and model GREEN; no new Host/Remote protocol version or peer range.
- **B3:** third-pane UI GREEN, actual Published Renderer and a realistic Browser→Remote→Host composition control.
- **B4:** independent Strict Code Review (fix P1/P2), final exact-head Draft Quick; Ready 86-job Full with all prior groups preserved; exact-HEAD Final Review; merge; separate real \`main\` push Full on merge commit.

CI is **fail-closed**: no past M8B 86/86 can qualify M8C. Temporary preflight evidence must be explicitly labeled and must not weaken the stable \`dsh-context-manager / full qualification\` aggregation.

## 7. Open decisions requiring executed B0 evidence

1. Is returning raw native composition to an authenticated Browser acceptable for every retained published DSH generation? Evaluate sensitive metadata and safe rendering.
2. Which native failure cases produce a typed Context Manager business code versus generic Remote rejection? Preserve outcome uncertainty without parsing strings.
3. Can actual Roster read-back prove Copy/Remove membership from every retained public generation? If not, treat fresh read as evidence-limited and display degraded/unverified.
4. Does the native \`authorable\` flag gate copy capability while explicit remove remains a native decision? Never use \`trust\` as a client-side authorization oracle.
5. Validate the generated Remote method shapes on all retained published versions rather than guessing from Host TypeScript.

**No M8C GREEN is claimed until these gates have recorded execution evidence.**
