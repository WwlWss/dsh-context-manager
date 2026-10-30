# M8B — Profile Skill Policy Editor (Capability & Implementation Contract)

**Status:** B0 capability preflight completed at source-contract level; this is the **design-only Draft**. No M8B production code, executable RED, published-host proof or M8B GREEN qualification has been claimed.
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
