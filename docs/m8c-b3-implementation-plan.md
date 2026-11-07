# M8C-B3 — Native Presets Pane implementation contract V1.0

**Implementation status (2026-11-07):** B3 third-pane UX is implemented and scoped-qualified on Draft PR #43, including all four retained Published Renderer generations (R01–R31) and the separate authenticated Browser→Gateway→Native test. Fix A completed-lease R29 is GREEN on [#42384532116](https://github.com/WwlWss/dsh-context-manager/actions/runs/42384532116), 31/31 per version. Protected B4 Ready 86-job Full, fresh independent Final Strict Review, merge and post-merge Full remain **HOLD**.
**Historical design status:** At the frozen Reviewed Code HEAD below, B3 was PLANNED and no B3 implementation had been committed; the following implementation inventory describes *that* design-time baseline, not the current code.
**Reviewed code HEAD:** `3c52f1af650c546f2ac1754aca1035249f858b0a`; `main` baseline `39b46b2603ed749b8fda80f4748bff4a84c4d14f`; Draft PR #43.
**Parent contract:** [M8C capability contract](m8c-plan.md). This document refines only B3, and does not supersede B0 published-package evidence gates or B4 Full Qualification.
**Scope:** one third Presets pane in the established retained DSH Renderer; exact native roster + explicit read-only View + confirmed Copy/Remove.

## 0. Source audit, existing seam and one discovered B2 qualification gap

| Source | Observed current behavior | Required B3 addition |
| --- | --- | --- |
| `src/client/model.ts` | `presetMutations` and `loadNativePresetDocument(id)` already implemented; roster is authoritative baseline; composition is an 8-entry keyed cached surface. | Explicit sensitive-document view lease/release, roster-only refresh and live selection proof without a second data authority. |
| `src/client/preset-mutation-controller.ts` | Global independent native copy/remove lane, one RPC, read-back membership, exact inputs, confirmed/unknown/refused distinctions. | Preserve as native operation authority; view must not invent CAS or re-dispatch when result is unknown/degraded. |
| `src/client/business-face.ts` | Exposes Profile and Resource operations, but not the new Preset Controller or native composition read. | Frozen explicit third capability projection + published-compatible hooks. |
| `src/client/presentation-store.ts` | `pane` union, navigation, draft ownership and occupancy assume exactly two panes. | Exhaustive three-pane logic; dedicated PresetDraft/Notice/Token and terminal receipt priority. |
| `src/client/plugin.ts` | Two tabs, one root DSH Store, one shared overlay Slot. | Add third tab/content; keep original slots and focus/close semantics. |
| `src/client/profile-drawer.ts`, `resource-drawer.ts`, `skill-policy-section.ts`, `prompt-binding-section.ts` | Existing guards currently consult only two draft slots. | Extend cross-pane occupation, write authorization, and old-event denial without weakening previous tests. |
| `tests/client-profile-drawer-runtime.mjs` | 3,075-line **real** retained published Renderer harness; `M8B_SKILL_PROBE` is isolated. | Add independently gated `M8C_PRESET_PROBE` fixture and cases, do not alter old default behavior. |
| `.github/workflows/ci.yml` | Four published Renderer versions in `client-presentation-contract`; M8B 36-case runner remains a required step. | Add M8C test runner to existing version matrix without deleting old gates. |
| `tsdown.client-model-test.config.ts` | Compiles `tests/client-preset-mutation.test.ts`. | Ensure runtime test script actually invokes it. |
| **`package.json`** | **`test:client-model` names seven output files explicitly but omits `client-preset-mutation.test.mjs`.** | **P0 blocker:** add and actually run this controller suite before claiming its previous Quick GREEN established behavioral execution. |

**B2 provenance precision:** the earlier controller GREEN is a successful build/typecheck/Quick result, but the seven controller tests in the omitted output file were not demonstrably run by `pnpm run check`. Run them on the fixed HEAD and record cases. The B2 Model runtime tests **were** included in the existing runner. Do not silently upgrade previous evidence retroactively.

## 1. Frozen UI and boundaries

