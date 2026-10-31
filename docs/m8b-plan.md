# M8B — Profile Skill Policy Editor (Capability & Implementation Contract)

**Status (2026-10-31):** **M8B Profile-local Skill Policy Editor is implemented on PR #42 (Draft/unmerged); F01-SR2, SR3 and SR4 read/nav/draft callback repairs have executable Published Renderer RED→GREEN and four-version scoped qualification.** §19 archives F01-SR2, §20 archives SR3 (25 cases), §21 archives SR4/R14 (28 cases). Historical [Ready 86-job Full #41125921741](https://github.com/WwlWss/dsh-context-manager/actions/runs/41125921741) was for old HEAD `c4de841d` **only**; latest repairs require a **new independent Final Strict Review and protected exact-head Ready 86-job Full** before merge and independent post-merge main qualification.
**Baseline:** merged M8A2 PR #41, main commit `5a21df1b5f27fbcc22cdb389de3c1d765b96a95d`; independent main Full [#41009808239](https://github.com/WwlWss/dsh-context-manager/actions/runs/41009808239), 86/86 SUCCESS, 0 failed/skipped.
**Branch:** `feat/m8b-skill-policy-editor` / PR #42, **Draft, unmerged**. Keep all earlier RED and GREEN evidence in its original exact-HEAD context. Do not mark Ready or merge until independent Final Strict Review closes and the repaired exact-HEAD Full gate is requalified.
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


## 14. B1-1 source-level executable RED test contract (design-only; 2026-10-30 CST)

**Review baseline:** PR #42 Draft `feat/m8b-skill-policy-editor` at `9d978283abf5eff440e47be466f5f77ff1c2a966`, based on unchanged merged main `5a21df1b5f27fbcc22cdb389de3c1d765b96a95d`. B0 nine-version Published Contract Preflight and the cleanup-head Draft Quick are already proven in ``12–13. **B1-1 authorizes documentation/planning only:** no production UI, new Host RPC, test-code RED, Published B1 run or Ready Full has been performed by this section.

### 14.1 Exact source seams and constraints from prior qualified work

| Existing source | Existing authority/behavior | B1 reuse or required new RED |
|---|---|---|
| `src/client/profile-editor.ts:13–75` | `DraftBase` owns `token`, captured Profile `basis`, `blocked`, `submitting`, first `terminalNotice`. `ProfileDraft` already includes M7C and M8A2 Binding kinds | Extend this **one** discriminated union with 3 Skill kinds; no Skill Store or Skill Controller |
| `src/client/presentation-store.ts:15–122` | Published actual DSH `StoreInstance.actions` resolves one live Presentation snapshot; `ownsLiveProfileDraft` checks open, pane, original draft **object identity**, not only token | Reuse existing root Store/Token/ownership; add Skill actions and preserve revocation, never a second cache |
| `presentation-store.ts:64–69` | `canBeginProfileDraft` / `canBeginResourceDraft` check pane and mutual draft occupancy, **but not `state.open`** | First independent B1 RED: a retained Begin callback invoked after close must create **zero** drafts, change no selection/token and dispatch zero RPC |
| `presentation-store.ts:374–407` | Synchronous Profile submit claim, first-block-wins, same-token late Complete denial, token-scoped Cancel vs terminal Discard | Reuse, do not reimplement per-Skill terminal state |
| `src/client/profile-view.ts:138–188` | Published snapshot / captured Profile Basis uses `instanceId + Settings revision`; original Profile reference is observed intent; invalid Profile cannot be edited | Compose existing authority check with Skill's own rendered target check; never compare Resource-only authority/cursor |
| `src/client/prompt-binding-editor.ts:33–62` | One useful pattern for comparing rendered Profile / child object identity | Reuse principle, not a copy of Prompt Resource ID validation |
| `src/client/prompt-binding-section.ts:100–246` | Actual hook-driven Begin fence, retained DSH live Store Save claim, one RPC, first-terminal receipts | Follow same caller order; explicitly cover same-frame double Save/Cancel, stale selection and unmounted old callbacks |
| `src/client/mutation-types.ts:119–129` and `mutation-controller.ts:411–412` | Original Profile Basis and **exactly two existing** Skill-related RPC methods | No new RPC, Remote v4, new mutation lane or automatic retry |
| `src/service/context-manager.ts:263–330` | `setSkillMode` writes only the mode leaf and preserves unknown Stored siblings; `removeSkillBinding` unsets whole Binding | Auto remains an explicit Stored Binding; Remove is destructive, not Auto; `__proto__` unsafe and ordinary prototype-derived keys now supported by B0 |
| `tests/client-profile-drawer-runtime.mjs` | Actual published Renderer+Slot+Business Face+Profile Controller, with write counters, external Settings changes and dropped Host reply fixtures | Extend **this real Renderer script**, not a fake standalone UI approximation |

**Critical fixture compatibility:** `ContextManagerPresentationState.open` initially equals `false`. Several historical M7C/M8A2 tests call a Begin Action on a newly `create()`d Store **without** `actions.open()` (e.g. `tests/client-profile-editor.test.ts` and `tests/client-prompt-binding-editor.test.ts`). Once the new closed-Begin gate is made GREEN, make those tests establish an explicitly open Drawer *before* legitimately Beginning a draft. Never omit the close gate merely to retain a legacy test's unrealistic precondition. Keep a separate negative test for closed Begin. Verify all nine prior Begin entrypoints and Resource pane behavior, not just Skill.

### 14.2 Frozen Skill draft discriminants and immutable observed inputs

Extend `ProfileDraft` in `profile-editor.ts` (shared DraftBase; not a new Store) with a named `SkillDraft` union:

```ts
type SkillDraft =
  | (DraftBase & {
      kind: 'skill-mode-create'
      profileId: string
      skillName: string                 // authorable, exact; may be ''
      mode: ContextManagerRemoteSkillMode
      readonly observedSkillNames: readonly string[] // frozen at Begin
    })
  | (DraftBase & {
      kind: 'skill-mode-edit'
      profileId: string
      readonly skillName: string       // immutable identity
      readonly originalMode: ContextManagerRemoteSkillMode
      mode: ContextManagerRemoteSkillMode
    })
  | (DraftBase & {
      kind: 'skill-binding-delete'
      profileId: string
      readonly skillName: string
      readonly originalMode: ContextManagerRemoteSkillMode
    })
```

**Intent evidence vs authority:** `basis = Object.freeze({instanceId, revision})` is captured **once at Begin**. `observedSkillNames = Object.freeze([...Object.keys(renderedProfile.skills)])` is immutable evidence of the list the user saw when opening Create, **not an authoritative cached Skill registry** and not a substitute for Host CAS; at Save, check with an exact set/`includes` against the author's entered name. A Create binding with `skillName === ''` is valid when absent, as proven in B0; an explicit Auto Create must issue one `setSkillMode` RPC even though the mode matches the native default.

For Edit and Delete, capture exact `profileId`, `skillName` and `originalMode` from a rendered, usable **own** Skill Binding. A field edit may mutate only `mode`; no rename and no hidden sibling modifications. The Delete confirmation must display both identities verbatim (escaped/quoted) and warn that **all** Stored extension fields within the Binding will be deleted, even though typed Remote projection intentionally omits them.

