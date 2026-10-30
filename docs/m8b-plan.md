# M8B — Profile Skill Policy Editor (Capability & Implementation Contract)

**Status:** **B0 executable Published Contract Preflight PASS on code HEAD `26a6d13c22bf04c81af0cdc6e4cd180a44ec5f86`** — five Host/Remote and four Client/Renderer generations, 107/107 assertions, fail-closed aggregation [#41072313964](https://github.com/WwlWss/dsh-context-manager/actions/runs/41072313964); exact-code Draft Quick [#41072313972](https://github.com/WwlWss/dsh-context-manager/actions/runs/41072313972) SUCCESS. The narrow existing Host inherited-binding bug was repaired with `Object.hasOwn`; RED remains archived in §12, GREEN in §13. **Draft PR #42 remains unmerged; no M8B editor/B1 tests or Ready 86-job Full are claimed.** Documentation/workflow cleanup commits after this run require an independent final Draft Quick.
**Baseline:** merged M8A2 PR #41, main commit `5a21df1b5f27fbcc22cdb389de3c1d765b96a95d`; independent main Full [#41009808239](https://github.com/WwlWss/dsh-context-manager/actions/runs/41009808239), 86/86 SUCCESS, 0 failed/skipped.
**Branch:** `feat/m8b-skill-policy-editor`. This branch is separate from qualified main. Keep PR Draft until B0 preflight + RED + GREEN + independent strict review closeout.
**Purpose:** edit explicit Profile-local Skill policy configuration with the existing Profile Settings authority; explain known native/Agent effectiveness separately, never infer an Agent's behavior from a reusable Profile record alone.

## 1. Frozen outcome and non-goals

1. In the **existing Profile Drawer detail** add a Skill Policy section for the selected usable Profile. No third pane, new resource write lane or replacement of DSH's native SkillRegistry.
2. Render exact stored Skill names and four configured modes; deterministic UTF-16 code-unit ordering (native `compareSkillNames`), not locale-dependent sorting. Do not strip whitespace, normalize Unicode, rename or silently deduplicate authored names.
3. Allow explicitly configuring a missing Skill Binding and changing **only its mode** with one `setSkillMode` RPC per Save. The same Host leaf setter creates or updates the named object; no `addSkillBinding` endpoint exists or is required.
4. Allow removing an existing complete Binding only through explicit confirmation and one `removeSkillBinding` RPC. This is *not* setting Auto; removal destroys the entire stored binding including potentially unknown extension siblings.
5. Surface **configured mode**, **native Skill resolution**, **Agent-scoped invocation-policy effectiveness**, and **Pinned content-loading status** as distinct facts. The last three are not implicitly global Profile facts.
6. Maintain exact draft and result ownership across tab changes, close/reopen, late reads, stale React callbacks and renderer teardown. No silent repair, auto-retry, write recapture, multi-save transaction, or second authoritative store.
7. Never display, return or cache native Skill definition bodies through runtime diagnostics or Editor. Pinned M5C remains responsible for the internal model-facing full instructions.

Out of scope: new Host/Remote v4 methods, a global native Skill catalog endpoint, Agent enumeration or invented Agent selection, raw Stored-profile repair, unknown sibling editing, bulk Skill policies, Skill rename, Workspace/Session policy overrides, M8C native preset authoring, M8D effective-context preview, and arbitrary prompt-body inspection.

## 2. Existing source-contract preflight (B0, verified on main)

| Boundary | Existing implementation | Result |
|---|---|---|
| Domain normalization | `src/domain/normalize.ts` — `parseSkillBinding` validates only `mode`, allows unknown stored sibling fields without surfacing them | Usable Profile view is safe and projected |
| Remote Profile read | `src/remote/types.ts` — `profiles[profileId].skills[skillName].mode` | Read-only exact configured mode is present |
| Host write | `src/service/context-manager.ts` — `setSkillMode(profileId, skillName, mode, expectedRevision)` | One leaf `set`; existing binding's unknown siblings preserved |
| Host remove | Same service — `removeSkillBinding(profileId, skillName, expectedRevision)` | One explicit whole-binding `unset` |
| Remote Profile mutations | `src/service/remote.ts` and `src/client/remote-port.ts` | Both methods already exposed under Remote API v3 |
| Client Controller | `src/client/mutation-controller.ts`, `mutation-types.ts` | `set-skill-mode` and `remove-skill-binding` already implemented; original Profile Basis and single-flight |
| Published Business Face | `src/client/business-face.ts` | Both typed callbacks already forwarded; no new mutation facade |
| UI Presentation | `src/client/profile-drawer.ts` / `presentation-store.ts` / `profile-editor.ts` | Existing Profile draft Token, live-owner fence, submit claim, terminal receipt, cancel/discard |
| Agent Skill inspect | `inspectSkillRuntime(agentId)` through `model.loadAgentSkillRuntime`; `snapshot.diagnostics.skills.get(agentId)` | On-demand keyed Agent data exists; **not** a global Profile result |
| Agent Pinned inspect | `inspectPinnedSkillRuntime(agentId)` through `model.loadAgentPinnedRuntime`; `snapshot.diagnostics.pinned.get(agentId)` | Separate on-demand Pinned state; no instruction body |
| Current Client Business Face reads | Does not currently project the two `loadAgent*Runtime` read methods into Renderer props | Requires **additive Client-only read facade** if Agent inspection UI is enabled |
| Native Skills inventory | No verified public global Skill catalog / Agent inventory in existing Remote Business Face | Do **not** fabricate a complete dropdown or automatically select Agent |

**Evidence classification:** above is verified source availability, not executed B0 published Host preflight or new M8B RED tests. Run those before GREEN implementation. The existing successful main Full qualifies its frozen graph, **not** any new M8B UI.

## 3. Stored semantics, exact IDs, and mode meanings

Known binding projection: `{ mode: 'pinned' | 'auto' | 'manual' | 'off' }`. The Stored object may contain unknown extension keys. Remote Projection intentionally returns only the typed known mode.

| Configuration | Native invocation-policy effect **if effective** | Separate meaning |
|---|---|---|
| **Auto** | Do not override native winning policy | **Explicit Auto Binding remains stored** |
| **Manual** | Model invocation disabled; user invocation remains enabled | Agent-scoped policy overlay |
| **Off** | Both native invocation surfaces disabled | Explicitly disabled, not removed |
| **Pinned** | Both native invocation surfaces disabled | Separate M5C may inject full instructions in system-prompt assembly only when effective/available |

**Critical:** Auto, absence of a Binding and removal are distinct Stored states, even when a native invocation looks similar. **Pinned is not synonymous with Off**: M5C has separate catalog, native-provider, policy precedence and assembly gates. Do not describe Pinned as guaranteed effective or immediately loaded.

All name inputs are exact string keys. Refuse **only** the path-unsafe key `__proto__` (both Profile ID and Skill name). `constructor` and `prototype` are valid path keys, not generic forbidden names. Do not use `trim()` for identity. Empty and whitespace-only Skill names require published Host path preflight before their UX is frozen; there is no invented "must be non-empty" rule.

On valid existing Binding, `setSkillMode` changes only `['profiles', profileId, 'skills', skillName, 'mode']`; unknown Stored siblings survive. On explicit Remove, `removeSkillBinding` unsets `['profiles', profileId, 'skills', skillName]`, so unknown siblings (even ones unseen by the typed projection) will be removed. Show this destructive boundary in confirmation.

A malformed Binding causes `parseProfile` to reject its whole Profile into an `invalid-profile` diagnostic. M8B **must not** synthesize a valid Skill row, guess the malformed key or quietly repair the payload. Keep invalid Profile read-only and defer raw repair to M8E. Do not promise that malformed bindings are repairable through the normal Profile Skill section.

## 4. UI layout and interaction contract

Inside a selected **usable Profile** detail, after existing metadata / PromptBinding section:

- Header "Skill policy" with "Configure Skill" action gated by Profile writable authority, no existing Profile/Resource draft and no running Profile write.
- Deterministically sorted Binding rows. Each displays exact, quoted Skill ID (including empty/whitespace if qualified), one configured mode, a short mode explanation, Edit Mode and Remove actions.
- **Configure**: exact Skill name + four-mode selector; a pre-existing name is refused as a separate Create intent, not overwritten by an "Add" click; confirm using the existing `setSkillMode` on one Save. Do not treat native discovery as an authoritative validation prerequisite.
- **Edit**: mode-only selector from the observed record; no name rename, no other leaf edits, no RPC on unchanged value. An explicit Auto selection is a real edit if the original was not Auto.
- **Remove**: confirmation presents exact Profile ID and exact Skill name, explains full-binding deletion including unknown extension siblings; one `removeSkillBinding` on confirmed Save.
- Usability and skill runtime facts are separate visually: configured mode may be shown immediately; native resolution and Agent effectiveness default to "unverified" absent explicit eligible Agent inspection.
- Current M7C/M8A1/M8A2 pane, published Slot registration, React hook boundaries and DSH root Store identity remain unchanged.

**No complete native-skill selector:** profile Skill names must be free-form. Only show optional suggestions if a later published and stable source is proven; absence from an Agent's keyed runtime inspection is not evidence that a global Skill name does not exist.

## 5. Draft ownership, Begin fences and Save contract

Reuse **one shared Profile draft lane**, not a second Skill Store. Add kinds to the existing `ProfileDraft` union, e.g. `skill-mode-create`, `skill-mode-edit` and `skill-binding-delete`. Keep `token`, immutable captured `basis={instanceId, revision}`, `submitting`, `blocked` and `terminalNotice`. A Skill draft competes with M7C Profile, M8A2 PromptBinding and M8A1 Resource draft presentation occupancy but **not** with the independent Host Resource Controller.

**Begin:**
1. The rendered Profile must be selected/usable and writable; published Protocol/attachment ready; no running Profile operation or any visible Profile/Resource draft.
2. Capture a **fresh live Profile Basis** but require it to equal the authority/revision of the **rendered Profile** before constructing the draft. For existing Skill mode and removal, verify exact rendered Skill Binding and mode; for Configure, verify absent in this rendered Profile.
3. Reject stale rendered Begin with a warning and **zero Store draft / zero RPC**. No silent recapture of a newer original. A different Resource authority alone must not invalidate the Profile basis.
4. Existing P3: historical `canBeginProfileDraft` does not check `state.open`; introduce a focused RED and minimal common Begin-open guard before enabling another retained callback. **Closing while an existing draft is active must still preserve that draft.** No Host/Remote changes.

**Edit / Input:** all changes require the original draft token, correct kind, not blocked and not submitting. Same-token successive inputs remain valid; an older token may not edit or cancel a newer draft.

**Save:** read the actual published DSH root Store via `readLivePresentationForActions(actions)`; require `ownsLiveProfileDraft(current, original)` by strict original draft object identity. Check selected Profile/Skill intent and original mode; claim the current token synchronously with `beginProfileSubmission`, verify `submitting`, then issue **exactly one** existing Profile RPC using the unchanged captured basis. Never rebase to a later Settings revision or retry Unknown/Conflict. The Host CAS remains authoritative.

**Outcome:** successful & fresh -> complete and clear token; successful but read-degraded -> preserve first confirmed/degraded receipt and block as unverified (do not relabel as unknown); Unknown -> retain original error and draft; Conflict -> retain original conflict; stale/superseded -> no obsolete write reply may clear an unrelated draft; nonterminal known business error -> show exact safe code/notice without fabricating success. First terminal notice belongs to the draft token; later refresh, tab/selection, repeated Block or stale Complete cannot overwrite it. Only explicit token-matching Discard clears blocked state.

## 6. Native resolution and policy-effectiveness diagnostic model

**There are two independent existing Agent-scoped reads, not a global Skill catalog.**

- `inspectSkillRuntime(agentId)` returns runtime-unavailable / agent-not-live / resolved; resolved includes `profile`, `catalogComplete` and per-configured-Binding states: `native-pass-through`, `policy-applied`, `policy-not-effective`, `missing-native-skill` or `catalog-incomplete`. Provider name and invocation booleans are facts only for that Agent and read.
- `inspectPinnedSkillRuntime(agentId)` independently returns runtime-unavailable / agent-not-live / assembly-bypassed / resolved; resolved may include Pinned `loaded`, `definition-unavailable`, `missing-native-skill`, `catalog-incomplete` or `policy-not-effective` plus last observed `nativeState`. It does not contain Skill instruction bodies.

**B3 diagnostic UI gate:** first prove a safe, concrete Agent ID source. Current exposed Business Face has no Agent inventory; avoid claiming a current Agent from Profile selection. The smallest fully supported fallback is an **explicit user-entered exact Agent ID** with an on-demand "Inspect this Agent" action; do not auto-read on mount, Profile selection or mode changes.

Expose the two existing Client Model lazy loaders through an **additive, typed, read-only Business Face** projection only after confirming the retained published Slot/Renderer ABI. Display results in a separate, clearly Agent-scoped panel. Only attribute diagnostics to the currently selected Profile when the **read payload reports `profile.status==='active'` and `profile.profileId` matches the selected Profile ID**. Otherwise show "Agent uses another Profile" or "no active Profile" instead of propagating verdicts onto rows.

For each surface, require ready, nonstale Client state, exact Agent key and compatible attachment. Distinguish requested/idle/loading/error/stale/superseded, incomplete native catalog, native missing, provider priority loss and Pinned assembly-bypassed. Agent snapshot validity uses existing runtime change cursor; no invented cross-surface atomicity between Skill and Pinned inspections. Never collapse "not observed" into "not installed", "selected" into "effective", or `loaded` into guaranteed subsequent prompt inclusion.

Async read completion must not overwrite the first terminal Profile mutation notice or a different Agent/Profile selection. Do not display SkillDefinition content, serialized system prompts or cached instruction bytes.

**If no usable Agent ID can be supplied/proven**, ship configuration editor without per-Agent verdicts and explicitly record the diagnostic limitation; do not lower M8B's honesty requirements. A new Agent inventory public seam would be a separately approved project, not an implicit M8B Host upgrade.

## 7. Planned code seams (additive only)

1. `src/client/skill-policy-editor.ts` — pure exact-name/mode/readiness helpers, Begin snapshot vs captured Basis, deterministic rows, Host-result classification.
2. `src/client/skill-policy-section.ts` — one React section inside `ContextManagerProfileDrawerContent`; no new top-level pane, second Store or DSH Slot registration.
3. `src/client/profile-editor.ts` + `presentation-store.ts` — add Skill draft discriminants and exact-token actions; reuse Profile controller lane, first receipt priority, live Owner. Minimal Begin-open fix only with focused cross-pane RED.
4. `src/client/profile-drawer.ts` — mount Skill section for selected usable Profile; carefully share Profile draft forms and blocked state.
5. `src/client/business-face.ts` — **only if diagnostics phase begins**, add two explicitly typed read-only forwarding methods from the existing Model. No Host Remote port or new Controller.
6. `src/client/locales.ts` + `plugin.module.css` — additive zh/en labels, response state and existing scrollable details.
7. `tests/client-skill-policy-editor.test.ts` and `tests/client-profile-drawer-runtime.mjs` — typed pure Store RED and real published Renderer regressions.
8. `tests/m8b-published-host-preflight.test.mjs` (or a temporary verified published DSH preflight workflow) — prove Host/Remote skill mutation and read ABI **before** GREEN.
9. `package.json`, `tsconfig.client-model-test.json`, `tsdown.client-model-test.config.ts` — wire all new tests into existing CI; do not narrow other suites.

Do not mutate `src/service/context-manager.ts`, `src/service/remote.ts`, Remote API v3, Profile or Resource Mutation Controller, native M5B/M5C runtime, DSH dependencies, frozen 86-job matrix or published Slot component contract as a routine M8B change. A genuine existing bug needs its own separately evidenced minimal RED→GREEN change.

## 8. Delivery stages and immutable gates

| Stage | Work | Exit |
|---|---|---|
| **B0 — Published contract preflight** | Exact merged main; Host Settings leaf preservation/remove; Remote v3 method shape; four retained Client generations; runtime inspection omits instruction bodies; invalid-path, absent, malformed and key edge cases | Executed/archived evidence, no assumption based only on source |
| **B1 — Pure Model/Store RED** | Exact IDs, mode semantics, configured vs absent, no-op mode, one RPC, original revision, concurrent writer, same-render Save, stale Begin, retained terminal receipt, closed-Draft Begin | RED fails for the intended missing feature/safety, not fixture invalidity |
| **B2 — Core Skill editor GREEN** | Binding browse/configure/mode edit/remove with confirmation; shared Profile Token/controller; preserved unknown Stored siblings; UI/Presenter-only changes | Typed Client + real published Renderer GREEN; Draft Quick |
| **B3 — Agent diagnostics GREEN** | Gate Agent ID, two already existing keyed reads, optional typed Business Face projection; separate native/policy/Pinned statuses, no bodies, async ownership tests | Real published Renderer + no misleading Profile-effectiveness claim |
| **B4 — Strict/Full closeout** | Independent strict source review, fix any P1/P2 by targeted RED→GREEN, exact-head Draft Quick, Ready and unchanged 86-job fail-closed Full, exact-head Final Review | Only then merge; independent new main 86/86 closes M8B |

B2/B3 may be broken into smaller PR-safe commits within this **one Draft PR**, but each commit must preserve baseline contracts. B3 must not block B2 implementation where the current public Agent ID source is unavailable; never misrepresent absent runtime inspection as a passed diagnostic UX.

## 9. Explicit acceptance and negative test matrix

- Exact names: ASCII, Unicode, whitespace, empty (only after Host confirmation), `constructor`/`prototype` permitted, `__proto__` denied as Settings path.
- Four modes: Pinned/Auto/Manual/Off distinguished; Auto never deletes an authored Binding.
- Create mode uses one setSkillMode RPC; existing mode change uses one same RPC; Remove uses one removeSkillBinding RPC, confirmation required; no zero-or-two write surprise.
- Unknown Stored sibling metadata survives a mode edit, and **only explicit Remove** deletes the whole Binding. No fabricated raw siblings from typed Projection.
- Invalid Profile remains readable/diagnostic but M8B cannot mutate or "repair" it.
- One Settings revision step / exact Profile Basis; old renderer after external revision or Host-instance rotation -> **zero write**; unrelated Resource-only Authority rotation does not create a new Profile basis.
- Old Save callback after Cancel, another Profile draft, Resource draft, pane switch, close/reopen or Store teardown -> **zero unauthorized writes**. Closing with live draft preserves it.
- Concurrent Save double-click -> at most one Profile RPC; stored business denial does not auto retry.
- Unknown/Conflict/Applied+Degraded: distinguish and retain first exact receipt/detail until explicit Discard; late Complete and failed keyed reads cannot clobber.
- Native-mode explanation: Manual model=false/user=true, Off/Pinned both=false *if effective*, Auto preserves native, Pinned loading separately conditional.
- Agent inspector: no auto polling; only explicitly supplied real ID; unavailable/not-live/catalog-incomplete/policy-not-effective not confused with missing; wrong effective Profile not projected onto selected Profile.
- Runtime diagnostic payload contains no Skill instruction bodies; no read-side body downloads; at least one fixture intentionally includes marker text and checks it is absent from Remote/Renderer.
- All four retained published Client Renderer generations exercise M8B with strict tsc, not merely local react-shim; no old CI checks removed.
- Final 86/86 is an independent Ready run on exact PR Head; after merge a **different main run** must verify the merge commit. The official packed Chromium M7D control alone does not establish M8B-specific browser CRUD coverage.

## 10. Deferred risks / scope honesty

**Existing P3:** `canBeginProfileDraft` / `canBeginResourceDraft` do not check Drawer open. A very old callback can occupy an invisible presentation draft; the independent Host write owner still blocks unapproved RPCs. Prefer a small common RED→GREEN Begin-open guard early in B1, while preserving close/reopen drafts.

**No native full Skill inventory / Agent enumeration currently published:** any "installed Skill" autocomplete or current-Agent badge requires independent source proof. Prefer exact free-form input and explicit keyed inspection. This must not trigger Remote v4 or a speculative Host registry service.

**Compatibility:** built/current retained DSH versions are 0.1.2-rc.1, 0.1.5-rc.1, 0.1.5-rc.2, 0.1.6-alpha.2 for Client Bridge; earlier 0.1.1 paths remain in frozen Host/Slot compatibility. DSH 0.1.7+/0.2.x are not newly qualified by this plan.

**Historical docs:** main README/roadmap still contain pre-merge M8A2 wording; these may be updated in this Draft branch as docs housekeeping, but documentation changes do not constitute a new M8B GREEN or supersede the original M8A2 main Full evidence.


## 11. B0 executable published-contract preflight — detailed implementation plan (design only, 2026-10-30)

This section specifies **what to implement next**; none of its proposed tests, temporary workflow or B0 artifacts has been executed yet. Current source-check-only B0 status and existing M8A2 independent main Full remain distinct. Stage B0 must not add a Skill Editor, mutate Host/Remote/Controller/runtime code or promote the Draft PR to Ready.

### 11.1 Frozen targets, dependency generations and evidence classes

- **Exact starting commit:** `5a21df1b5f27fbcc22cdb389de3c1d765b96a95d`, the independently qualified post-merge M8A2 main (Full `#41009808239`, 86/86). Execute new B0 scripts from PR #42 HEAD; record both base and actual test HEAD in each manifest.
- **Five Host/Remote generations:** `0.1.1-rc.2` (Cordis `4.0.1`, Schemastery `3.18.1`); `0.1.2-rc.1`, `0.1.5-rc.1`, `0.1.5-rc.2`, `0.1.6-alpha.2` (Cordis `4.0.2`, Schemastery `3.18.2`). Cover published DSH Settings, Typert/Gateway and native Skill/Scope without silently translating APIs.
- **Four real Client Renderer generations:** `0.1.2-rc.1`, `0.1.5-rc.1`, `0.1.5-rc.2`, `0.1.6-alpha.2` with `react@18.3.1`, `@types/react@18.3.31`, Node `22.20.0`, pnpm `11.7.0`. The legacy `0.1.1-rc.2` has a different retained Slot/Host path and is **not** claimed to expose the newer Client Renderer; keep its frozen legacy proof.
- **Separate evidence classes:** (H) actual published Settings-backed Host mutates Stored data; (R) actual strict generated Typert Gateway carries Host Profile RPC and sanitized diagnostic projections; (C) actual retained Client declarations and Renderer mount/teardown compile/execute; (N) native Skill/Scope and M5B/M5C runtime compatibility already qualified by the main Full and optionally rerun as supplemental—not interchangeable with H/R/C.
- **No source-implementation test masquerading as a published test:** importing local types or `RemoteService` without the selected package overlay does not qualify a version. A fake native runtime port proves Remote projection/redaction, **not** native resolution or actual SkillDefinition body loading.

### 11.2 Planned implementation files (four additions; one temporary workflow; one plan update)

| Artifact | Purpose | Retention |
|---|---|---|
| `tests/m8b-published-host-preflight.test.mjs` | Real `Context` + published `SettingsProvider` + `ContextManagerService` + `ContextManagerChangeTracker` + `ContextManagerRemoteService`, exact leaf mode/set/delete behavior, Settings CAS, path matrix, malformed diagnostics | **Permanent**, automatically included by existing `node --test ./tests/*.test.mjs` |
| `tests/m8b-published-gateway-preflight.mjs` | Actual `TypertRegistry` + `TypertGatewayService` + generated `TYPERT` + real Profile Host, and explicit fake Skill/Pinned read-only ports solely for poisoned projection/strict schema safety | **Permanent**; run explicitly in published matrix (Gateway is an optional published package absent from the pinned ordinary Draft Quick install) |
| `tests/m8b-client-contract-preflight.ts` | Typed, compile-only proof of frozen Profile `setSkillMode` / `removeSkillBinding` facade, explicit Profile Basis, lazy Agent read model interfaces, with existing `tests/client-upstream-contract.ts` and generated Remote declarations | **Permanent**, invoked under 4-generation strict TypeScript preflight; does not claim new UI |
| `scripts/verify-m8b-b0-evidence.mjs` | Parse structured per-version results and fail closed on missing, duplicate, wrong HEAD, skipped or non-PASS H/R/C proof; never print secrets | **Permanent** evidence verifier, not a replacement for official Full |
| `tests/m8b-b0-evidence.test.mjs` | Standalone synthetic manifest tests: exactly nine good inputs accepted; missing/duplicate/wrong-Head/partial/skipped rejected | **Permanent**; automatically included by ordinary Node test glob |
| `.github/workflows/m8b-b0-published-preflight.yml` | **Temporary Draft-only** published package test matrix and evidence collection; independent from unchanged official 86-job CI | Delete **after** immutable GREEN links and machine-readable manifest hashes are archived in `docs/m8b-plan.md` |
| `docs/m8b-plan.md` | This implementation contract, subsequent actual cases/versions/CI links, B0 decision & remaining capability gaps | **Permanent** |

Use exact base fixtures already established by `tests/m8a2-published-host-preflight.test.mjs`, `tests/context-manager.test.mjs`, `tests/remote-upstream-runtime.mjs`, `tests/remote-m6c.test.mjs` and `tests/skill-runtime-upstream-runtime.mjs`. Reuse their service lifecycle and generated Gateway invocation idioms; do not duplicate an alternate Settings or Remote implementation.

### 11.3 H lane — real Settings and Host operation probes

**Fixture:** isolated fresh `Context` per `node:test` case; a minimal class extending **the selected published** `SettingsProvider`, using `structuredClone` on `load()`/`persist()`. Mount published-memory provider, real `ContextManagerService`, `ContextManagerChangeTracker` and real `ContextManagerRemoteService` in dependency order. Dispose in reverse through `t.after`. Gather `basis = { instanceId: remote.changes().instanceId, revision: remote.profiles().persistence.revision }` immediately **before each** intentional successful write; retain an old basis only for explicitly stale/conflict tests.

**Positive test table (every supported Host generation, not merely localhost latest):**

| Case | Operation | Assert |
|---|---|---|
| H01 | Real `createProfile` with known and unknown Profile and Skill fields | Stored data has exact unknown siblings; Remote typed projection contains `mode` but not unknown siblings |
| H02 | Missing name → `setSkillMode(...,'auto',basis)` | Exactly one native Settings revision increment; **explicit** Auto Binding now exists |
| H03 | Existing Mode Auto → Manual → Off → Pinned → Auto | Every Save is one leaf write, one revision increment; exact stored mode; non-`mode` siblings and other Skill bindings remain byte/structurally equal |
| H04 | `removeSkillBinding` for explicit existing name | Exactly one revision increment and whole entry absent; other bindings and Profile extension preserved |
| H05 | Same Skill mode received again | Observe Host behavior and version increment **as implemented**; Editor B1 may suppress unchanged writes, but never falsely claim Host deduplicates |
| H06 | Delete missing name | `skill-binding-not-found`, no persisted modification and no revision increment |
| H07 | Invalid mode such as `banana` | `invalid-skill-mode` (or strict Gateway rejection at Gateway boundary), no persistence mutation |
| H08 | Captured stale Settings revision, after another legitimate write | `profile-conflict` with expected/actual revision; original Stored content retained |
| H09 | Correct revision but wrong `instanceId` | `host-instance-conflict`; no write/no revision bump |
| H10 | Legal path IDs `constructor`/`prototype`, Unicode, whitespace, empty (observed, version-reported) | Exact key preserved by `Object.hasOwn` and projection; no trimming or prototype mutation. Pin accepted/rejected verdicts only after actual per-generation proof |
| H11 | `__proto__` Skill name and Host-unsafe Profile ID | `unsafe-path-key`; snapshot, Stored and revision strictly unchanged |
| H12 | Malformed Skill Binding / scalar `skills` / scalar Profile in `setRawProfile` | Host's path-local repair capability is recorded accurately; existing unrelated sibling data must not be destroyed. **UI remains read-only on an invalid Profile** |
| H13 | Explicit Auto versus Remove versus absent | All three persistently distinct (Auto present, Remove absent); no auto-cleanup on mode change |

For each write compare `manager.getStoredProfile` before/after and `remote.profiles()`. Use the actual native `Settings` revision and `Object.hasOwn`; do not count FakeProfiles writes or rely only on the returned Remote snapshot. The existing Host `setSkillMode` accepts absent Binding by targeting a `mode` leaf, but Settings path creation behavior **must be proved on every selected published generation**.

**Important qualification:** H10 does not predeclare whether empty/whitespace-only names are supported. If any retained version deviates, fail the cross-version universal-editability claim and explicitly record the version-specific limitation, then choose a conservative UI gate; never normalize the user's exact authored Skill name.

### 11.4 R lane — real Gateway/strict codec and sanitized runtime projection

Mount `TypertRegistry` and `TypertGatewayService` against the exact selected dependency generation and register the **generated existing** `TYPERT` descriptor. Use the real `ContextManagerService` and published `Settings` when testing `setSkillMode` / `removeSkillBinding`; do **not** use `FakeProfiles.setSkillMode` for preservation/CAS evidence because its implementation overwrites Binding siblings.

For each version call:
- `ctx.typertGateway.invoke({namespace:'contextManager',method:'protocol',args:{}})` => Remote `apiVersion===3`.
- `profiles`, `setSkillMode`, `removeSkillBinding` using their **actual generated argument object** names (`profileId`, `skillName`, `mode`, `basis`), and re-read `profiles` and underlying Stored data after each.
- Reuse `TYPERT` / `TYPERT_REMOTE` strict codec assertions from `tests/remote-upstream-runtime.mjs` for just those method descriptors plus two inspection methods. A method check alone is insufficient; require an end-to-end successful call and rejection cases under the generated codec.

**Runtime projection security fixture:** register separate read-only faux `dshContextSkillRuntime` and `dshContextPinnedSkillRuntime` services returning controlled (and deliberately **host-private**) extra properties such as `instructions`, `content`, `path`, a secret marker `M8B_B0_PRIVATE_SKILL_DEFINITION` and private nested profile data. Verify the **actual** `inspectSkillRuntime(agentId)` and `inspectPinnedSkillRuntime(agentId)` projections independently:
- preserve the authorized states/metadata (`native-pass-through`, `policy-applied`, `policy-not-effective`, `missing-native-skill`, `catalog-incomplete`; Pinned `loaded`, `definition-unavailable`, `policy-not-effective`, `assembly-bypassed` and native-state values);
- remove the unexpected private keys from the returned objects; assert exact projection shape **and** `JSON.stringify(result)` excludes both secret marker and private host path;
- return `runtime-unavailable` / `agent-not-live` as actual report states, never a manufactured successful/effective record;
- assert correct `agentId` identity, `profile.status`/`profileId` and finite native verdicts; do **not** fabricate Agent enumeration or infer "Profile effective" from a different Agent's result;
- explicitly distinguish faux-port projection safety from actual M5B/M5C native SkillRegistry availability; cite/rerun the frozen M5B/M5C native test suite as supplemental evidence if needed.

The Remote public inspector must **never** call a `SkillDefinition` content loader merely for B0 introspection. A real native-provider side-effect counter is a useful additional N case, but cannot be proved merely from the faux `inspect()` return value. Pinned's own M5C assembly may load definitions internally; the requirement is **no body in Remote/Client inspection result**, not "no internal Pinned loading under any circumstances".

### 11.5 C lane — four genuine retained Client generations

Test **published** Client Slots/Store/Locale/Renderer/React versions, not just the local React shim. Use the frozen official `client-presentation-contract` install and TypeScript command as the baseline. Append `tests/m8b-client-contract-preflight.ts` to the strict compile inputs; additionally run existing `tests/client-renderer-bridge-runtime.mjs` and `tests/client-profile-drawer-runtime.mjs`. No new Skill UI is expected or asserted at B0.

The typed probe must demonstrate:
- the two published Business Face mutations accept one original `ContextManagerClientProfileMutationBasis` and return `Promise<ContextManagerClientProfileMutationResult>`;
- the Model exposes `loadAgentSkillRuntime` and `loadAgentPinnedRuntime` and the diagnostics cache distinguishes `skills` and `pinned` by exact Agent ID;
- the frozen Business Face currently does **not** expose those two lazy loaders. The B3 proposal must be additive and must not accidentally change the public Slot factory ABI;
- a real published Renderer can still mount the existing Profile/Resource/PromptBinding view without hook-order, ReactNode or `StoreInstance.actions` drift.

B0's pass does **not** qualify M8B Skill editor buttons, submission state, or its Agent diagnostic UI: those do not exist yet. Those are B1/B2/B3 RED/GREEN targets.

### 11.6 Temporary workflow and reproducible qualification sequence

1. **Commit H/R/C tests separately** on `feat/m8b-skill-policy-editor` with no production-code changes. Add no TypeScript/editor exports, no new Remote v4 methods, and no alternative Source of Truth.
2. Create `.github/workflows/m8b-b0-published-preflight.yml` with `pull_request` `opened/synchronize/reopened` and path filters covering the exact B0 files + itself. Run in **Draft**, not by marking PR Ready. Use Node `22.20.0`, pnpm `11.7.0`, `actions/checkout@v7`, `setup-node@v7` and `fail-fast:false`.
3. Build the candidate's generated `lib` and `TYPERT` **once using pinned oldest dependencies** in a producer Job. Upload that exact artifact. In **each** five-version Host matrix job restore this artifact after `rm -rf lib`, overlay only the selected published Settings/Scope/Skill/Typert/Gateway/Cordis/Schemastery packages via `pnpm add --ignore-scripts --save-dev --save-exact`, and run the H + R node tests plus existing focused real-native M5 tests as compatible.
4. In four Client matrix jobs restore the **same** baseline Client `lib`/Remote declaration, overlay the real selected DSH Client packages plus React dependencies as in official `client-presentation-contract`, then execute strict `tsc`, existing Renderer bridge and current full Profile Drawer script. Do **not** rebuild `lib` after overlay (that would test a new per-version artifact rather than oldest-built compatibility).
5. Every matrix job writes `.artifacts/m8b-b0/<lane>-<version>.json` containing `testHeadSha`, `baseSha`, lane, exact package versions, named assertion IDs, allowed outcome/code, `status:"pass"` only when all required assertions ran. No private Skill content or host path appears in artifacts/logging. `actions/upload-artifact@v4` runs with `if:always()` so failed cases remain inspectable; missing artifact is always failure.
6. Add a single **B0 fail-closed aggregator** `if:always()` depending on the build producer + five Host + four Client lanes. It downloads nine expected manifests, checks exact **same** Head, unique versions, non-skipped required assertion IDs, all PASS and no missing/duplicate/unrecognized files, then runs `scripts/verify-m8b-b0-evidence.mjs`. A failed or canceled job is a failed B0, not "8/9 is enough". Archive final aggregator run URL and the source HEAD.
7. Independently verify the exact workflow run, matrix job count and artifact provenance through GitHub, including a source-only check that `.github/workflows/ci.yml`, Remote v3, Domain Host, Controllers, runtime services and packed Slot ABI did not change. A temporary workflow, if any, must be removed **only after** published GREEN and full evidence are linked in this document. Once removed, run exact final Draft Quick. Document that the canceled intermediate CI and the old pre-removal GREEN apply to different HEADs and are not exact-head qualification substitutes.
8. **B0 exit:** all nine published-generation H/R/C matrix lanes PASS, fail-closed aggregator PASS, B0 contract table verified and exceptions documented. No automatic PR Ready or Full/merge; request B1 executable RED implementation review next.

### 11.7 Expected failure triage / no-bypass rule

- **Typed/public ABI mismatch:** identify exact affected published DSH version and strict `tsc`/Gateway schema error. Do not claim success based on the latest generation only, suppress TypeScript errors or widen the published `Remote` type.
- **Settings path key or revision discrepancy:** report actual version, old/new Stored payload, expected and actual revision, exact path and error code **without leaking private values**. A failed retained version blocks unconditional B2 support until a product restriction is explicitly adopted or a separately scoped real upstream defect is repaired.
- **Agent inspection leak:** P0 for B3 diagnostic exposure; do not display body or private host-path data. Isolate whether the leak occurs in Host inspection, projection or Gateway and require a targeted RED before any production fix.
- **Environment/publish failure:** distinguish dependency unavailable, registry timeout, unsupported package or runner issue from an assertion failure. Keep the affected lane marked *not qualified* until rerun; do not silently skip or replace it with fake services.
- **Misleading claim:** distinguish real Settings-backed H result, real Gateway R result, real published Client C result and existing M5 native-runtime N results in every PR note. Do not call Draft Quick or nine-lane B0 an 86-job Ready Full.

**Proposed checkpoint:** after implementing the H/R/C tests but before temporary-workflow launch, perform a small contract-only review of the test fixture, exact published package overlay and evidence schema. Only then run the published B0 preflight and decide whether B1 RED may begin.


## 12. B0 executable implementation and reproducible first RED (2026-10-30)

### 12.1 Added code, provenance and qualification honesty

- **H:** `tests/m8b-published-host-preflight.test.mjs` implements H01–H13 using a real published `SettingsProvider` (not FakeProfiles), real Host `ContextManagerService` and Remote, with explicit exact Stored fields, revision/instance Basis and path cases.
- **R:** `tests/m8b-published-gateway-preflight.mjs` implements R01–R06 through real generated strict `TYPERT`/`TYPERT_REMOTE`, `TypertRegistry` and `TypertGatewayService`, backed by the **real** Profile Host. Only the two **read-only runtime Inspector ports** are synthetic poisoned fixtures, so they prove privacy projection and wire honesty, not native runtime SkillRegistry operations. It is deliberately excluded from ordinary `*.test.mjs` auto-discovery because optional Gateway packages are absent in the oldest pinned Draft Quick installation; published CI installs them explicitly and runs this file via `node --test`.
- **C:** `tests/m8b-client-contract-preflight.ts` and the existing real `client-renderer-bridge-runtime.mjs` and `client-profile-drawer-runtime.mjs` prove current mutation interface, captured original Profile Basis, lazy Agent read model, published Slot/React and legacy UI compatibility. No Skill editor UI exists yet.
- **Evidence:** `scripts/verify-m8b-b0-evidence.mjs` emits one actual-package-version/Head/ID manifest per successful lane, and refuses missing, duplicate, stale-HEAD, failed/skipped or partial proof. `tests/m8b-b0-evidence.test.mjs` exercises positive and negative synthetic manifest validation; synthetic evidence unit tests are not a substitute for live published matrix evidence.
- **Temporary workflow:** `.github/workflows/m8b-b0-published-preflight.yml` runs the one oldest-built artifact producer, five Host/Remote and four Client/Renderer versions, and a final `if:always()` aggregator. The unchanged official `.github/workflows/ci.yml` remains separate. The workflow must remain until a genuine B0 GREEN is archived, then be removed under exact-head Draft qualification.

### 12.2 Actual first published matrix and observed RED

**Published B0 run:** [`#41066479868`](https://github.com/WwlWss/dsh-context-manager/actions/runs/41066479868), source HEAD `1730759a7193d03efff57675bab3cb12e530091f`.

| Evidence | Actual result | Interpretation |
|---|---|---|
| Oldest-built producer | **SUCCESS** | One pinned package artifact built |
| Four Client lanes (0.1.2-rc.1, 0.1.5-rc.1, 0.1.5-rc.2, 0.1.6-alpha.2) | **4/4 SUCCESS** | Real published strict TS / Slot / M7C+M8A1+M8A2 Renderer C01–C03 |
| Five Host/Remote lanes | **5/5 FAILED** on H10 | R01–R06 all passed via actual Gateway in **every** generation. Host H01–H09 and H12–H13 assertions passed or were separately logged; H10 failed on inherited JS object keys and blocked per-lane H manifest issuance |
| Final nine-lane B0 aggregator | **FAILED** | Correct fail-closed behavior: missing 5 H manifests and upstream Host results not all success. Do not count 4/9 as GREEN |

Real per-version log: `M8B_B0_PATH_RESULTS` has `constructor`, `toString` and `valueOf` rejected with `profile-path-not-editable`, while `prototype`, `'  exact  '`, Unicode/tab, `' '` and `''` were accepted; `__proto__` correctly rejected as `unsafe-path-key`. This is a **reproducible product defect**, not an upstream package absence, flaky test, or unsupported identity policy. H10 deliberately refuses success until every legally safe key behaves correctly. A subsequent test-only commit moves H11's independent unsafe Profile guard assertion before the expected H10 RED so its proof is not lost.

**Identified root source:** `src/service/context-manager.ts` around line 280:
`const binding = skills?.[skillName]`.
For a normal JSON-shaped `skills` object without an own `constructor`/`toString`/`valueOf` binding, JS prototype lookup yields a Function inherited from `Object.prototype`. The subsequent `binding !== undefined && !isPlainObject(binding)` incorrectly treats this inherited Function as a malformed *Stored* Skill Binding and refuses the write. This contradicts the existing Settings path policy, which disallows `__proto__` specifically while allowing other literal names; `removeSkillBinding` already uses `Object.hasOwn` correctly.

**Original intent:** prohibit replacement of malformed **own** Stored bindings with scalar or non-object values and preserve unknown siblings. The code conflated inherited prototype members with own Stored entries. Retaining that structural safety is essential.

**Minimal repair candidate (NOT implemented during B0 test implementation):**

`const binding = skills !== undefined && Object.hasOwn(skills, skillName) ? skills[skillName] : undefined`

Require a separately scoped focused RED→GREEN code review before applying it: re-check scalar own-binding rejection, legitimate special keys, untouched non-mode Stored siblings, `__proto__` refusal, valid Profile CAS, concurrent writers, and all five published Host generations. The Host implementation is still **unchanged** in this B0 test-implementation iteration.

### 12.3 Remaining B0 gate before B1

**Historical status at the time of the first RED:** B0 was blocked and the one-line Host own-property guard was not yet applied. This remains an immutable failure record. The later minimal Host fix, fully published GREEN, and remaining documentation/workflow cleanup are recorded in §13; do not reinterpret this first RED as a passing run.


## 13. B0 inherited Skill-key minimal Host repair and independent published GREEN (2026-10-30)

### 13.1 Scope of actual product repair

After the five-version reproduced H10 RED in Section 12, a separate test-only commit `d03269a4cc4f30d21aa60be9520367e7c8249191` expanded H12: a **genuine own** malformed Stored binding for `constructor`, `toString` or `docker` must still fail `profile-path-not-editable` without a revision increment or sibling mutation. The original prior H10 RED for **absent** inherited keys remains intact.

One narrow Host change was then committed as `e3b82e726c0815469b2879c48b256a52f17e523b` in `src/service/context-manager.ts`, inside existing `setSkillMode`:

Before: `const binding = skills?.[skillName]`.

After:

```ts
// An absent stored binding must not resolve to an inherited Object.prototype
// member (constructor, toString, valueOf). Keep rejecting malformed OWN
// scalar bindings; only __proto__ remains forbidden as a Settings path key.
const binding = skills !== undefined && Object.hasOwn(skills, skillName)
  ? skills[skillName]
  : undefined
```

This changes only the **preflight lookup** used to distinguish absent/own-malformed Skill entries, not the path of the eventual Settings `set`, Remote v3 signature, Host CAS, `removeSkillBinding`, mutation controllers, native Skill runtime, profile write lane or published Client/Slot ABI. The existing `assertSafePathKey` still rejects `__proto__` only. No automatic retry or data repair is introduced. The temporary workflow trigger was extended to include the affected production source and the evidence regression unit test in commit `26a6d13c22bf04c81af0cdc6e4cd180a44ec5f86`.

### 13.2 Formal published GREEN — frozen **code HEAD**

**Run:** [B0 Published Contract Preflight #41072313964](https://github.com/WwlWss/dsh-context-manager/actions/runs/41072313964).

**Source HEAD:** `26a6d13c22bf04c81af0cdc6e4cd180a44ec5f86`; **baseline merged main:** `5a21df1b5f27fbcc22cdb389de3c1d765b96a95d`. Both source and baseline are embedded in each fail-closed manifest and verified by the aggregator. A single oldest-built `lib` artifact was reused after per-generation package overlays; it was not rebuilt for each version.

| Job family | Version(s) | Verified result |
|---|---|---|
| Oldest-built producer | Pinned source/build artifact | **SUCCESS** |
| Published Host / Remote | `0.1.1-rc.2`, `0.1.2-rc.1`, `0.1.5-rc.1`, `0.1.5-rc.2`, `0.1.6-alpha.2` | **5/5 SUCCESS**, each H01–H13 and R01–R06, **19 assertions/lane** |
| Published Client / Renderer | `0.1.2-rc.1`, `0.1.5-rc.1`, `0.1.5-rc.2`, `0.1.6-alpha.2` | **4/4 SUCCESS**, each C01–C03, **3 assertions/lane** |
| Fail-closed aggregator | All upstream jobs plus full per-version JSON evidence | **SUCCESS**, **107 assertions / 9 lanes / 11 of 11 jobs successful; none skipped** |

The aggregator emitted `M8B_B0_FULL_PREFLIGHT_PASS`, asserting `lanes:9`, `hostLanes:5`, `clientLanes:4`, `assertions:107`, the identical `testHeadSha` in all nine manifests, exact installed published dependency versions, expected lane identities and strictly non-skipped assertions. Failure-mode tests in `tests/m8b-b0-evidence.test.mjs` independently demonstrate that incomplete/wrong-Head/duplicate/failed or skipped evidence is not accepted.

All five Host job logs now independently report:

- `constructor`, `toString`, `valueOf`, `prototype`, Unicode/tab, whitespace and empty Skill IDs: **accepted**, own field recorded literally and in typed projection.
- `__proto__`: **rejected**, `unsafe-path-key`, with no persisted mutation.
- Present **own scalar** Bindings (including own `constructor` / `toString`): **rejected** `profile-path-not-editable` under H12, no mutation/revision bump.
- Unknown stored sibling fields and unrelated Skill Bindings preserved under H03. Whole-binding Remove under H04 deletes only the selected Binding. H07–H09 invalid mode and Profile/Host CAS remain fail-closed.
- Same-mode `setSkillMode` call H05 succeeds with an observed **Settings revision delta 0** for every retained version, i.e. a native no-op. B1 should still disable submitting an unchanged mode to avoid inventing a user change; this observation is not a guarantee for untested DSH generations.

**Real Remote projection scope:** R01–R03 use actual generated Typert/Gateway against the real Host, while R04–R06 use deliberately poisoned **read-only Inspector ports** to verify omission of instruction bodies, private paths and unapproved nested fields. These two proof classes remain explicitly separate from native M5B/M5C runtime execution. **No M8B Skill Editor UI or dedicated packed Chromium Skill CRUD E2E has been qualified.**

### 13.3 Local/Draft baseline qualification and release boundaries

The unchanged ordinary Draft Quick completed **SUCCESS** on exactly the **same code HEAD** in [CI #41072313972](https://github.com/WwlWss/dsh-context-manager/actions/runs/41072313972). No Host, Remote, Client, Controller, package manifest or official `.github/workflows/ci.yml` expansion accompanies the B0 patch beyond the one inherited-key Host lookup and permanent preflight/test/evidence code.

**B0 implementation and published-compatibility acceptance: PASS at source HEAD `26a6d13c...`.** Evidence was archived in Section 13 by documentation-only commit `ffe68ae2a291393f09e3668562ae0293637e1943`; the **temporary** `.github/workflows/m8b-b0-published-preflight.yml` was deleted by cleanup commit `9e6558896cc83d8a0eb8f0d32ed31963c1d74cee`. A fresh **Draft Quick on the final cleanup HEAD** is separately mandatory. The original B0 GREEN remains bound to its exact pre-cleanup production/test code HEAD and is not a Ready 86-job Full or a run on the later documentation/workflow cleanup commit.

**Permanent Client typecheck retention:** after the temporary published workflow was removed, test-only `tsconfig.client-model-test.json` was extended in commit `d321e8be0978b11fa800513316f62f47ef60d18e` to include `tests/m8b-client-contract-preflight.ts` in every ordinary `pnpm run typecheck:client-tests` / `pnpm check`. This preserves original Profile Basis and lazy Agent read declaration checks without changing `package.json`, generated Remote declarations, publication settings or the official CI matrix. The Gateway preflight remains intentionally explicit and archived because the oldest default installation does not contain the optional published Gateway packages. A fresh Draft Quick must be run on the **final** documentation + test-wiring cleanup HEAD, not inferred from the earlier 9-lane published GREEN.

**B1 remains unimplemented.** PR #42 must remain Draft through B1 RED, later B2/B3 GREEN and independent Strict Review. No Ready/full, merge or post-merge main qualification has occurred.