- Use a third `Presets` tab alongside `Profiles` and `Resources` inside the **same** root `shell.overlay`. Do not create a new Slot, root Store, native writer, filesystem editor or second authoritative roster.
- Directory may be displayed from the last-good snapshot while stale/detached, but fresh attached compatible directory observation is required for new View and write begins. Present `trust`, `isDefault`, `name`, `description` and `broken` literally, not as authorization.
- Native composition is a potentially sensitive string. Never fetch on pane mount, row selection, or automatic hydration; only after an explicit View click. Render escaped plain text in React-created `pre` with wrapping and no `dangerouslySetInnerHTML`, YAML evaluation, Markdown interpretation, external syntax highlighting, analytics or clipboard auto-copy.
- A separate B0 privacy/authentication preflight must confirm that existing authenticated Browser/Remote access legitimately receives raw composition before enabling full-body View in a releasable build. If not confirmed, defer/disable the View feature rather than return raw content by assumption.
- `Copy` selects an existing source and accepts a new exact target ID. Display name is a deliberate **choice**: `inherit` -> `null`; `explicit` -> exact text including `''`. No trimming, Unicode normalization, overwrite, implicit rename, empty preset or client-side whole-directory emulation.
- `Remove` requires an explicit confirmation panel with exact target ID and warning about referenced Profiles and active Sessions. Prefer typed exact-ID acknowledgment. Never update Settings Profile bindings or mounted Session identity as a side effect.
- Native `authorable` is a directory capability hint, not a per-preset permission. `trust: 'user'` is advisory, not authorization. Native DSH always decides delete/default/shipped-root policy.
- Separate native Preset single-flight from Profile and PromptResource authorities. Shared draft occupancy is UI policy only. No invented Preset CAS or revision.

## 2. Business Face and Model extension

### 2.1 Frozen projection

In `src/client/business-face.ts` expand `ContextManagerClientBusinessSource` and `ContextManagerClientBusinessFace` with:

- `hooks.presetMutation` from the **existing** `model.presetMutations.state`. Verify the published Renderer maps it to `props.usePresetMutation` in all four retained versions; do not infer hook name without E4.
- `presetMutations: { copyPreset, removePreset }`, an explicitly frozen wrapper exposing **only** those two functions (never `state/reset/attach`).
- `loadNativePresetDocument(id)`, one readonly on-demand callback. Never expose raw `Remote` directly.
- `refreshNativePresets()` (or equivalently a single live model callback calling `reconcile(['presets'])`), not a full global `refresh()`, with actual fresh-surface verification.
- A safe synchronous `readLiveNativePresetView(requestedId)`/`readCurrentPresetObservation` facade derived from `model.state.getSnapshot()` and a pure `derivePresetView`. It must not retain a second snapshot; used at Begin **and** Submit to prevent stale-render handler dispatch.
- Explicit `openNativePresetView`/`releaseNativePresetView` view-lease callbacks, as specified next.

Extend `tests/client-business-face.test.ts` exact public key/hook inventories and frozen wrapper tests. Extend `tests/client-generated-remote-contract.ts` to assert **both** the native read method and the copy/remove narrow generated-port conformance. Do not widen Remote v3.

### 2.2 Sensitive composition view lease (additional B2/B3 seam)

The present `nativePresetDocuments` map is cleared on Host detach, authority clear or changed Preset cursor, but **not** on selection switch, pane exit or Drawer close. An after-unmount in-flight read can also attempt late publication.

Add a **monotonic, Model-scoped view lease** (only for displaying a native body; not Host write authority). Example contract:

`beginNativePresetView(id): { leaseId, result: Promise<LazyReadResult> }`
`releaseNativePresetView(leaseId): void`

- Claim a new lease synchronously; revoke earlier view request ownership and purge previously revealed composition. Reuse `runLazy('nativePreset', id)` and existing keyed request owner machinery. The lease must also fence late results for prior views **after** they await the Remote.
- `release` clears retained native body only when the caller owns the **current** lease. An obsolete unmount cleanup must **not** clear a newly reopened view.
- Clear on row switch, tab switch, Drawer close, component unmount, Host detach/replacement, model dispose, cursor invalidation and preset mutation. Teardown must revoke read publication, not merely hide the rendered text.
- A stale/error/detached document cannot be shown as freshly read. `completed` from a lazy request is not, by itself, a fresh-body verdict: inspect the Model surface, matching ID, status, stale bit and current lease.
- Keep body cache small and bounded; no persistent data or log entry.

An alternative signature is acceptable only if it proves these exact ownership and teardown properties. Do not implement a global shadow Document Store.

## 3. Pure view / draft / notice contract

Add `src/client/preset-editor.ts` with:

- `derivePresetView(snapshot, requestedId)`: exact source rows, deterministic selected **effective** ID, raw selected ID, fresh/detached/unavailable state and separately computed copy/remove/read capability. Render last-good stale directory readonly without granting write.
- A read-only `PresetViewObservation` of selected row, base instance/cursor or comparable UI-only source observation. **It is not a CAS revision or native write basis.** The Begin action checks captured rendered row against a *live* observation; Submit rechecks that the same selected source/target still matches, while DSH remains final authority after dispatch.
- `PresetDraft` discriminated union:
  - `{kind:'copy', token, sourceId, targetId, nameMode:'inherit'|'explicit', explicitName, originalObservation, submitting?, blocked?, terminalNotice?}`.
  - `{kind:'confirm-remove', token, targetId, displayedName?, confirmationText, originalObservation, submitting?, blocked?, terminalNotice?}`.