**No additional authority fields:** do not put change generation, Agent ID, Resource Authority, native SkillRegistry state, original full Profile JSON or Skill instruction bodies into these drafts. A minimal UI-visible open-session epoch may be added only after a separate stale-reopen callback RED (see `14.4); it is presentation-only, not Host authorization.

### 14.3 Exact Begin fence — two different currentness proofs

Proposed pure `src/client/skill-policy-editor.ts` seam:

```ts
isSkillBeginCurrent(
  snapshot: ContextManagerClientSnapshot,
  profileId: string,
  renderedProfile: ContextManagerRemoteProfile,
  basis: ContextManagerClientProfileMutationBasis | undefined,
  target?: {
    skillName: string
    renderedBinding: ContextManagerRemoteSkillBinding
    originalMode: ContextManagerRemoteSkillMode
  },
): boolean
```

Check in this **fixed order**:

1. Attached + compatible protocol, ready/nonstale/schema-compatible Profile surface, available/registered/writable Settings, valid matching `snapshot.instanceId === snapshot.changes.instanceId === basis.instanceId` and exact Settings revision. Reuse `isProfileBeginCurrent(snapshot,basis)` if possible.
2. `Object.hasOwn(snapshot.profiles.data.profiles, profileId)` and `snapshot.profiles.data.profiles[profileId] === renderedProfile`. Malformed Profile diagnostic rows **never** qualify, even though a Host-level local repair method exists.
3. For Edit/Delete only (`target !== undefined`, **not** `!!skillName`, because empty ID is valid), require `Object.hasOwn(renderedProfile.skills,target.skillName)` **and** `renderedProfile.skills[target.skillName] === target.renderedBinding` and equal original mode. For Create, no Skill name is known at Begin; capture the immutable observed Skill-key list, then reject duplicate names **before** Save with zero RPC.
4. Check actual live Presentation Store `open===true`, `pane==='profiles'`, no Profile or Resource draft, current selected Profile intent. A null `selectedProfileId` is valid on first opening **only** if current derived default selection is exactly the rendered Profile; do not blindly require `current.selectedProfileId === profileId` because the current Drawer displays its default row while that Store field can still be null.
5. A Resource-only `resourceAuthorityId` / resource cursor change **never** invalidates Profile Settings Basis. A Settings revision or Profile instance change invalidates the old displayed original. Same-version rehydration should be retested against the actual observed/rendered Profile object; do not either accept a mismatched original or reject all valid refreshed renders by comparing unrelated global generations.

**Important:** a stale old tab callback may retain an otherwise *still-valid* Settings snapshot while the user switches selected Profile locally. That callback must **not** silently reselect the old Profile and start a Skill draft. The live selected-Profile check is independent of the Settings revision fence. Test it separately.

### 14.4 Presentation actions, live ownership and closed-Drawer lifecycle

Proposed action surface (exact names to freeze for B1 RED; implementation remains pending):

| Action | Inputs | Allowed effects |
|---|---|---|
| `beginSkillModeCreate` | `{profileId,basis,observedSkillNames}` | One new Profile Token, frozen Basis/name snapshot, default mode Auto, exact empty initial editable name |
| `updateSkillCreateName` | `(token,string)` | Only same-token Create; no trim/normalization; never mutate original observed list |
| `beginSkillModeEdit` | `{profileId,skillName,originalMode,basis}` | One new Profile Token, originalMode and skillName fixed |
| `updateSkillMode` | `(token,ContextManagerRemoteSkillMode)` | Only same-token Create/Edit; allow only four known modes; reject while blocked/submitting |
| `beginSkillBindingDelete` | `{profileId,skillName,originalMode,basis}` | One new Profile Token; no deletion or Host RPC at Begin |
| `setSkillDraftNotice` | `(token,ProfileNotice)` | Nonterminal notice only for the current unblocked, unsubmitting Skill draft; no old result may overwrite another token |

Do **not** add Skill-specific `cancelSkillDraft`, `completeSkillDraft`, `blockSkillDraft` or another `running` state: existing Profile `cancelDraft`, `discardBlockedDraft`, `beginProfileSubmission`, `finishProfileSubmission`, `blockDraft` and `completeDraft` already express these token-owned operations. The existing first-terminal-notice priority stays shared for all M7C/M8A2/M8B Profile kinds; Resource remains independent in Host authority and presenter pane.

**Closed Begin RED:** with `open=false`, invoke all existing M7C Begin actions, all M8A2 Binding Begin actions, all three Resource Begin actions on their respective panes, and proposed Skill Begin actions. Verify no draft, no new token, no selection change and no Host RPC. The minimum GREEN should adjust both shared `canBeginProfileDraft` and `canBeginResourceDraft`, plus silent/no-terminal-clobber handling of rejected closed Begin; do not change ordinary `close()` or `toggle()` semantics. If an active draft existed before Close, it must survive Close and be available after an explicit Reopen, including its original Basis and terminal receipt.

**Old Save closure after Close→Reopen:** existing root `StoreInstance.actions` is retained across ordinary Drawer toggles, so `ownsLiveProfileDraft(current,original)` alone does not necessarily invalidate an obsolete event callback captured **before** a Close/Reopen when the *same* draft is still present. B1 RED must prove whether this exact case sends an unauthorized RPC. If reproduced, the narrowly scoped option is a monotonic **presentation-only Drawer open-session epoch**, advanced on each transition to a newly opened session. Capture it in the *rendered* callback and compare with the actual live root Store epoch at Begin/Save. New callback from reopened, still-visible draft may continue the same intended operation; older callbacks may not. Keep token and original Settings Basis unchanged. Do **not** use Host change generation or resource authority as a UI lifecycle epoch, and do not introduce a new Store instance merely to fix stale closures.

**Baseline test migrations:** first count historical tests that begin on a closed Store and add `actions.open()` only where the scenario actually intends an open Drawer. Preserve separate assertions that a Resource Begin while Profile pane is active fails and vice versa. Tests for explicit Close retaining a current draft must still PASS; make a second Close-before-Begin RED to prove the difference.

### 14.5 Save dispatch, validation and terminal-result classification

Pure `skill-policy-editor.ts` helper candidates:

- `sortedSkillBindings(profile)`: sort own `Object.entries(profile.skills)` by exact UTF-16 code-unit comparator `a < b ? -1 : a > b ? 1 : 0`, **never** localeCompare or trimming.
- `isWritableSkillPath(profileId,skillName?)`: refuse exactly `'__proto__'` at any Settings **path** position; `constructor`, `toString`, `valueOf`, `prototype`, empty, whitespace and Unicode are lawful, per B0 H10. Names are path keys; native catalog membership is *not* a creation prerequisite.
- `validateSkillCreate(draft)`: refuse unsafe Profile/Skill names and an **exact existing own** Skill name in frozen `observedSkillNames`. Empty string means a real Skill key, not “missing user input.” Reject a `Create` that would overwrite a currently configured Skill mode.
- `skillModeEditChanged(draft)`: return false for unchanged originalMode, including Auto→Auto; no RPC on no-op.
- `commitSkillDraft(draft,profileMutations)`: yield exactly one `Promise<ContextManagerClientProfileMutationResult>` or `undefined` for invalid/no-op; `skill-mode-create/edit` -> `setSkillMode(originalBasis, profileId, skillName, mode)`; `skill-binding-delete` -> `removeSkillBinding(originalBasis, profileId, skillName)`. The pure helper itself is never a bypass for the UI/Store gate.
- `blockForSkillResult` and `noticeForSkillResult`: preserve existing Profile/Binding status semantics; map `skill-binding-not-found`, `profile-not-found`, `profile-conflict`, `host-instance-conflict`, `invalid-skill-mode` and `unsafe-path-key` deliberately, preserving original returned detail.

**Mandatory caller order at Save:**

1. Current rendered draft and Profile are usable/writable and fresh; `isProfileDraftCurrent(snapshot,draft)` holds. For Create, check exact key against **captured Begin** name list; for Edit/Delete, check original target presence; for Edit require changed mode. Invalid/no-op -> 0 RPC, do not claim submission.
2. Read the **actual published** `readLivePresentationForActions(actions)`. Require `ownsLiveProfileDraft(current,originalDraft)` by original **draft object** identity, correct visible pane and selected Profile intent; if the close/reopen epoch RED proves necessary, require exact current presentation epoch. No stale closure may reuse only its old Token to claim a new draft.
3. Synchronously `beginProfileSubmission(token)` and then check the **live claimed** draft is still this exact original draft and `submitting===true`; no second Save/Cancel of the same frame may pass.
4. Dispatch **exactly one** existing Profile Mutation Controller RPC with unchanged captured Basis. Do not capture a newer Basis at Save or convert Resource-only changes into a Profile CAS conflict.
5. Interpret result by exact original Token, never by currently selected row alone:

| Result | Draft/notice rule |
|---|---|
| `applied + fresh` | `completeDraft`, success; one RPC, no second leaf write |
| `applied + degraded` | **confirmed Host applied**, block `unverified` with first `noticeSavedDegraded`; **not** Unknown; explicit Discard required |
| `unknown` / rejected promise | Block `unknown` with exact safe error detail, never auto retry |
| Business `profile-conflict` / `host-instance-conflict` | Block `conflict`; retain exact receipt and original Basis |
| Obsolete `superseded` | Never overwrite the current newer draft/notice; any old-token block/complete is refused; no auto retry |
| `detached` / `disposed` / `incompatible` / stale Basis | Fail closed with correct stale/unavailable status; no invented success |
| `skill-binding-not-found` / `profile-not-found` | No silent repair/recreate; keep stale/missing boundary with literal Host detail |
| Safe precondition busy / known recoverable denial | Preserve current token, show a token-owned nonterminal notice; no automatic re-dispatch |

**CAS accounting distinction:** When the UI sees a newly refreshed Settings revision *before Begin*, reject Begin with **zero Store draft/zero Host RPC**. When external Settings changes *after Begin and is already reflected in the Model*, Save must reject locally with **zero RPC**. But if the Host changes after Begin **without any Client visibility**, exactly **one attempted RPC may be rejected by Host CAS**; the required invariant is **zero unauthorized Stored changes and zero automatic retry**, not a false blanket “zero RPC for every conflict.”

### 14.6 B1-2 typed pure/Store RED matrix (planned, no test executed yet)

Add `tests/client-skill-policy-editor.test.ts` to `tsconfig.client-model-test.json` and `tsdown.client-model-test.config.ts`, and its compiled `.artifacts/client-model-tests/client-skill-policy-editor.test.mjs` to existing `package.json` `test:client-model` **without removing any old entry**.

| RED ID | Scenario | Required observable assertion |
|---|---|---|
| `B1-S01` | Four modes and Auto vs absence vs Remove | Explicit Auto creation has one set RPC, no automatic deletion; unchanged edit zero RPC |
| `B1-S02` | Exact Skill keys `'', ' ', Unicode, constructor, toString, valueOf, prototype` | Exact own-key read and code-unit sort; `__proto__` blocked; no trim |
| `B1-S03` | Create with existing exact key | Duplicate refused with zero RPC; the existing mode/Stored sibling data unchanged |
| `B1-S04` | Edit/Delete original target | Immutable originalMode/skillName; Edit changes only one mode leaf; Delete requires explicit confirm |
| `B1-S05` | Real one Profile Draft slot across M7C/M8A2/Skill and M8A1 Resource | Forbidden Begin cannot create a second draft or change pane/selection |
| `B1-S06` | Token identity and old Input/Cancel/Discard | Old token cannot mutate/clear newer Skill draft; same token successive valid inputs permitted |
| `B1-S07` | Same-render double Save and Save→Cancel | One synchronous claim; at most one RPC; Cancel cannot erase in-flight draft |
| `B1-S08` | Close before any Begin, old callbacks across pane and Reopen | Zero new drafts/tokens/Host RPC while closed; Close of an *existing* draft preserves it |
| `B1-S09` | Obsolete callbacks after root Store remount/teardown | Revoked old action identity produces zero RPC |
| `B1-B01` | Old rendered Profile vs fresh Settings Basis | Begin rejected for stale revision/instance even if target Skill ID is same |
| `B1-B02` | Old rendered Skill ref vs fresh target; binding missing/invalid | Edit/Delete rejected; no synthetic repair |
| `B1-B03` | Resource-only authority/generation rotation | Does **not** invalidate Profile Begin/Save while Settings Basis remains valid |
| `B1-B04` | User changed selected Profile but Settings revision unchanged | Old Skill Begin cannot reselect wrong Profile or create a draft |
| `B1-B05` | Unavailable/read-only/error/stale Profiles and invalid diagnostic row | Readable if cached, but no Skill mutation/draft/RPC |
| `B1-T01` | Unknown, Conflict, Applied+Degraded | Distinct blocked states and exact first terminal receipt retained |
| `B1-T02` | Late Complete, repeated Block, tab/profile switch, refresh warning | Cannot erase/change a blocked Skill token or its first notice |
| `B1-T03` | Wrong-token Discard, no-token notice, stale result | No mutation of active token; only explicit matching Discard releases it |
| `B1-T04` | Host CAS conflict after unseen external writer | At most one attempted RPC and zero unauthorized Stored mutation/retry |

For typed tests, use `createContextManagerPresentationStore().create()` and its **real** actions/root `getSnapshot()`; instantiate real `ContextManagerClientProfileMutations` spies for exact call argument and count assertions. Retain actual existing Profile and Resource tests as independent controls, never replace them with a mock Store.

**Executable RED criterion:** a file-not-found import, TypeScript error, absent React section or undefined function is **not a sufficient B1 behavioral RED**. First, add one standalone executable RED against the **currently present** closed-Drawer Begin vulnerability, which should fail on an observable illicit draft/token transition. Then introduce the minimal typed new Skill kind/action signatures and **inert/no-op scaffolding only as needed** to let dedicated tests compile; assert the real Store fails a concrete state-transition, exact-identity or RPC-count expectation. Separate intentional REDs from unrelated compilation/fixture failures. Do not mistake test scaffolding for Skill Editor GREEN or count a test-only synthetic adapter as production behavior.

### 14.7 B1-3 real published Renderer RED matrix (planned)

Extend the existing `tests/client-profile-drawer-runtime.mjs` *after* its established M7C/M8A1/M8A2 controls and keep all historical assertions. Use real published `@deepseek-ai/dsh-client-ui-renderer`, the existing `lib/client.js` bundle, actual `StoreInstance.actions` and the existing `createWritableRemoteFixture` CAS/write counters; add exactly two test-only Remote Profile calls `setSkillMode` and `removeSkillBinding` and deterministic fixture methods for external Skill mutation/revision, dropped write reply and optional deferred write resolution. Do not claim that a fake Renderer alone proves Stored sibling preservation: **B0 H03 already proves that in real Settings**.

| RED ID | Actual user path | Proof |
|---|---|---|
| `B1-R01` | Selected usable Profile displays Skill section and deterministic own-key rows | Exact configured modes, no fabricated complete native inventory or Agent-effective verdict |
| `B1-R02` | New Skill `''`/Unicode/constructor with explicit Auto | One existing Profile `setSkillMode` RPC with original Basis; no hidden resource/Agent requests |
| `B1-R03` | Edit Manual→Pinned, then same-mode Save | First is one setter RPC; second is zero RPC |
| `B1-R04` | Remove with exact quoted Profile/Skill and destructive warning | No call before confirmation; one `removeSkillBinding` on explicit Confirm |
| `B1-R05` | Hold old Edit/Create/Delete callback; external Settings revision or Host rotation before Begin | Zero draft/zero RPC; old rendered original never paired with new Basis |
| `B1-R06` | Begin valid; external revision before Save, with vs without Client refresh | Visible change -> zero RPC; invisible change -> one CAS-rejected attempt, no write/retry |
| `B1-R07` | Old Save after Cancel, another Profile draft, Resource draft, tab/selection change or root teardown | Zero unauthorized RPC; no second draft or notice overwrite |
| `B1-R08` | Same-render duplicate Save, Save+Cancel, lost Host reply after write | At most one RPC, retained Unknown and exact original receipt until explicit Discard |
| `B1-R09` | Applied+Degraded read-back, or conflict, then late refresh and stale completion | Confirmed-degraded is not Unknown; first token-owned notice is never clobbered |
| `B1-R10` | Close with an active Skill draft; re-open and operate through a **new** visible handler; call **old** retained handlers | Draft preserved, new handler works, closed/obsolete callback cannot mutate, rebase or double-submit |

**Instrumentation:** use `tree.root.findByProps({ 'data-context-manager-skill-*': ... })` or other explicit `data-` hooks that do not depend on English locale or translated button ordering. Capture actual `onClick`/`onSubmit` functions **before** changing state; invoke stale callbacks in the same `act()` turn before rerender to test the genuine React batching race. Assert actual `remoteFixture.writes.length` and recorded wire Basis/Skill mode, plus `registeredOverlayStore.readLiveSnapshot()` and actual Remote Profile projection after rehydration. Keep the unchanged Published Slot identity/teardown test.

**Renderer RED honesty:** adding only a test that fails because the Skill section is absent is a superficial mount RED, **not** evidence for R02–R10. The B1 staging must ensure later tests reach their targeted interaction boundaries with minimally available/inert typed UI seams before claiming each regression is independently reproduced. B2 must not silently omit deeper tests once the first RED is satisfied.

### 14.8 B1-1 → B1-2 → B1-3 qualification and code-change gates

1. **B1-1 (this commit): documentation only.** Review and freeze exact draft discriminants, Begin fences, live Store selection, optional session epoch, Save outcome table and RED case IDs; keep PR #42 Draft and all B0 evidence intact. A successful Draft Quick from a documentation-only change is **not** a B1 RED.
2. **B1-2a: standalone inherited closed-Begin RED** written against existing production Store *before* changing its `open` gate. It must be executable and fail with a concrete new-draft/token transition; record CI run and exact HEAD. Then add the minimal common open check and migrate old tests' unrealistic closed-Draft setup, preserving new closed/no-op negatives and valid re-opened draft positives.
3. **B1-2b: typed Skill state-machine RED**: add test suite and typed inert interfaces to compile, plus immutable capture and Result classification test fixtures. Require failure of concrete Store transitions and one-RPC contract rather than missing module/TS declarations. The intended B2 GREEN is a subsequent, separately reviewed implementation. The existing M7C/M8A1/M8A2 tests must not be deleted or excluded.
4. **B1-3: real Published Renderer RED**, with new fixture methods and observable Skill UI event paths. If only DOM absence fails first, record as *mount RED* then expose typed/inert UI entrypoints to reach actual race/RPC assertions; archive independently meaningful failures without weakening negative safety checks.
5. **B1 exit and B2 entry:** source/tests wired to `pnpm run typecheck:client-tests`, `tsdown.client-model-test.config.ts` and `pnpm test`; actual targeted RED failures are traceable to missing Skill behavior, with prior unrelated checks stable; strict independent review of the RED assertions and compatibility (published React at least one old generation) done. PR stays Draft. **Only then** authorize B2 GREEN implementation; later four-version Renderer/Client and unchanged 86-job Ready Full remain separate gates.

**Forbidden shortcuts:** no unused Skill RPC wrappers or secondary Store to make tests green, no per-Save Basis recapture, no global change cursor as Skill authority, no ID trimming or overblocking `constructor`, no fake native Skill catalog/Agent selection, no copy of Agent full SkillDefinition into UI, no disabling of existing tests/official CI, and no assertion that B1-1 design documentation is already executable RED.

### 14.9 Source-level review disposition / handoff

The B1-1 plan is **ready for targeted implementation review**, with the following decisions frozen: three Skill kinds in the existing `ProfileDraft`; Profile-only original `instanceId+revision` and own-key target evidence; one existing setter or remove RPC per confirmed Save; Profile/Resource pane exclusivity; fail-closed closed Begin; exact-token first result; separate visible-selection currentness; no second controller/store. The potential **close/reopen stale handler** requires its own RED to choose whether a monotonic presentation-only epoch is necessary. All test IDs above are **planned**, not executed, and B1-2/B1-3 remain pending.


## 15. B1-2a closed-Drawer stale Begin — executed behavioral RED→GREEN (2026-10-31 CST)

### 15.1 Independent RED: nine actual Presentation Store actions

**RED source HEAD:** `d5b5ea5b5bc94c8f6cc21108a7ded34518ab54a9`.
**Run:** [CI `#41092543407`](https://github.com/WwlWss/dsh-context-manager/actions/runs/41092543407) **FAILED as intended**, with strictly compiled TS and built executable Client tests: **156 tests, 147 PASS, 9 FAILED**. All nine failures were new assertions over **real** `createContextManagerPresentationStore().create()` actions, not missing files, mocks, TypeScript/import failures or missing Skill UI.

The nine distinct failures cover every existing Begin family:
- **M7C Profile**: `beginCreate`, `beginFieldEdit`, `beginDelete`;
- **M8A2 PromptBinding**: `beginPromptBindingCreate`, `beginPromptBindingFieldEdit`, `beginPromptBindingDelete`;
- **M8A1 Resource**: `beginResourceCreate`, `beginResourceEdit`, `beginResourceDelete`.

Each test opens the real Presentation Store, captures a stale Begin callback, closes the Drawer, invokes the retained callback and expects **both drafts null, zero token consumption, unchanged pane/selection and no phantom warning**. On original code, `open=false` was ignored by `canBeginProfileDraft`/`canBeginResourceDraft` and the test observed a non-null hidden draft. The independent positive control verifies that **an already active Profile or Resource draft, original Token and first terminal receipt survive Close→Reopen**, and that fresh authorized Begin remains available after explicit Discard.

### 15.2 Minimal production repair and controlled old-fixture migration

At `src/client/presentation-store.ts:59–76`, only four local guards changed:
1. `canBeginProfileDraft` now requires `state.open` in addition to pane and mutual draft absence.
2. `canBeginResourceDraft` now requires `state.open` with the previous pane/slot conditions.
3. `notifyOccupiedProfileDraft` returns without writing a misleading `noticeDraftActive` while the Drawer is closed, and continues to respect the first terminal notice.
4. `notifyOccupiedResourceDraft` likewise returns silently while closed, retaining the existing Resource blocked notice protection.

This does **not** change `close()` or `toggle()`, clear any in-flight/terminal draft, recapture Profile Basis or Resource Stamp, introduce a new Store or modify Host/Remote/Controllers/DSH Slot ABI. The shared Profile and Resource live Save owners already require `open=true`, so the new change is strictly **Begin** authorization and closed-only notice behavior.

A controlled migration adds `actions.open()` to **9 historical tests** whose positive Begin scenario had used a newly initialized (`open=false`) Store: 1 M7C Profile, 6 M8A2 Binding, 2 M8A1 Resource. One intermediate run [`#41092832943`](https://github.com/WwlWss/dsh-context-manager/actions/runs/41092832943) uncovered a test-only migration typo: the second Resource fixture used variable `s`, so a naive insertion into the next test's `store` left `s` closed. That run had **155 PASS, 1 FAILED**; the fixture was corrected by adding `s.actions.open()` to the exact test and removing the misplaced redundant line. **No production change** was required for this intermediate failure.

**First complete Store GREEN:** [CI `#41093082725`](https://github.com/WwlWss/dsh-context-manager/actions/runs/41093082725) at `893a8bc1184fba0f6e73fe6d17fc92b6eb652a57`: Client **156/156 PASS**, Node **268/268 PASS**, Slot **1/1 PASS**; the ordinary Draft Quick completed SUCCESS.

### 15.3 Additional actual published Renderer race control

After Store GREEN, `tests/client-profile-drawer-runtime.mjs` gained a focused **real published DSH Renderer** test using actual `lib/client.js`, `@deepseek-ai/dsh-client-ui-renderer`, `StoreInstance.actions` and `react-test-renderer`. The test captures enabled Profile Create, PromptBinding Create and Resource Create `onClick` callbacks from the mounted, open Drawer, then closes the Drawer and invokes each **in the same React `act()` batch before stale mounted callbacks have rerendered**. It independently asserts:

- `open=false`, `draft=null` and `resourceDraft=null` after retained callbacks;
- neither Profile nor Resource draft Token increments;
- no phantom Profile/Resource notice remains to be displayed at the next Reopen;
- both Profile and Resource **actual fixture RPC write counters remain unchanged**;
- a new Open returns a usable Drawer, and switching Resources→Profiles remains functional.

**Published Renderer GREEN:** [CI `#41093422442`](https://github.com/WwlWss/dsh-context-manager/actions/runs/41093422442) at exact **code HEAD** `242758a9038921011eaa53e6ca73db085e7f068e`. The standard Draft Quick's actual verify job is **SUCCESS**, with **156/156 Client, 268/268 Node, 1/1 Slot**. The remaining 21 Ready-only jobs were intentionally **skipped** under the normal Draft gating; these must **not** be counted as an unchanged 86-job Ready Full or falsely described as 22/22 executed. The real published Renderer test is **not** a dedicated packed Chromium browser E2E.

### 15.4 Verified scope and next gate

[Commit comparison `d5b5ea5…242758a9`](https://github.com/WwlWss/dsh-context-manager/compare/d5b5ea5b5bc94c8f6cc21108a7ded34518ab54a9...242758a9038921011eaa53e6ca73db085e7f068e) contains exactly five changed files: one Production Presentation Store with **four guard adjustments**, three historical test files, and the real Published Renderer regression. No Skill editor implementation, new Agent diagnostics, Host RPC shape, Remote v4, package dependencies or official CI job matrix was touched by B1-2a.

**B1-2a behavioral exit: PASS at exact `242758a9…` code HEAD.** A subsequent documentation-only closeout commit must independently pass Draft Quick on its own Head. PR #42 remains Draft; B1-2b typed Skill Draft/Store behavioral RED and B1-3 full Skill Editor Renderer RED have **not** begun. Specifically, an **obsolete React Save callback captured before Close→Reopen against the same preserved draft** is a separate B1-2b/B1-3 lifecycle case from the *closed-time Begin* hole solved here; no session epoch was added or claimed effective by B1-2a.

## 16. B1-2b Skill Draft typed behavioral RED — executed (2026-10-31 CST)

**Status: RED REPRODUCED; NOT GREEN.** PR #42 remains Draft. This section records
the *test-only* B1-2b boundary on exact behavior-test HEAD
`5753fdddd0b08e210e32ad6099123486850790cf`, based on unchanged
B1-2a final `a768f2cd533a7e5f4b43eefa3d2bfa6ddedf6cc0`.

### 16.1 Exact executed RED evidence

- [Draft Quick CI #41109486995](https://github.com/WwlWss/dsh-context-manager/actions/runs/41109486995):
  `verify` FAILED *intentionally*, after TypeScript typecheck and executable
  test bundling succeeded. **156 existing Client assertions PASS, 23 newly
  introduced Skill Draft behavioral assertions FAIL, 0 skips** in that Client
  model test phase. These failures are actual assertion mismatches (e.g. no
  actual Skill draft after an inert Begin, unimplemented Skill result/dispatch
  logic), **not** missing imports, undefined functions, or TypeScript failure.
  Full Node/Slot phase was not reached because `pnpm check` stops on RED.
- [Draft-only genuine Published Renderer RED #41109487074](https://github.com/WwlWss/dsh-context-manager/actions/runs/41109487074):
  one pinned-oldest artifact build PASS. Both independent retained real
  `@deepseek-ai/dsh-client-ui-renderer` versions **0.1.2-rc.1** and
  **0.1.6-alpha.2** reached the new Close→Reopen obsolete Save assertion
  and FAILED for the same observable reason: the old pre-Close callback
  actually submitted an extra Profile RPC (**actual write count 20,
  expected 19**). Strict retained declaration check and earlier Renderer
  controls completed before this RED assertion. This independently proves a
  previously unqualified session-lifecycle hole using existing M7C UI,
  without pretending the not-yet-implemented Skill UI is mounted.
- An earlier test-only `8ec299b50cefb59238b0e3106e8ea9f5d05ae8ca`
  had the Renderer assertion but only ordinary Draft Quick
  [#41108457821](https://github.com/WwlWss/dsh-context-manager/actions/runs/41108457821)
  SUCCESS; **that run did not execute the Ready-only published Renderer
  job and is not a valid Renderer RED**. The dedicated published run above
  is the correct qualifying evidence.

### 16.2 Changed source and intentional inert seam

New `tests/client-skill-policy-editor.test.ts` is included in strict
`tsconfig.client-model-test.json`, `tsdown.client-model-test.config.ts`,
and `package.json` `test:client-model`, without removing old test entries.
It exercises the **real** `createContextManagerPresentationStore().create()`
root Store for the 3 Skill Draft kinds and shares the existing Profile
Draft Token/occupied-pane/terminal operations; typed helper tests cover
exact UTF-16 Skill keys, `__proto__` denial, immutable captured Basis,
original identity, four modes, single existing RPC and receipt classification.

`src/client/profile-editor.ts` adds the 3 SkillDraft discriminants to the
existing union only; `src/client/presentation-store.ts` adds explicitly
inert typed Skill actions; `src/client/skill-policy-editor.ts` is a
deliberately inert typed helper seam. **These are not a Skill Editor,
not Skill mutation GREEN, not Host changes and not new Remote API.**
The existing Profile/Binding/Resource production behavior stays unchanged.

`.github/workflows/m8b-b12b-renderer-red.yml` is a **temporary Draft-only**
two-version Published Renderer RED probe, independent of the official
unchanged Ready Full matrix. It should be removed after later immutable
published GREEN artifacts and evidence are archived. Its failure is expected
at this exact RED HEAD and must never be called a passing regression.

### 16.3 Independent old Save hole and B2 exit constraints

At the existing `profile-drawer.ts` Save callback, the live Store check
requires `open=true`, same pane and original *draft object identity*.
After Close→Reopen, the original draft object survives, and
`presentation-store.ts` does not differentiate render/open sessions.
Therefore an obsolete pre-Close React Save closure can re-enter the
same retained draft and issue a Profile write. The two genuine Published
Renderer RED jobs above reproduce this without changes to Host/Remote/CAS.

B2 may consider a monotonic **presentation-only** open-session epoch, advanced
only on transition to a newly opened Drawer session. The callback must
capture epoch from its original render; Save must check this against the
actual live root Store, while allowing a freshly rendered handler in the
reopened session to operate on the unchanged authorized draft. Preserve
original Settings Basis and Token, keep same-frame single claim, never
misuse Resource Authority/Host generation as Drawer epoch.

**Next required gate:** independently review each executable RED for test
rigor, especially downstream assertions masked behind earlier inert
Skill-Begin failures. Stage a later independently reviewed B2 GREEN
implementation; run targeted Client + real Published Renderer tests, and
later four-version compatibility plus exact-head 86-job Ready Full.
Do not mark PR Ready, merge, or claim B1-3 Skill UI RED based only on the
present M7C old-Save proof.

## 17. F01-SR1 — Close→Reopen retained React callbacks: independent RED→GREEN (2026-10-31 CST)

**Scope:** a narrow, already-reproduced Presentation UI authorization hole
identified during M8B B1-2b. The old M7C Profile Save closure remained valid
after the Drawer was closed and reopened with its *same* draft object. F01-SR1
is the local tracking name for this scoped repair, **not** B2 Skill Editor
GREEN. The 23 deliberately inert Skill Editor tests remain RED, and the
official Full remains gated by PR Draft status.

### 17.1 Exact RED provenance (test-only)

- **Dedicated Store RED HEAD:** `5af6ac9632422bc6f62052ce8091da0f652f6b7e`.
  New `tests/client-profile-editor.test.ts` checks one monotonic
  `openSessionEpoch`: initially 0, +1 only for closed→open,
  never for duplicate `open()`, close or open→close `toggle()`, while
  preserving the active original draft, Token and Basis.
- [Draft Quick RED #41110131474](https://github.com/WwlWss/dsh-context-manager/actions/runs/41110131474):
  strict TypeScript and executable test bundling succeeded;
  **156 existing Client PASS, 1 new F01-SR1 Store assertion FAIL**
  (observed `undefined !== 0`, rather than a missing import or TS error),
  and the unchanged **23 intentional B1-2b Skill assertions FAIL**.
  The Node/Slot stage was not reached by `pnpm check` on this test-only RED.
- [Actual Published Renderer RED #41110131320](https://github.com/WwlWss/dsh-context-manager/actions/runs/41110131320):
  actual DSH React Renderer `0.1.2-rc.1` and `0.1.6-alpha.2`
  both reached the old pre-Close Save callback, with a real live
  `StoreInstance.actions` and RPC counter, and failed exactly because
  an unauthorized Profile RPC was submitted across Close→Reopen. The
  previously archived [#41109487074](https://github.com/WwlWss/dsh-context-manager/actions/runs/41109487074)
  already demonstrated **actual 20, expected 19** on the earlier Skill RED
  HEAD `5753fddd...`.

### 17.2 Production fix — four Client-only files, no B2 Skill behavior

- **Production fix HEAD:** `6132d8792a81a5e17a2e5f8e460e51b00ad2248e`.
  `src/client/presentation-store.ts` now stores a **presentation-only**
  integer `openSessionEpoch`, initialized to zero, incremented only on
  a real closed→open transition through either `open` or `toggle`.
  `close` never discards a draft or its Token/Basis/terminal receipt.
  The helper `isLiveDrawerOpenSession` checks the captured render
  epoch against the **actual live DSH root Store** and `open=true`.
- `src/client/profile-drawer.ts` fences retained Profile Create/Edit/Delete
  Begin callbacks, all Profile Save callbacks and immediate default-profile
  mutation callbacks. `src/client/prompt-binding-section.ts` fences
  Binding Begin/Save, and `src/client/resource-drawer.ts` fences
  Resource Begin/Save, all against the epoch captured by that React render.
  These checks *supplement*, never replace, existing original draft **object
  identity**, Token, pane/selection, Profile Settings Basis, Resource Stamp,
  synchronous submission claim, Host CAS and first terminal receipt.
- Existing Profile, PromptBinding and Resource drafts remain available after
  Reopen **through newly rendered callbacks**; old pre-Close callbacks have
  no authorization to start an invisible or obsolete draft, issue an RPC,
  or reselect an old Profile. No Resource Authority, Profile revision or
  Host change generation is repurposed as a UI session clock.
- No Host, Remote v3, Resource/Profile Controller, published Slot ABI,
  new Skill Editor, Skill source or runtime semantics changed.

### 17.3 Exact scoped GREEN qualification

- Initial minimal-fix [Published Renderer GREEN #41110562669](https://github.com/WwlWss/dsh-context-manager/actions/runs/41110562669):
  original two real published Renderer generations **2/2 SUCCESS** on
  exact production code HEAD `6132d879...`. This was not the official
  86-job Full or the standalone Draft Quick.
- **Expanded exact-code HEAD**
  `152ee54851f0fbcc1598bb52972219c55c103824`:
  [scoped Published + Store CI #41110710641](https://github.com/WwlWss/dsh-context-manager/actions/runs/41110710641)
  **SUCCESS**. A single pinned-oldest artifact was built; **all four**
  retained actual React Renderer generations `0.1.2-rc.1`,
  `0.1.5-rc.1`, `0.1.5-rc.2`, `0.1.6-alpha.2` passed.
  Dedicated Client Model/Presentation controls **52/52 PASS**,
  legacy Host/Node **268/268 PASS**, and Client Slot runtime verification
  **PASS**. Strict Client test tsc, generated Client test bundling and
  selected published Renderer declaration checks passed.
- The expanded real Renderer regression now holds old callbacks across
  Close→Reopen for **M7C Profile Save/Begin/default toggle**, **M8A2
  PromptBinding Save/Begin**, and **M8A1 Resource Save/Begin**.
  For the three draft lanes, an old Save dispatches **zero RPC**, the
  old Token/Basis/Resource Stamp survives, and a new callback saves
  **exactly once**. Old Begin/default callbacks cannot change draft
  occupancy, consume a Token or issue a write.
- [Ordinary Draft Quick #41110710650](https://github.com/WwlWss/dsh-context-manager/actions/runs/41110710650)
  is still **FAILED AS EXPECTED** on this same code HEAD: TypeScript
  passes, F01-SR1 unit assertions pass, and Client results are
  **158/181 PASS, 23 intentional Skill behavioral RED**. Its later
  Host/Slot stages do not run because `pnpm check` stops there;
  the separate scoped green job supplies actual Host/Node/Slot evidence.
  **Do not portray a scoped GREEN as an all-green Draft Quick.**

### 17.4 Explicit exit / remaining work

**F01-SR1 scoped RED→GREEN: PASS** at `152ee548...`.
The `.github/workflows/m8b-b12b-renderer-red.yml` workflow remains a
**temporary Draft-only scoped qualification** fixture, not an official
Ready/86-job Full replacement. Preserve its immutable CI proof through B1/B2
before removal. A subsequent **documentation-only** closeout HEAD cannot
claim its own code-run qualification without a separate workflow run.

**Remaining:** independent RED test-depth Strict Review, targeted B1-2b
Skill state-machine implementation when its B2 gate is authorized,
B1-3 actual Skill Renderer interaction RED, complete B2/B3 Skill Editor
GREEN, full retained compatibility, independent exact-head Final Strict
Review, Ready 86-job Full, and a distinct post-merge main Full. Do not
merge PR #42 or turn Draft into Ready as part of this F01 repair.

## 18. B1-2b independent test-depth review and B1-3 true Published Renderer RED

**Execution and limitations:** see the detailed
[B1-2b test-depth SR1 and B1-3 evidence ledger](m8b-b1-test-depth-review.md).
The design-only §14 matrix is historical; this section is the new executed
status. Neither the test-only inert Skill Store nor the read-only Skill UI
entrypoint is a production Skill editor. PR #42 stays Draft.

### 18.1 B1-2b Strict Review / hardened RED

- Exact tests-only HEAD `a9929dc35c941a7d38de45dd9cab4d86967567e7`;
  [Draft Quick #41112699712](https://github.com/WwlWss/dsh-context-manager/actions/runs/41112699712):
  strict TypeScript and bundled executable tests PASS; **187 Client,
  159 PASS / 28 intentionally RED**. The inherited tests and F01
  protections stay GREEN.
- Scope: remove vacuous early-return guards by narrowing the actual Skill
  draft discriminant; mutate **unfrozen caller Basis and observed Skill-key
  array after Begin** to demand defensive immutable copies; split out
  independent own/inherited-path, duplicate/no-RPC, exact RPC Basis,
  occupied real Resource draft, and Skill business-outcome helper probes.
- Important outstanding depth: Begin-inert Store tests still do not
  independently exercise late Token/claim/Host receipt branches.
  The typed `Pick<...>` helper spy does **not** prove actual Host CAS.
  No test deletion or runtime mode substitution was used to hide RED.

### 18.2 B1-3 real published Renderer stage 1: mounted section RED

- Exact test-only HEAD `ac4f84b04bd81f12c599d61bbf6bde9c663e5ad0`;
  [real published Renderer #41112996036](https://github.com/WwlWss/dsh-context-manager/actions/runs/41112996036):
  **two independent versions** `0.1.2-rc.1` and `0.1.6-alpha.2`
  fail R01 with expected one actual Profile Skill section, observed zero.
  Their fixture uses actual `lib/client.js`, real DSH React Renderer,
  actual root Store + Controller + Remote; the only new Remote fixture
  calls are the two **existing** `setSkillMode` and
  `removeSkillBinding` RPC signatures. Four old F01 Renderer jobs and
  targeted Store/Node/Slot remained SUCCESS.
- This is **R01 DOM-mount RED only**, not false evidence for R02–R10.

### 18.3 B1-3 real published Renderer stage 2: independent Begin RED

- Exact code HEAD `59c775343f3208f0fab6e5c5f63691aa43194fe1`;
  [actual Renderer per-case CI #41113521571](https://github.com/WwlWss/dsh-context-manager/actions/runs/41113521571):
  `R01` PASS on **both** published versions with five exact configured
  own-key Skill rows (including Unicode and read-only unsafe
  `__proto__`), sorted by code unit, with four explicit configured modes
  and no native/Agent inventory invention.
- Independently failing actual React callback jobs on both versions:
  `R02` **Create Begin** expected `skill-mode-create`, actual null;
  `R03` **Edit Begin** expected `skill-mode-edit`, actual null;
  `R04` **Remove Begin** expected `skill-binding-delete`, actual
  null; `R05` an old callback after external Settings revision
  produces no draft/write, but a **new** rendered Edit cannot Begin
  either. This R05 positive path is RED; the negative path does **not**
  independently qualify stale protection while Begin is inert.
- Existing four `F01-SR1` published Renderer jobs SUCCESS, targeted
  **52/52 Client, 268/268 Node and Client Slot SUCCESS**.
  [Draft Quick #41113521656](https://github.com/WwlWss/dsh-context-manager/actions/runs/41113521656)
  is **intentionally FAILED** on unchanged 28 Skill Client behavior RED
  (159/187 PASS); this is not an overall or Ready Full GREEN.
- `src/client/skill-policy-section.ts` is an **inert, visibly disclosed
  B1-3 read-only/Begin interaction seam**. Its three Begin buttons call
  the intentionally inert typed Store actions; there are no Skill
  edit/create/delete forms, Save RPC calls, Host changes, second Store,
  or auto catalog/diagnostics. Replace this seam during a later,
  separately qualified B2 production implementation.

### 18.4 B1-3 exit remains OPEN

R02–R04 are independently verified **Begin** REDs only; their later
empty/Unicode ID, Save, and one-RPC checks have not executed.
R05 is a qualified **fresh Begin** frontier RED, not a stale callback
security GREEN. `R06`, `R07`, `R08`, `R09`, `R10` remain
**not independently exercised**, because the actual Skill Store Begin,
forms and Save still do not exist. Do **not** claim these races are proven,
or change the frozen B2 gate by calling an inert early failure a complete
Skill Renderer RED.

The next narrowly authorized work is to deepen the independent
R06–R10 test harness, review the staged probes and prepare an explicit,
separate B2 entry proposal. Any eventual minimal Skill Draft Begin
implementation needs separate authorization and must immediately expose
new **independent Save/CAS/outcome RED** before the next GREEN step.
**B2 implementation is NOT authorized by this B1-3 RED closeout**;
never enable production merge or Ready Full in the meantime.

## 19. F01-SR2 Final Strict Review repair — Fix 0 → A → B → C → D

**Scope.** An independent Final Strict Review on exact old
`c4de841dc8db6a30975ac8bd651af658a341250a` found:
F1/P1 old Cancel/Discard events could delete the retained cross-open-session
Profile or Resource draft and its first terminal receipt; F2/P2 old text/
mode events could edit that same retained Token; F3/P1 the protected Full
never entered `M8B_SKILL_PROBE` cases despite a historical 86/86 PASS;
F4/P3 source comments/README/roadmap were left in the old inert-editor phase.
No Host, Remote v3, Controller, CAS, native Skill registry or second Store
was introduced in this repair.

### 19.1 Fix 0: keep original qualification immutable

- PR #42 was converted from Ready back to **Draft** at old HEAD
  `c4de841dc8db6a30975ac8bd651af658a341250a`.
- Original [Ready 86/86 Full #41125921741](https://github.com/WwlWss/dsh-context-manager/actions/runs/41125921741)
  **really passed**, 0 skipped/failed. It qualifies **only that exact
  original HEAD**, not any of the repairs below.

### 19.2 Fix A: real old-event behavioral RED before production fix

- **Test-only HEAD** `df64cb7fc511248394e686df9a38ab296bc2a7b8`.
- [Actual Published Renderer RED #41136015042](https://github.com/WwlWss/dsh-context-manager/actions/runs/41136015042):
  **18/18 deliberate failures** in two real DSH Renderer generations,
  each at the intended observable old-callback-state assertion, while the
  **five legacy F01-SR1 / Store / Node / Slot controls passed**.
- Nine independent probes: R11P (old Profile Cancel), R11B (Binding
  Cancel), R11R (Resource Cancel), R11T (Unknown Skill Discard),
  R11TR (Unknown Resource Discard), R12S (Skill name and mode input,
  including a closed Drawer), R12P (Profile input), R12B (Binding input),
  R12R (Resource input). Every negative event includes preserved original
  draft/Token/receipt and a fresh current-session positive control.
- No production code changed in the RED commit.

### 19.3 Fix B: one shared user-event authorization fence

- **Production implementation HEAD**
  `63a19378a10e2a2abcbb133e2e6b69d5537eb0a1`.
  `presentation-store.ts` adds
  `mayApplyCurrentDraftEvent(actions, renderedOpenSessionEpoch, pane, token)`:
  check the exact live root DSH Store via registered actions identity,
  `open=true`, the captured original Drawer epoch, pane, and the
  retained draft Token. No new state/authority, hidden Store or
  regenerated Basis/Token.
- `profile-drawer.ts`, `prompt-binding-section.ts`,
  `resource-drawer.ts`, `skill-policy-section.ts` apply this
  **only to user-initiated** inputs, Cancel/Discard, description removal
  and analogous editing actions. Existing Begin/Save fences remain.
  **In-flight Host result callbacks deliberately do NOT use the Drawer
  epoch**; they continue to honor original Token, Controller outcome and
  first-terminal receipt across Close/Reopen.
- A test-only postcondition correction at
  `3ba9017f152a846810ab852a96c84c904922285e` recognizes that
  R11TR intentionally issues **one Resource RPC** to obtain a genuine
  Unknown result; every actual Skill probe still requires **zero Resource
  RPCs**. No old/new Discard negative/positive assertion was weakened.
- [Exact-head Fix B scoped GREEN #41136626407](https://github.com/WwlWss/dsh-context-manager/actions/runs/41136626407):
  **48/48 SUCCESS**, including **18/18 new F01-SR2** and
  **5/5 legacy F01-SR1** tasks; the remaining old Skill probes are
  also green. [Draft Quick #41136626409](https://github.com/WwlWss/dsh-context-manager/actions/runs/41136626409)
  SUCCESS.

### 19.4 Fix C: independently failing structural Full gate, then four-version GREEN

- **Structural audit RED** HEAD `23bded852b5dd7ca9f566213db1130e41d743a9c`.
  [Draft Quick RED #41136972133](https://github.com/WwlWss/dsh-context-manager/actions/runs/41136972133):
  **187/187 Client PASS** and **270/271 Node PASS**; the sole Node
  failure explicitly proved that `client-presentation-contract` ran
  only the historical default Drawer path and omitted M8B Skill probes.
  It was an executable assertion mismatch, not TypeScript or missing files.
- **Official CI gate code HEAD** `a5e376c0dc09fb2e194380b25555dee0235ea2e4`.
  The single canonical `tests/m8b/run-skill-renderer-probes.mjs` runs
  **21 independent case processes** (R01–R10 with R06V/H, R08U, and
  R11/R12) using actual DSH published Renderer and fresh Model/Store,
  prints per-case result and exits nonzero for any failure.
  `.github/workflows/ci.yml` now invokes this runner **inside each
  existing `client-presentation-contract` matrix Job**, after
  retaining the historical Profile Drawer invocation. The four versions
  remain `0.1.2-rc.1`, `0.1.5-rc.1`, `0.1.5-rc.2`,
  `0.1.6-alpha.2`. The original **21-group full-qualification needs
  graph and 86-job count are unchanged**.
- [Fix C Draft Quick #41137111741](https://github.com/WwlWss/dsh-context-manager/actions/runs/41137111741)
  **SUCCESS**: 187/187 Client, 271/271 Node (including three
  official-Full-gate regression tests), 1/1 Slot.
  [Two-version canonical suite #41137111747](https://github.com/WwlWss/dsh-context-manager/actions/runs/41137111747)
  **8/8 SUCCESS**.
- Four-version Draft preflight HEAD
  `5b7315373ce02d44fafde2b950422eee3d9351a5`,
  [real Published Renderer #41137338897](https://github.com/WwlWss/dsh-context-manager/actions/runs/41137338897)
  **10/10 SUCCESS**, with **all 4 × 21 = 84 actual Skill
  interaction cases green**, plus all four prior F01-SR1 Renderer
  controls and Store/Node/Slot. This is **not** the protected Ready 86
  Full; it is an exact-code four-version Draft qualification.

### 19.5 Fix D and explicit remaining gates

- Replace the once-valid B1-3 inert Skill UI comments and `skillRedProbe`
  locale key with current Profile-local editor behavior and neutral
  effectiveness disclaimer. Update live passing Client test labels from
  `RED` to regression/contract, README and roadmap to distinguish
  implemented-but-unmerged M8B from the merged M8A2 baseline.
- Preserve §§12–18 and their immutable original RED evidence as
  historical proof; do not retroactively change the earlier outcomes.
- **Still required after the final Fix D code/docs HEAD:** independent
  Final Strict Code Review with no outstanding P1/P2, exact-HEAD
  Draft Quick and four-version scoped qualification, explicit Ready
  transition and **new** protected 86-job Full with all 21 real Skill
  tests in the official four-version Client matrix, then separate
  merge approval and post-merge independent main Full.
  PR remains **Draft/unmerged** until these gates pass.

## 20. F01-SR3 — stale Drawer navigation and close, RED→GREEN

Independent source review after F01-SR2 found that retained React Tab,
Profile/Resource selection, Backdrop/Header Close and Escape callbacks could
still mutate a *new* Drawer opening or consume a stale Escape event.
This was **UI navigation/closing authority**, not another Host/Settings CAS.

1. Test-only RED commit `4ae75ba846342791a739a80cd862fb59c9d4678d`;
   [four-generation actual published Renderer #41185067011](https://github.com/WwlWss/dsh-context-manager/actions/runs/41185067011)
   recorded R13T/P/R/C intentional failures in all four generations at the
   old-callback state assertions, retaining earlier controls.
2. Production GREEN commit `93a3f3668bfcb7cb865ab3b96583e9a1483ff239`.
   One `mayApplyCurrentNavigationEvent` check uses actual registered root
   Store, render-captured `openSessionEpoch`, and expected pane (for
   Tab/row selection) to revoke old user-originated navigation. Permanent
   sidebar trigger `toggle` remains unchanged; Host/Remote v3, Draft
   Basis/Token and Controller receipts remain untouched.
3. [Exact-head Draft Quick #41186577761](https://github.com/WwlWss/dsh-context-manager/actions/runs/41186577761):
   187/187 Client, 271/271 Node, 1/1 Slot PASS.
   [Four-generation actual Renderer #41186577637](https://github.com/WwlWss/dsh-context-manager/actions/runs/41186577637):
   **10/10 scoped jobs PASS; four versions × 25 actual independent cases =
   100/100 PASS**.
4. Independent next-head review accepted R13's scoped navigation/close
   behavior but found three more **manual Read dispatch** gaps (F5/P2).
   Proceeded to F01-SR4/R14 below; the above is **not** a new protected
   Ready 86-job Full.

## 21. F01-SR4 / R14 — obsolete user-requested Read callbacks, RED→GREEN

### 21.1 Root cause and bounded change

Even after stale navigation and draft events were fenced, old React callbacks
could still call `props.refresh()` or `props.loadPromptResourceList()`
from Profile Refresh, Resource Refresh and PromptBinding Load Suggestions.
The shared Client Model's `runLazy('list','')` increments keyed request
ownership before read completion; an obsolete callback could supersede a
legitimate current-session same-key reader. Profile Refresh could initiate
a new baseline `reconcile`. Post-read notice guards are **not** pre-dispatch
authority and were therefore insufficient.

The production repair checks the *original rendered* Drawer epoch, actual
root Store identity and pane before dispatch. Resource Refresh also checks
the retained Resource selection; Binding Suggestions checks the originally
rendered requested Profile selection. This is a guard on **new user events**,
not an abort of already issued reads or legitimate current-session
Unknown/Degraded manual recovery. Automatic Resource List/document
`useEffect` reads, Host/Remote, Draft Tokens, Profile Basis, Controller
single-flight, and first-terminal mutation receipts are unchanged.

### 21.2 Executable evidence, immutable exact HEADs

- **R14 test-only RED:** `4adb79c5ee651f52c910ad3372ef98020aa4a2de`.
  [Actual four-generation Published Renderer #41202104864](https://github.com/WwlWss/dsh-context-manager/actions/runs/41202104864):
  each version **25 old cases PASS, R14P/R14R/R14B intentional RED** at
  the exact old callback read-dispatch assertion, 12 expected RED total.
  Fixture instrumentation counts injected UI read dispatches *and real
  Remote profiles/Resource-list reads*. All three cases have a fresh
  same-session positive control. This commit did not modify production.
- **R14 production GREEN:** `0ada21b4f79d05c1d21b02944dfe4355daaf98cc`.
  [Actual four-generation Published Renderer #41202244270](https://github.com/WwlWss/dsh-context-manager/actions/runs/41202244270):
  **10/10 scoped jobs PASS**, each published version independently reports
  `M8B_PUBLISHED_RENDERER_FULL_PASS`, `expected:28`, `passed:28`,
  `failures:[]`: **4 × 28 = 112/112 real interaction cases PASS**.
  All R14 fresh controls reached actual Remote read endpoints and no
  Profile/Resource mutation RPC was introduced.
- [Exact-head Draft Quick #41202244378](https://github.com/WwlWss/dsh-context-manager/actions/runs/41202244378):
  **187/187 Client, 271/271 Node, 1/1 Slot PASS**, 0 failed/skipped.
- The canonical `tests/m8b/run-skill-renderer-probes.mjs` now requires **28
  distinct cases** including R14, and the **existing four-version** official
  `client-presentation-contract` invokes it after the historical default
  Drawer test without creating additional Full jobs. The formal protected
  **new exact-head 86-job Full has not yet been run**.

### 21.3 Remaining qualification boundary

This section and historical §§19–20 record independently qualified RED and
scoped GREEN at their precise code HEADs. Any subsequent doc/code changes
produce a new HEAD requiring their own scoped verification. **PR #42 stays
Draft/unmerged** until a new independent Final Strict Code Review resolves
all P1/P2, followed by an explicit Ready transition and new **86/86
protected Full on the repaired exact HEAD**. Merge approval and independent
post-merge main Full remain separate gates.
