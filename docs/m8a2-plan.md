# M8A2 — Profile PromptBinding Editor (Capability Contract)

**Status:** **Draft Fix2 RED→GREEN implementation complete; third independent Strict Review required.** The second [Strict Review #5699377959](https://github.com/WwlWss/dsh-context-manager/pull/41#pullrequestreview-5699377959) found two additional P2 race/notice gaps. Both reproduced in actual CI/Renderer and were repaired; the latest focused published Renderer [#40899019850](https://github.com/WwlWss/dsh-context-manager/actions/runs/40899019850) passes on code commit `0e65117c`. Final Draft Quick and documentation/workflow closeout will be tied to a later exact HEAD. **This is not Ready Full Qualification; do not merge.**  
**Base:** merged M8A1 PR #40, `main` commit `e37fa7284cbed4ae8b8cc92969f6d75bb147d9ea`; independent post-merge Full Qualification [#40754041892](https://github.com/WwlWss/dsh-context-manager/actions/runs/40754041892) completed with **86/86 jobs successful, zero failed/skipped**.  
**Branch:** `feat/m8a2-prompt-binding-editor`. This branch/one eventual Draft PR remains the single delivery vehicle from plan through qualification.  
**Ownership:** M8A2 edits **Profile-local PromptBindings** through the existing **Profile** write domain. M8A1 edits **PromptResources** through the independent **Resource** write domain.

## 1. Product outcome and scope freeze

Add a PromptBindings section inside the **selected usable Profile's existing Drawer detail**, without adding a third top-level tab or redesigning the M7C Profile and M8A1 Resource views.

- Display the selected Profile's bindings with exact `bindingId`, `resourceId`, `enabled`, semantic `placement`, and numeric `order`.
- Create a complete binding in one explicit `addPromptBinding` operation.
- Edit an existing binding by **one field per explicitly submitted Save**, using exactly one of the four existing leaf setters. Editing several fields is a sequence of separately authorized user saves, never a hidden sequence launched by one Save.
- Delete exactly one binding after explicit confirmation; do not delete its referenced PromptResource or mutate other bindings.
- Offer a **free-form exact Resource ID input** with optional, metadata-only suggestions from B1-3's lazy resource list; support unresolved, invalid, duplicate and temporarily unverifiable resource references as authored intent.
- Show the configured binding and separately qualified capability/resource-health hints. Do not invent per-Agent effective-context claims from global Profile data.
- Retain a Profile-side draft through Drawer close/reopen; block record/pane switching while a draft exists, and require deliberate Cancel/Discard. Unknown, conflict, stale, and confirmed-but-degraded results must not cause a second write.

**Non-goals:** Host service or Settings changes; Remote v4; generated Typert/ABI changes; Profile or Resource Controller rewrites; a second authoritative Client cache; automatic polling; bulk binding mutation/transaction; multi-field replace; binding rename disguised as an edit; drag-and-drop auto-renumbering; resource-content editing; Session/Workspace binding; actual final-context preview; new Agent discovery or selection; advanced raw repair of malformed Profile payloads.

A confirmed defect in an existing seam is a separately justified minimal repair with its own RED regression and review, not a reason to silently enlarge this feature.

## 2. Existing contracts to reuse (no new DSH public seam)

### 2.1 Domain / Stored semantics

`src/domain/model.ts` already defines a Profile-local map `prompts: Record<PromptBindingId, PromptBinding>`. Its known leaf shape is:

~~~ts
interface PromptBinding {
  readonly resourceId: string
  readonly enabled: boolean
  readonly placement:
    | 'before-persona'
    | 'after-persona'
    | 'before-tool-guidance'
    | 'after-tool-guidance'
    | 'runtime-context'
  readonly order: number
}
~~~

`parsePromptBinding` requires a string resourceId, a boolean enabled flag, a supported placement and `Number.isSafeInteger(order)`. **Negative values, zero, duplicate values, and ties are valid**. Do not clamp, round, normalize, force uniqueness, or silently move placements.

A binding ID is an exact **Settings path key**, unlike the exact PromptResource ID stored as its `resourceId` value. Host `assertSafePathKey` currently prohibits exactly `__proto__` for the key because of DSH Settings' known property-safety limitation; `constructor` and `prototype` are permitted. Do not add a general slug/ASCII/trim rule. Host is the final authority for path validity. **Confirmed through real published Host/Settings execution:** empty string, whitespace-only, Unicode/tab/slash-containing IDs, `constructor`, and `prototype` are valid exact Binding IDs on `0.1.1-rc.2`, `0.1.2-rc.1`, `0.1.5-rc.2`, and `0.1.6-alpha.2`. Only `__proto__` is rejected by the known Host path guard. The UI may explicitly warn about visually ambiguous empty/whitespace IDs but must not disable or normalize them. Resource ID strings are values, **not** Settings-path segments: retain exactly, including `__proto__`, whitespace or unresolved IDs. The existing Domain does not require referenced resources to exist.

Known fields in the wire/Domain projection do **not** include unknown Stored siblings. Host narrow leaf mutations must preserve them. Never reconstruct a whole binding or Profile from the projected DTO for a write; never serialize a five-field substitute for an existing raw record.

### 2.2 Six frozen Profile mutation operations

Use only the existing Business Face `props.profileMutations` and `props.captureProfileMutationBasis()`:

| Explicit UI command | Existing Client operation | Mutation shape |
| --- | --- | --- |
| Create | `addPromptBinding(basis, profileId, bindingId, input)` | One complete binding payload |
| Change referenced resource | `setPromptBindingResourceId(basis, profileId, bindingId, resourceId)` | One leaf |
| Enable/disable | `setPromptBindingEnabled(basis, profileId, bindingId, enabled)` | One leaf |
| Change placement | `setPromptBindingPlacement(basis, profileId, bindingId, placement)` | One leaf |
| Change order | `setPromptBindingOrder(basis, profileId, bindingId, order)` | One leaf |
| Delete | `removePromptBinding(basis, profileId, bindingId)` | One binding removal |

Remote v3 uses the same six methods and the **Profile** basis `{ instanceId, revision }`. The existing Host captures Settings revision, checks safe path keys and path-local structure, and persists by native `settings.mutate` with its expected revision. Resource write authority/incarnation/revision **never substitutes** for that Profile basis.

The sole authoritative Profile state is B1-1's `snapshot.profiles`; the existing Controller has one global Profile single-flight lane, separate from the M7B2-B1 Resource lane. Mutation responses are **not** an alternate authoritative UI cache: wait for the Controller's B1-1 rehydration result and render that snapshot.

### 2.3 Source data and diagnostic boundaries

- **Profile binding rows** come only from `snapshot.profiles.data.profiles[profileId].prompts`. Invalid stored binding values cause the current Domain parser to diagnose the **whole Profile as invalid**, so the wire does not expose an independently editable raw invalid binding. Show the existing invalid-Profile diagnostic/read-only view; defer raw salvage to M8E. Do not fabricate individual invalid-binding rows.
- **Resource suggestions/health** use only `snapshot.resources.list` plus the existing `loadPromptResourceList()` lazy method. The list is metadata-only; no `getPromptResource` or body loading for binding management. Fresh usable/invalid/missing, and stale/unavailable `unverified`, are **read-only hints**. A failed, stale, detached, or replaced Prompt Library must not itself block a Profile mutation with an otherwise valid Profile basis.
- **Placement capability** uses the existing `snapshot.promptPlacement` projection: `available` with the five channel mappings, `unavailable`, or `unverified` if its Client surface is not fresh. Display configured placement even when its native channel is unavailable. Global availability is **not** proof a specific Agent is using the binding.
- Native suppression / effective resolution is **Agent-scoped**, observable only through B1-3's explicitly keyed live-Agent prompt diagnostics. M8A2 does not invent an Agent ID or start roster discovery. Without an already trustworthy specific Agent identity, label effect **unverified** and defer a full preview to M8D; do not claim `eligible`, `effective` or `native-suppressed` merely by inferring from the configured Profile.
- When the Profile snapshot is stale/error/detached, cached valid rows may remain **read-only** for inspection; no write authority is gained from retained cached data.

### 2.4 Deterministic ordering / runtime semantics

The existing prompt plan and runtime inspection order by **ascending numeric `order` then ascending binding ID using ordinary code-unit lexical comparison** (`leftId < rightId`), not `localeCompare` and not insertion order. UI ordering and any optional local order preview must match that comparator exactly. Do not rewrite persisted order numbers when displaying or editing, assign uniqueness, auto-renumber ties, or reorder unrelated bindings. Multiple bindings referencing the same Resource are valid independent bindings.

The effective context additionally depends on the native Agent identity, placement visibility, resource resolution, and runtime suppression. Enabling a configured binding is **not** a promise that it is model-visible.

## 3. UI layout and user interaction

Use a **PromptBindings** section in `ContextManagerProfileDrawerContent` for a selected usable Profile, preferably implemented as a dedicated child `ContextManagerPromptBindingSection` with the retained DSH Renderer/Slot props. It can be collapsible without changing the top-level `profiles | resources` tabs.

Display a sorted list of exact binding IDs and their configured fields. A binding row offers explicit **Edit resource / Edit enabled / Edit placement / Edit order / Delete** actions. No implicit writes on a checkbox toggle, dropdown selection, list refresh, panel mount, selection, focus, or blur. Present every editable field in its own deliberate Save/Cancel interaction. A create form exposes `bindingId`, `resourceId`, `enabled`, `placement`, and `order`; visible defaults are provisional local draft values until the user explicitly creates.

Create uses **one** complete input payload. Editing uses **one** leaf RPC per Save; there is no existing public atomic multi-leaf binding-replacement operation. If the user wants to change several fields, each successful save must finish authoritative recovery before the next explicit edit captures a **new** basis. Never automatically chain updates, and never reinterpret a partial sequence as an atomic edit.

Do not offer a binding-ID rename action. Identity change would otherwise require an explicit delete and add with separate revisions and intermediate consequences. An exact binding ID can be displayed in a code/read-only field. Delete confirmation identifies the Profile and binding ID and explains that referenced Resource content and other Profile bindings remain unchanged.

Resource suggestions must remain **optional and free-form**, including when the Resource list fails, is stale, or contains invalid rows. A suggested resource does not become an automatically selected authoritative value. Load the B1-3 list only when the user opens the binding/resource suggestion UI (or explicitly refreshes it); never poll or repeatedly fetch on every render. A lazy read error cannot overwrite a later mutation's Unknown/Conflict/Degraded notice.

Use the existing typed localization and theme-token/CSS Module patterns (Chinese and English), keyboard-operable controls, labels, focus and status announcements. The Profile pane must still support every M7C workflow unchanged; the Resource pane remains the merged M8A1 implementation.

## 4. Presentation ownership and draft contract

**One Profile draft slot, one Profile write lane.** Extend the existing `state.draft` discriminated union (and its `nextDraftToken`) with three unambiguous binding variants; do not create an independent writable binding controller or second Profile draft lane. Existing Profile create/edit/delete drafts and binding drafts must be mutually exclusive. Keep the M8A1 Resource draft slot separate while preserving the existing tab-switch guards.

Recommended view-only draft types (shape illustrative; concrete TypeScript stays strictly typed):

~~~ts
type PromptBindingDraft =
  | {
      kind: 'prompt-binding-create'
      token: number
      basis: Readonly<{ instanceId: string; revision: number }>
      profileId: string
      bindingId: string
      resourceId: string
      enabled: boolean
      placement: ContextManagerRemotePromptPlacement
      orderText: string
      blocked?: 'stale' | 'conflict' | 'unknown' | 'unverified'
    }
  | {
      kind: 'prompt-binding-edit-field'
      token: number
      basis: Readonly<{ instanceId: string; revision: number }>
      profileId: string
      bindingId: string
      field: 'resourceId' | 'enabled' | 'placement' | 'order'
      original: string | boolean | number
      value: string | boolean | number
      // Text input for order may be separately retained until valid.
      orderText?: string
      blocked?: 'stale' | 'conflict' | 'unknown' | 'unverified'
    }
  | {
      kind: 'prompt-binding-delete'
      token: number
      basis: Readonly<{ instanceId: string; revision: number }>
      profileId: string
      bindingId: string
      blocked?: 'stale' | 'conflict' | 'unknown' | 'unverified'
    }
~~~

Prefer a strictly discriminated field/value representation in the final implementation over loose cross-field casts. Freeze/copy the edit-time basis when beginning a draft and keep its byte-exact identity and numeric revision immutable; user edits alter only the local field/value. Token-guard every async completion and notice. Controller lifecycle state remains in `useProfileMutation`, not in this store.

Presentation actions should include beginning each binding draft, updating its exact local field, marking blocked/complete by token, and explicit cancellation/discard. Integrate with existing `beginCreate`, `beginFieldEdit`, `beginDelete`, `selectProfile`, `selectPane`, `close`, and Resource guard behavior. Ensure the old Profile form/commit branches cannot accidentally treat a binding draft as a core Profile `edit-field` draft. Keep hook ordering and mounted-child ownership valid.

Closing the Drawer does not discard a draft and never dispatches a mutation. Selecting a different Profile, a different binding, or another tab while a binding draft exists is rejected with a clear notice. A blocked draft remains visible/readable after refresh, close/reopen, or status changes, and requires explicit Discard/new edit; the old basis is **never rebased**.

## 5. Begin / Save / recovery fences

### 5.1 Begin a new draft

To begin create/edit/delete:

1. Require a usable selected Profile, **fresh** B1-1 Profile snapshot, compatible protocol, attached current Profile authority, writable Settings, valid schema, no running Profile mutation and no other Profile/Resource draft that would violate the current pane guards.
2. Call the existing `captureProfileMutationBasis()` **once at Begin**, and freeze its `{ instanceId, revision }`. Verify that the projected Profile/binding belongs to the same observed snapshot. For edit/delete, capture the exact selected binding ID and original known field; create captures the exact target Profile.
3. Create a tokenized local draft. No Host RPC has run. A Resource metadata read is not a prerequisite for capture or writing.

### 5.2 Pre-submit checks and single RPC

At Save, compare the current fresh B1-1 Profile authority/revision with the **original** basis (same `instanceId`, same Settings `revision`, same attachment/protocol and writable constraints); verify the target Profile and relevant binding identity still exist for edit/delete, or that the requested binding ID is not in the fresh projected map for create. These checks only reject stale submission; **do not refresh or replace the basis**.

For ID validation, reject the known unsafe Settings path key `__proto__`, and reject duplicates against the selected Profile's binding keys. Keep other exact strings unchanged; if a representability case cannot be confirmed, leave the Host to decide and report its machine-readable failure, rather than silently normalizing it. Resource IDs are exact strings and unresolved references are allowed.

For order, keep transient user text local and parse it only when submitting a numeric order: require a nonempty explicit signed-decimal-integer form (for example `^[+-]?[0-9]+$`) followed by `Number.isSafeInteger`. Reject `''`, fractions, exponent shorthand, `NaN`, infinity and out-of-safe-range values rather than accidentally coercing blank input to zero. Negative and equal orders are valid. Placement must be one of the five exact Domain values. Unchanged edit values cause **no RPC**.

Execute exactly one matching `props.profileMutations` method per explicit Save. Use a synchronous in-component submission guard in addition to Controller single-flight so two submits from stale React closures cannot issue a second RPC or replace the primary result with a busy notice. Disable ordinary actions while the lane is running; this guard never authorizes bypassing Controller checks.

### 5.3 Operation outcomes (never infer from content equality)

| Controller result | Binding draft and UI response | Retry policy |
| --- | --- | --- |
| `applied + fresh` | Close matching tokenized draft, show success; render **fresh B1-1** Profile state | Next change requires a newly begun explicit draft |
| `applied + degraded` | Write is **confirmed applied**, but refresh is unverified; retain a **blocked/unverified** draft with a specific notice | **Never** resubmit this draft |
| `unknown + fresh/degraded` | Transport/call outcome unknown; retain blocked/unknown draft even if read-back equals submitted value | **Never** resubmit or reinterpret as success |
| `rejected: profile-conflict / host-instance-conflict` | Retain blocked/conflict draft and the original basis; Controller may rehydrate | No automatic retry/rebase |
| `rejected: profile-basis-stale / unavailable` | Retain blocked/stale draft, do not submit | Explicit discard and new Begin only |
| `rejected: prompt-binding-not-found / profile-not-found / profile-path-not-editable` | Treat missing target/uneditable stored path as blocked conflict/stale or noneditable, not as permission to rebuild it | Explicit inspect/discard |
| `rejected: invalid-prompt-binding / invalid-prompt-placement / invalid-prompt-order / unsafe-path-key / prompt-binding-exists` | Show exact error; keep draft correctable **only while original Profile basis is still fresh** | Manual correction + explicit Save only |
| `rejected: busy / protocol-unavailable / persistence-unavailable / read-only` | Show operation state without claiming a write; keep draft, but require fresh original basis for any later attempt | Never automatically dispatch |
| `superseded / detached / disposed / incompatible` | No obsolete success/error notice may overwrite new lifecycle state; keep old draft blocked/stale until explicit Discard | No automatic replay |

Any unexpected rejected Promise from the UI-to-Controller call is conservatively treated as **outcome unknown** and blocks that token; never run a second write in a catch handler. Controller's existing Typert-vs-business result boundary remains authoritative. A stale completion from an older token, selection, pane or mount cannot overwrite a later draft/notice. Background resource-list failures similarly cannot mask a blocked mutation result.

Profile Settings revision is a **global Profile write fence**: an unrelated Profile change may legitimately stale a binding draft. Conversely, a PromptResource's authority/incarnation/revision change alone does **not** rotate Profile write authority and must not invalidate the draft or silently rewrite its Resource reference. Do not attempt a hidden cross-domain transaction.

## 6. UI diagnostics and refusal accuracy

- Profile absent, invalid Profile, incompatible schema, persistence unavailable/read-only, stale Profile baseline, and protocol mismatch are distinct states; provide read-only inspection if the existing snapshot permits it.
- Fresh Resource list: display usable/invalid/missing per exact `resourceId`. Stale/error/unloaded list: show **unverified**, not `missing`. Resource status is advisory, not a Profile write gate.
- Global placement capability: display available channel or unavailable/unverified. Do not claim final output, native suppression, or runtime effectiveness without live keyed Agent evidence.
- Explicit binding field changes preserve the entire stored Profile and binding's unknown siblings via Host path-local setter. Removing a binding is destructive **only for that binding**, not for the linked Resource or any other reference.
- No automatic fallback to a native default preset, another Resource, a different placement, or an order value.
- Do not invent a UI for editing an invalid individual binding when the current wire exposes only an `invalid-profile` diagnostic. Defer exact stored-payload repair to M8E.

## 7. Planned implementation seams

| File | Restricted responsibility |
| --- | --- |
| New `src/client/prompt-binding-editor.ts` | Pure projection/sorting, exact validation, typed draft commands and outcome mapping |
| New `src/client/prompt-binding-section.ts` | Render within selected usable Profile, focused forms/confirmation, optional lazy Resource list hints, guarded asynchronous UI actions |
| `src/client/profile-editor.ts` | Integrate the new discriminated draft union, preserving M7C core forms and existing behavior |
| `src/client/presentation-store.ts` | One shared Profile draft token/lane; begin/update/finish/cancel binding actions; no authoritative data duplication |
| `src/client/profile-drawer.ts` | Narrow composition of the new section, explicit type-safe branching, no change to core Profile mutation semantics |
| `src/client/locales.ts` and `src/client/plugin.module.css` | Typed bilingual labels, status accessibility and theme-token styling |
| New `tests/client-prompt-binding-editor.test.ts` | Strictly compiled and **executed** pure/view/store/state tests |
| `tests/client-profile-drawer-runtime.mjs` | Real retained published DSH React Renderer interactions through the existing Business Face and Controller |
| Client test TypeScript/tsdown config and `package.json` test script | Make the new suite actually execute in `pnpm run check` |
| `docs/roadmap.md`, `README.md` | Stage accurate completion/status wording before Ready, not prematurely merged |

Do **not** change `src/service/context-manager.ts`, `src/service/remote.ts`, `src/remote/types.ts`, generated Typert files, `src/client/model.ts`, `src/client/mutation-controller.ts`, `src/client/resource-mutation-controller.ts`, Resource drawer, package exports/peers, or full CI workflow as part of the baseline M8A2 design. An independently reproduced regression may justify a narrow exception with explicit tests.

## 8. Executable RED → GREEN / strict qualification matrix

All assertions below are required at their **claimed evidence class**; a fake Renderer or a passing package install does not establish real browser/edit semantics.

1. **Type/domain correctness:** five exact placements; order negative/zero/tie and +/- safe-integer bounds; invalid blank/fraction/unsafe numeric text; strict binding input typing; invalid full Profile remains read-only without fabricated rows.
2. **Exact identity:** `__proto__` rejected for binding path key, `constructor`/`prototype` accepted, arbitrary Unicode and whitespace preserved where native Settings permits; `resourceId` with `__proto__` remains allowed; same Resource used by multiple independent binding IDs. Published Host/Settings probe confirms that blank/whitespace-only Binding IDs are accepted losslessly; add exact UI regression tests and retain optional visibility warnings without rejecting them.
3. **Single-RPC semantics:** one create; all four leaf setters; one explicit delete; unchanged edit zero writes; double same-render Save exactly one call; no multi-leaf hidden sequencing; no auto-save via change/mount/refresh.
4. **Stored integrity:** actual Host Settings + Remote test proves all four leaf operations preserve unrelated Profile fields and unknown Stored binding siblings; create handles complete known input; delete removes only the selected binding; Resource content and other references untouched.
5. **Sorting:** order ascending then binding-ID code-unit tie break (`A`, `a`, `b`), stable view only; no ID/number normalization or unrelated renumbering.
6. **Basis/race:** original `instanceId+Settings revision` captured at Begin, never Save; unrelated Profile update stales basis; Host authority rotation with equal revision still conflicts; Resource-only authority change **does not** stale a Profile basis; reentrant publication, late Promise and old token cannot submit/publish stale outcomes.
7. **Outcomes:** real Controller path distinguishes applied+fresh, applied+degraded, known validation/business refusal, Profile conflict, transport Unknown, busy, detached, disposed, incompatible and superseded. No retry on unknown/conflict/degraded; read-back equality never upgrades Unknown.
8. **Presentation lifecycle:** existing Profile create/edit/delete and Resource tab unchanged; draft survives Drawer close; selection/tab switches are blocked; explicit Cancel/Discard works; stale resource-list callback does not replace a blocked outcome; no extra model store/hook subscriptions.
9. **Advisory diagnostics:** usable/invalid/missing/unverified Resource statuses; missing resource still writes binding; placement available/unavailable/unverified but no fabricated Agent-effective status; no prompt body fetch from Profile binding UI.
10. **Real runtime proof:** the retained published DSH SlotCore/React Renderer actually mounts Profile + binding section, drives create/four leaf saves/delete, conflict/unknown/degraded and lifecycle, with real hook/store subscriptions; all assertions are on the runtime's rendered controls and exact intercepted single Remote calls.
11. **Artifact/compatibility proof:** strict TS test compilation, `pnpm run check`, Draft Quick CI, packed Client/clean consumers, five retained Client SlotCore artifact contracts, published DSH Host/bundle smoke, existing five actual packed Chromium M7D Profile scenarios and four independent Profile graph repeatability lanes run on the **exact same qualified HEAD** during Full.
12. **Scope claims:** retain M8A1's honest distinction: packed Chromium M7D scenarios prove existing Profile/browser integration and no regressions, **not** a new scripted M8A2 browser E2E unless such a dedicated scenario is separately added and actually run. A focused real-Chromium Binding scenario is desirable after the core implementation; it must not be misrepresented as already covered.

**Evidence policy:** E1 upstream/source contract review; E2 public exports/type consumers; E3 strict unit/domain tests; E4 published Client Renderer/Slot runtime; E5 real Host Settings/Remote operation and lifecycle; E6 packed-install/composition. Reuse existing proven DSH public seams; perform a new executable published preflight **before production code** if any new seam is proposed. A 0.2.x source observation is not published Host compatibility. Do not widen peer ranges.

## 9. Gates, exit criteria, and handoff

1. **Design/preflight:** this contract is recorded on a branch derived from the post-M8A1 green `main`. Enumerate unchanged Host/Remote/Client signatures and the source of evidence. Run a small real Host/Settings binding-ID probe plus a retained published Renderer loader probe before implementing new UI behavior.
2. **Draft implementation:** keep exactly one Draft M8A2 PR; commit strictly typed RED fixtures before GREEN, make the smallest production delta, run focused tests, `pnpm run check`, and the real Renderer preflight. A green Draft Quick lane is **not** Full qualification.
3. **Independent focused Strict Review:** check path-key safety, unknown-sibling preservation, exact original Profile basis, Profile/Resource authority independence, reentrant UI state, lifecycle/failure classifications and no test overclaims. Resolve all confirmed P1/P2 before Ready.
4. **Ready Full Qualification:** convert the same PR to Ready and run the retained **86-job fail-closed** Full suite on exact HEAD; require zero failed/skipped and the `dsh-context-manager / full qualification` aggregate success. Do not weaken jobs or peer matrix.
5. **Exact-head Final Review:** tie review to HEAD SHA and successful Full run, enumerate any browser E2E limitations, verify no post-run source changes or unresolved review threads, then merge **only** that reviewed green HEAD.
6. **Post-merge closeout:** independently verify the new `main` push, including full aggregate and all required jobs. Stage accurate docs before Ready if possible. Hand off to M8B Skill Policy UI without pulling that feature into M8A2.

**Definition of done:** the user can manage one Profile-local PromptBinding at a time via real DSH UI controls, with exactly the existing six Profile write operations; the original Profile revision/authority and unknown Stored data are never silently replaced; ambiguous outcomes are visibly blocked, no implicit retry or resource cascade occurs; published-runtime and packaged compatibility evidence supports exactly the claims made.


## 10. Published contract preflight and RED evidence (2026-10-29 CST)

**Base / separation:** PR #40 main merge `e37fa728` has independent [Full CI #40754041892](https://github.com/WwlWss/dsh-context-manager/actions/runs/40754041892) **86/86 PASS**. These subsequent runs are **focused M8A2 preflight and deliberate RED**, not a new M8A2 Full qualification. No Host, Remote, Client Controller, package peer ranges, or production UI module was changed in these commits.

### 10.1 Published Host/Settings/Remote v3 (E4/E5)

- Test-only `tests/m8a2-published-host-preflight.test.mjs` boots **actual published Cordis + DSH SettingsProvider + ContextManagerService + ChangeTracker + ContextManagerRemoteService**, invokes all six existing PromptBinding Remote v3 methods, and observes one Settings revision increment per accepted write, absent/unresolved resource references, exact resource ID bytes and untouched unknown Stored siblings. The test uses real Host/Settings persistence methods, not a copy of Settings path mutation code.
- Legacy published package evidence: [Draft Quick #40765779357](https://github.com/WwlWss/dsh-context-manager/actions/runs/40765779357), `72b375f9`, **PASS** with Cordis `4.0.1`, Settings/Typert `0.1.1-rc.2`.
- Published modern package evidence: [focused workflow #40766652925](https://github.com/WwlWss/dsh-context-manager/actions/runs/40766652925), three independently successful Host jobs: Cordis `4.0.2`, Settings/Typert `0.1.2-rc.1`, `0.1.5-rc.2`, and `0.1.6-alpha.2`; zero test failures in those three jobs. This same combined workflow is **overall RED** because its separate actual Renderer job intentionally asserts the missing M8A2 UI.
- On every tested Settings generation, `constructor`, `prototype`, `"  exact  "`, Unicode/tab/slash, single-space `" "`, and **empty string `""`** were accepted unchanged as Binding IDs. `__proto__` was refused with `unsafe-path-key` without advancing Settings revision or changing Stored state. Resource values including `__proto__` and `"  missing/内容  "` remained exact. **No UI-only nonempty-ID rule is permitted.**
- Scope: this is actual published in-process Host/Remote service invocation; the existing Typert Gateway and packed-install evidence belong to the retained tests, not to a novel M8A2 gateway implementation. Cross-process CAS is not claimed.

### 10.2 Published Client Renderer baseline (E4)

- Before the first deliberate UI RED assertion was inserted, the temporary focused workflow [#40766054000](https://github.com/WwlWss/dsh-context-manager/actions/runs/40766054000) on `a92e5489` **PASS** with published `@deepseek-ai/dsh-client-ui-renderer@0.1.2-rc.1` and retained DSH Client Store/Locale/Slot dependencies. It executed the actual published Slot/React Renderer bridge and existing M7C/M8A1 Profile+Resource Drawer interactions.
- The temporary test-only `.github/workflows/m8a2-published-preflight.yml` reuses retained exact published runtime versions, does not weaken or replace `ci.yml`, and should be removed as a temporary harness (or explicitly reviewed for retention) **before** Ready/full qualification.

### 10.3 Strictly typed executable RED (E3/E4)

- New `tests/client-prompt-binding-editor.test.ts` is included in `tsconfig.client-model-test.json`, `tsdown.client-model-test.config.ts`, and the actual `test:client-model` command. The tests compile under retained strict TypeScript, bundle and execute; no `any`, `@ts-ignore` or disabled test markers. They assert the three missing behaviors: exact create draft/close survival, edit draft Unknown blocking/token preservation, and explicit delete/mutual-exclusion ownership.
- [Draft Quick RED #40766350158](https://github.com/WwlWss/dsh-context-manager/actions/runs/40766350158) at `8501cbc8`: **TypeScript and test bundle GREEN; execution RED 124/127 passed, exactly 3 M8A2 tests failed** because `beginPromptBindingCreate`, `beginPromptBindingFieldEdit`, and `beginPromptBindingDelete` are not yet present. The failure is intentional, not a typecheck, compile or unrelated preexisting regression.
- [Real Renderer RED #40766350142](https://github.com/WwlWss/dsh-context-manager/actions/runs/40766350142) at the same HEAD: published Renderer bridge step **PASS**, then the mounted usable Profile has **0** `data-context-manager-prompt-bindings` sections where the test requires **1**. Exact failure: `M8A2 RED: Profile PromptBindings editor is not yet mounted`. The first baseline Renderer success was already archived, so this is a new feature RED rather than a loader failure.
- The subsequent focused Host matrix #40766652925 again has all three modern Host jobs PASS and the Renderer job deliberately RED. All M8A2 RED tests remain in the branch for subsequent GREEN. A Draft Quick failure **must not** be mistaken for a completed Full qualification.

### 10.4 Historical RED-to-GREEN handoff (now completed)

Begin the focused **GREEN** implementation only after retaining this evidence: add the typed Profile-local Binding draft variants/actions, pure editor functions, and the selected-Profile child UI using the six existing Profile mutations. Keep **the original edit-time Profile Basis**, no implicit multi-field RPC, no second Profile lane, no Resource writes, no automatic retry, no synthetic Agent-effective diagnostic and no silent ID normalization. Expand the real Renderer RED tests from the initial missing-section assertion to the exact six mutation operations, conflicts and lifecycle. Then execute targeted GREEN and Draft Quick, run independent Strict Review, mark Ready only after confirmed P1/P2 remediation, and proceed through the full fail-closed gates.


## 11. Draft GREEN implementation and qualification record (2026-10-29 CST)

**Current scope:** Draft PR #41 contains the M8A2 Profile-local Binding UI and only Client/presentation, tests, localizations, this plan and temporary preflight workflow. There is no Host or Remote API v4 change, no new Settings write contract, no new Profile or Resource Controller lane, and no weakened main CI matrix. This section supersedes the historical RED-only next-operation notes in §10.4.

### 11.1 Delivered implementation

- Shared typed Binding create/edit-field/delete drafts use one existing Profile draft union, immutable captured instanceId + Settings revision, shared tokens and blocked outcome kinds; legacy M7C core Profile flows remain distinct.
- The existing presentation store receives Binding begin/update/notice actions; drafts persist through Drawer close, forbid tab/record switching, and token-guard late notice publication.
- The pure Binding editor validates exact Binding IDs (including empty and whitespace), rejects only __proto__ as a Settings path key, preserves exact Resource string values, parses signed decimal safe integers, and provides stable order-then-code-unit-ID sorting and advisory Resource/Placement projections. -0 is canonicalized to numeric 0 because published DSH Settings persists JSON numbers and loses the negative-zero distinction; other signed safe integers retain their values.
- The Hook-safe selected-Profile Binding child exposes complete create, four explicit leaf field saves and explicit delete via the six frozen Profile mutations: no multi-field hidden RPC, no body fetch, no invented Agent-effective status and a synchronous duplicate-Save guard.
- The existing Profile Drawer and typed bilingual locales integrate the child without replacing M7C Profile forms or the M8A1 Resource tab.

### 11.2 Executed GREEN evidence

1. All original strict RED Binding presentation tests now pass, plus additional pure cases for exact IDs, arbitrary Resource strings, safe orders and tie sorting, advisory diagnostic health and blocked outcomes.
2. [Draft Quick #40824336748](https://github.com/WwlWss/dsh-context-manager/actions/runs/40824336748) on **95b80345afc97dbe0889c0248c6adb6447503b41**: completed/success, strict TypeScript and test bundle passed, **131/131 Client** and **261/261 Node** tests passed, retained SlotCore probe passed and zero unexpected failures.
3. [Focused published Renderer / retained modern Settings #40824336712](https://github.com/WwlWss/dsh-context-manager/actions/runs/40824336712) on that **same SHA**: completed/success, **four of four focused jobs PASS**. Real retained DSH Renderer mounts Profile Binding UI and exercises create, four field setter saves, delete, repeated same-render Save, Unknown blocked replay, and explicit authoritative Profile refresh after an earlier degraded Resource read.
4. Published Host package matrix continues to assert safe path keys and all six Remote v3 Binding operations with lossless Stored extension siblings, spanning Settings 0.1.1-rc.2, 0.1.2-rc.1, 0.1.5-rc.2, and 0.1.6-alpha.2. This does **not** establish DSH 0.2.x Host compatibility.
5. Two intermediate GREEN failures were genuine test discoveries, not justified test bypasses: stale Profile baseline after a degraded M8A1 read required an explicit refresh before new Binding write, and parsing textual -0 needed to match JSON-persistent numeric zero. Both retained original safety fences.

### 11.3 Outstanding gates

- An independent **Strict Review** before Ready is still required. Examine all six UI operations, Stored extension preservation, exact captured Profile Basis, Resource-only authority independence, stale/unknown/conflict/degraded lifecycle, async token guards, and evidence-class honesty. Confirmed P1/P2 require focused repair and requalification.
- The temporary focused workflow should be removed or expressly approved for permanent retention before Ready. It does not replace the normal CI workflow.
- The **86-job Ready Full Qualification**, exact-head Final Review, merge and independent post-merge main Full CI are **not** performed. Draft Quick/focused preflight cannot be portrayed as Full qualification or as proof of a dedicated packed Chromium Binding E2E scenario.


## 12. Strict Review repair record and pre-Ready evidence

**Review:** [PR #41 independent Strict Review #5693403928](https://github.com/WwlWss/dsh-context-manager/pull/41#pullrequestreview-5693403928) against original HEAD `c6480e82`. The review identified four P2 issues and an E4 qualification coverage gap. The PR remains Draft; this section is **implementation/verification evidence**, not a self-approved follow-up Strict Review.

### 12.1 Four focused production repairs

1. **Exact unsafe path guard, readable legacy rows:** a Binding or enclosing Profile with Settings path key `__proto__` remains visible but cannot begin/edit/delete/commit through M8A2's normal structural UI. It shows a bilingual read-only reason. The exact `constructor`, `prototype`, blank, whitespace, Unicode, and value-only Resource ID `__proto__` contracts remain allowed. Host `assertSafePathKey` is unchanged.
2. **Rendered Profile/Binding Begin fence:** `isPromptBindingBeginCurrent` verifies the render's fresh Profile snapshot, target ownership/identity and exact `{instanceId, Settings revision}` match the live captured original basis **before** any new Binding draft is created. Old React event handlers can no longer combine stale originals with newer Host Settings authority. Do not compare global Change generation or Resource-only Authority; the existing Profile Controller still performs the final CAS check at Save. No hidden recapture/rebase is performed.
3. **Immutable terminal notices and read-race guard:** Binding draft owns a token-scoped presentation-only terminal notice, which blocked navigation/selection and late refresh cannot overwrite. The Profile Drawer now distinguishes Unknown, Conflict, confirmed-applied-but-degraded and Stale. M7C Profile normal notices and the independent M8A1 Resource notice slot remain unchanged; no second controller or successful-write cache was added.
4. **Full editor layout:** Binding-specific `bindingSection` CSS uses the existing detail panel's scroll and theme tokens; legacy `diagnostics` retains its 130px short-diagnostic limit. A read-only Profile itself now gives a visible reason even when no Binding rows exist.

### 12.2 Reproduced RED and executable GREEN

- **Before production repair:** [Draft Quick RED #40881798813](https://github.com/WwlWss/dsh-context-manager/actions/runs/40881798813) failed the new exact Binding terminal-notice retention assertion; [published real Renderer RED #40881798854](https://github.com/WwlWss/dsh-context-manager/actions/runs/40881798854) reproduced a stale old React callback that began an edit with newer authority. These are intentional regression reproductions.
- **Post-repair baseline** `08148e355e0876335602dc0bda7dadb426ad64b0`: [Draft Quick #40884492605](https://github.com/WwlWss/dsh-context-manager/actions/runs/40884492605) **SUCCESS**, strict TypeScript/build, **134/134 Client**, **261/261 Node**, **1/1 Slot**. [Focused published Renderer and modern Host matrix #40884492611](https://github.com/WwlWss/dsh-context-manager/actions/runs/40884492611): **4/4 jobs SUCCESS**.
- Expanded real published Renderer scope: one create, four explicit leaf saves, one delete, duplicate Save single-flight, Unknown with tab-switch and Drawer close/reopen, Host revision Conflict without overwrite, confirmed-applied/degraded Profile rehydrate failure without replay, previous-render/new-Profile-Revision refusal, old-render/new-Host-instance refusal, unsafe legacy `__proto__` row read-only, and **Resource-only Authority transition without staling a valid Profile write**.
- E3 cases verify exact Settings-path exceptions, the render/Profile/Binding identity fence, preservation of Profile Basis across unrelated Resource Authority transitions, terminal notice token ownership and original M7C/M8A1 presentation invariants.
- While expanding the test harness, two fixture-only issues were corrected with evidence rather than hiding failures: `profiles()` is a *single-layer* RemoteResult whose failed read must be a rejected transport call, not a nested mutation business receipt; Profile and Resource change cursors must be independent. The original M8A1 degraded-Resource wording was retained, separate from M8A2's applied/degraded Profile wording.
- There is no claim of a dedicated new packed Chromium M8A2 scenario. The retained Full CI `.github/workflows/ci.yml` **already runs** `node ./tests/client-profile-drawer-runtime.mjs` in its published Client Renderer job; the focused test-only workflow used for fast published preflight may therefore be removed before Ready without removing the mandatory Full runtime assertion. Its successful historical run links remain available.

### 12.3 Remaining exit gates

Complete the design documentation and temporary workflow closeout on the same Draft PR; verify the **new exact HEAD** with Draft Quick. Run a **new independent Strict Review** on that head, resolve each finding and all review threads with explicit evidence, then transition to Ready and execute unchanged **86-job fail-closed Full Qualification**. Exact-head Final Review, merge and independent main Full CI remain future separate gates. Do not treat targeted GREEN as a merge authorization.

## 13. Second independent Strict Review Fix2 and dispatch-ownership closeout (2026-10-29)

### 13.1 Reviewed defects and RED evidence

The [second independent review #5699377959](https://github.com/WwlWss/dsh-context-manager/pull/41#pullrequestreview-5699377959) at `fb3a3343` identified two further P2 boundaries in the shared Profile Drawer:
- **P2-A:** an Unknown/Conflict/confirmed-degraded Binding `terminalNotice` survived as draft data but was still overwritten in visible `state.notice` by another M7C or M8A2 begin action while the Profile draft slot was occupied.
- **P2-B:** a previously rendered M7C default-Profile handler checked stale `canStart`, then fetched a *new* Profile Basis and dispatched `setDefaultProfile`, even though a Binding draft had already taken the one shared Profile editing slot. The same class of obsolete handler was probed for M7C form Save and M8A2 Binding Save.
- [Draft Quick RED #40895509600](https://github.com/WwlWss/dsh-context-manager/actions/runs/40895509600): **134 existing Client PASS, one new focused terminal-begin RED FAIL**. [Published Renderer RED #40895859185](https://github.com/WwlWss/dsh-context-manager/actions/runs/40895859185): the actual published `0.1.2-rc.1` Renderer reproduced **one unauthorized default Profile RPC** after a Binding draft began before React rerender (10 writes versus 9 expected). REDs are deliberately preserved in Actions history.

### 13.2 Scope-limited fixes (Host/Remote/Controllers unchanged)

1. **Single source of terminal-notice priority:** `presentation-store.ts` centralizes all occupied-Profile-draft Begin and navigation notifications, preserving an existing Binding `terminalNotice`. The Drawer preferentially renders this stored terminal receipt, so a future ordinary warning cannot silently relabel Unknown, Conflict or Applied+Degraded. A user's explicit Discard clears it. M7C ordinary draft warnings and M8A1 independent Resource notices remain unchanged.
2. **Synchronous same-instance authorization, no shadow Store:** The already published DSH `StoreHandle.create()` returns a `StoreInstance` with identity-stable baked `actions` and synchronous `getSnapshot`. M8A2 registers **that exact instance** in a `WeakMap` keyed by its actions object. The private read helper receives the actual `props.actions` identity passed by the Renderer, so **there is no second mutable draft model, no React-render snapshot masquerading as live state, and no new public DSH Store prop**. Registration is root-only; a replaced root or plugin disposal revokes the old actions identity (fail closed).
3. **All three write entries fenced:** M7C `changeDefault` must see the current root Store open/Profiles pane, current selected Profile identity, and **no Profile or Resource draft**. M7C `commitDraft` and M8A2 Binding `commit` must see the **same exact current draft object** captured by the callback, including no `blocked` state and no simultaneous Resource draft. React closures for canceled/replaced/changed drafts therefore dispatch zero RPCs, even before a rerender. The existing Profile Controller still independently verifies single-flight and exact Host `instanceId + Settings revision`; never recapture/rebase at Save.
4. **M7B0 compatibility preserved:** An initial wrapper around the Slot component passed real Renderer tests, but correctly triggered the legacy [Draft Quick #40896422829](https://github.com/WwlWss/dsh-context-manager/actions/runs/40896422829) artifact contract: the closed Drawer must directly return `null` when its registered component is invoked. The wrapper was removed; the final `actions`-identity method leaves the original Slot component and return shape unchanged. **No existing artifact assertion was weakened.**
5. **P3 corrections:** An ordinary failed Profile refresh remains `kind:'error'` / `role='alert'`; a delayed UI-only refresh rejection after Binding Unknown cannot overwrite its terminal receipt; a Resource-only authority rotation **while a Binding draft already holds its original Profile basis** permits its one explicit Profile Save with the unchanged basis. The original `Partial<ExpectedPromptBindingPresentationActions>` RED-phase shim was removed from strict TS tests.

### 13.3 Published integration and test classification

- [Published Renderer #40898743500](https://github.com/WwlWss/dsh-context-manager/actions/runs/40898743500) **PASS** after removal of the breaking wrapper, with original M7B0 `client-artifact.test.mjs` again passing in [Draft Quick #40898743158](https://github.com/WwlWss/dsh-context-manager/actions/runs/40898743158).
- [Draft Quick #40898299212](https://github.com/WwlWss/dsh-context-manager/actions/runs/40898299212) and [focused published Renderer #40898299220](https://github.com/WwlWss/dsh-context-manager/actions/runs/40898299220) prove the delayed-refresh and held-Resource-Authority cases before the final ordinary refresh severity regression.
- [Published Renderer #40899019850](https://github.com/WwlWss/dsh-context-manager/actions/runs/40899019850) **PASS** at `0e65117c`, covering the complete M7C/M8A1/M8A2 interaction script plus live Store identity, synchronous event interleaving, default callback denial, stale M7C/Binding form denial, unknown/late-read/close-reopen, conflicts, degraded outcomes and root teardown.
- Published Client/Renderer tests are **E4**, not a dedicated packed Chromium M8A2 browser test. Published Host Settings/Remote v3 **E5** remains covered by retained M8A2 Host tests. Draft Quick still skips the Ready-only 86-job matrix.
- The extra focused `.github/workflows/m8a2-published-preflight.yml` was temporarily restored to run actual Renderer RED→GREEN, and will be removed after the final focused passing run. The unchanged official `.github/workflows/ci.yml` already runs the full published Drawer script in its retained Full matrix.

### 13.4 Pending formal gates

After final documentation/test-only workflow cleanup, require a successful **exact-HEAD Draft Quick** and an independent **third Strict Review** addressing both second-review P2s and every remaining thread. Do not grant Ready merely on this implementation note. Only then run the unchanged **86-job fail-closed Ready Full Qualification**, exact-head Final Review, merge, and independent post-merge main Full.