- `PresetNotice` with typed codes for applied, confirmed-but-unverified, native-refusal, busy/stale, unavailable, transport-outcome-unknown, read-error, and occupied draft. Ordinary late read errors must not override terminal receipts.
- A no-write validation helper: target/source distinct, target absent from observed directory, exact confirmation text, no accidental trim/coercion, null vs empty explicit name. Do not use path-key blacklist intended for Settings Profile IDs; native DSH validates native preset paths.
- Result mapping: `applied/fresh` -> finish + success notice; `applied/degraded` -> block with first terminal notice; `unknown` -> block and prohibit implicit retry; known native `rejected` -> preserve refusal, do not infer partial write; pre-dispatch stale/busy -> no RPC, preserve appropriate validation notice; superseded result -> never publish to new Pane/root.

No duplicative authoring state machine: Store draft is user intent/presentation only; `presetMutations` remains the one Controller lane.

## 4. Shared Presentation Store and stale-handler fences

Extend `ContextManagerPresentationState` with:

`pane: 'profiles'|'resources'|'presets'`,
`selectedPresetId: string|null`,
`presetDraft: PresetDraft|null`,
`nextPresetDraftToken: number`,
`presetNotice: PresetNotice|null`,
and only the minimum view-request state needed to bind the active read lease.

Modify *all* relevant guards/actions, not just tab navigation:

- `canBeginProfileDraft`, `canBeginResourceDraft`, new `canBeginPresetDraft` must enforce **all three** draft slots are empty.
- `selectPane` refuses a switch when *any* draft is occupied; provide notice for the current Pane (including blocked/unknown). `selectProfile`, `selectResource` and `selectPreset` must refuse obsolete/occupied intents.
- `mayApplyCurrentDraftEvent` must be an explicit three-way switch. The current two-way ternary would route the third Pane into the Resource path.
- `mayApplyCurrentNavigationEvent` extends to Presets while preserving `openSessionEpoch` and current Pane check.
- `ownsLiveProfileDraft`, `ownsLiveResourceDraft`, `mayDispatchImmediateProfileWrite`, Profile/Resource submission guards and Skill/PromptBinding `canStart` must reject an occupied Preset draft.
- `ownsLivePresetDraft` checks original object identity, token, non-submitting/nonblocked, active original Pane, no other drafts and the live Drawer opening. Claims must be made synchronously **before** the Host RPC.
- Standard `cancelPresetDraft` works only before dispatch. `discardBlockedPresetDraft` requires a separate explicit user action on an exact blocked token; old Cancel cannot erase an unknown/confirmed-degraded receipt.
- Submission RPC receipts may settle after Drawer close, even though the original opening can no longer accept further **user-originated** events. Never apply the opening-session guard to Controller settlement.
- Explicitly test root Store revocation/plugin disposal, same-epoch Pane unmount/remount and previous opening handlers.

**Effective selection is not raw Store selection.** If `selectedPresetId=null` but the fallback changes from A to B, an A-origin View/Copy/Remove handler may not write B. Compare captured effective ID against a live `derivePresetView(model.state.getSnapshot(), live.selectedPresetId)`; require mounted component identity. A per-render `useRef` without a fresh live source check is insufficient when the Model publishes synchronously before React rerenders.

## 5. Preset Drawer behavior and accessibility

Create `src/client/preset-drawer.ts` as a mounted child of the same `ContextManagerDrawerProps`, with no new root Store. Add Presets navigation to `src/client/plugin.ts` while retaining the existing two entries and Slot ABI.

Proposed sections, in order:
1. **Status/Refresh**: directory state, native `authorable` hint, explicit roster-only refresh, no read polling.
2. **Native Directory**: exact ID, name/description if supplied, `system/user` provenance, `default` indicator, `broken` diagnostics, accessible keyed row selection.
3. **Selected Details**: no auto body query. `View composition` intentionally initiates one on-demand read; text is shown in a bounded read-only `pre` only for the matching current leased selection.
4. **Copy Form**: fixed source ID, exact target ID, display-name mode (`inherit` versus `explicit`, including empty string), explanatory no-overwrite text, one Submit.
5. **Remove Confirmation**: exact immutable ID, typed acknowledgment, explicit warning, danger Submit. Removing the native preset does not remove Profile references or change current Session identity.
6. **Result/Recovery**: first receipt notice, explicit refresh, blocked state and deliberate Discard path. No automatic retry.

Existing CSS classes and accessible focus behavior should be reused; any new `plugin.module.css` classes must remain responsive. Put all new locale keys and accurate `zh/en` translations in `src/client/locales.ts`. Use unique stable `data-context-manager-preset-*` hooks for runtime tests (not visual selectors as an internal authorization mechanism).

## 6. Tests-only RED / minimum GREEN breakdown

**P0 — B2 qualification repair (before UI RED):**
- Add `.artifacts/client-model-tests/client-preset-mutation.test.mjs` to `package.json` `test:client-model` explicit node-test invocation.
- Verify seven current test cases are actually executed, not merely compiled; show exact line/probe counts and Head.
- Add generated Remote mutation-port assertion; no new Remote method or protocol.
- Optional safety tests around read-lease cleanup before enabling View.

**B3-A — Frozen Business Face RED -> GREEN:**
- `tests/client-business-face.test.ts` exact public contract, state hooks, wrappers, no lifecycle/Remote leak; published renderer hook compatibility check.
- Model `refreshNativePresets`, live selection accessor and lease API as required; no second cache.

**B3-B — Three-pane Store RED -> GREEN:**
- New `tests/client-preset-editor.test.ts` + source-level Presentation tests (through actual DSH Store instance). Exhaustive three-pane guards, cross-draft occupancy and strong terminal notice invariants.

**B3-C — Native sensitive read RED -> GREEN:**
- View click => one read; no mount/row-switch auto-read; source content escaped. Explicit close/selection/pane change wipes data and cancels stale Owner; older cleanup cannot erase newer lease. Known stale/error states cannot expose an old body.

**B3-D — Real Renderer RED -> GREEN:**
- Extend the existing real published Renderer harness behind `M8C_PRESET_PROBE` (separate from `M8B_SKILL_PROBE`), plus an isolated `tests/m8c/run-preset-renderer-probes.mjs` runner with canonical case inventory.
- Suggested cases:
  - R01 roster/metadata/default/broken, R02 zero eager body read, R03 exact escaped body, R04 A->B read race, R05 view lease cleanup on Close/Pane exit,
  - R06 copy exact IDs, R07 null vs empty explicit name, R08 collision zero RPC, R09 unconfirmed Remove zero RPC, R10 confirmed Remove one RPC,
  - R11 native refusal/trust/default informational only, R12 double-submit single-flight, R13 effective fallback raw-null race, R14 old handler after same-epoch remount, R15 old handler after Close->Reopen,
  - R16 cross-pane draft guard, R17 confirmed/degraded first receipt, R18 transport Unknown no retry, R19 detach/root revocation, R20 old Profile/Resource/Skill regression.
- Each probe asserts actual native-Remote fixture call inventory and the **real** Client plugin + SlotCore/Renderer, not a fake direct component. Seed different Host presets only for M8C probes; existing historical default scenario remains untouched.

**B3-E — Qualification wiring and handoff:**
- Add compiled Preset Editor and Controller outputs to *explicit* `package.json` node-test runner and TS configs.
- Keep existing M8B 36-case suite. Add M8C runner to existing `client-presentation-contract` for **all four** retained published Renderer generations (0.1.2-rc.1, 0.1.5-rc.1, 0.1.5-rc.2, 0.1.6-alpha.2).
- Prove one or more Draft Quick RED/GREEN cases run on the exact Head, not solely on Ready-only matrix.
- Establish separate real published Host/Remote round-trip as per B0 P22/P24. A green React mock does not substitute this.
- Only after independent B3 review proceed to B4 Ready 86-job/21-upstream gate; ensure adding tests changes neither required job inventory nor full-qualification aggregation unless explicitly documented.

## 7. Risk and acceptance decisions

1. **Raw native composition exposure:** release-blocking until authenticated Browser/Remote privacy boundary is positively verified.
2. **Unknown outcome:** always nonretriable automatically; a fresh roster observation is not a retroactive proof of a particular dispatched RPC. Display uncertainty accurately.
3. **No native CAS:** UI freshness/selection checks reject provably stale local intent but cannot prevent external file race; native DSH handles collision and remove authority.
4. **Controller's B2 behavior:** never regress existing native single-flight. If remediation needed, establish separate focused RED before changing B2 source.
5. **Profile/Resource/Skill parity:** no weakening of existing R14/R15, F01-SR* and prompt-binding render-time authorization when adding third Pane.
6. **M8C eligibility:** B3 is done only after tracked RED -> actual GREEN for all exposed actions and four real published Renderer versions, plus the preflight caveat cleared. Draft Quick alone is not M8C Ready.

## 8. Planned start order

`P0 B2 runtime test-entry repair → B3-A Business Face RED/GREEN → B3-B Presentation RED/GREEN → B3-C read lease RED/GREEN → B3-D real Renderer RED/GREEN → B3-E full provenance/Strict Review.`

This document was originally a planning-only contract at its historical reviewed HEAD. Implementation and targeted RED→GREEN evidence were subsequently committed to Draft PR #43; retaining the original start-order text above preserves provenance and does not claim current work is still unstarted.
