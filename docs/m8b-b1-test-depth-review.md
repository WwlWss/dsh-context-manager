# M8B B1-2b independent test-depth review and B1-3 executable Renderer RED

**Scope:** PR #42 Draft, baseline F01-SR1 code/docs HEAD
`f452a2252f94d4df717e157bbdc096a5d65ae15d`; reviewed actual
`tests/client-skill-policy-editor.test.ts`, `src/client/skill-policy-editor.ts`
typed inert seams, the single real DSH Presentation Store, the M7C/M8A1/
M8A2 published Renderer harness, and the frozen `docs/m8b-plan.md §14`.

**Disposition:** B1-2b test-depth improvements verified; B1-3
**R01 read-only mount / R02–R04 Begin-frontier RED verified, R05
fresh-Begin frontier RED verified**. R06–R10 are **NOT independently
qualified**. PR remains Draft; **NO B2 Skill Store/Save GREEN**.

## I. Strict review findings and corrections

| ID | Severity | Source-level issue | Corrective treatment / remaining gate |
|---|---|---|---|
| F02-01 | High | `requireSkillDraft` returned the broad union and tests contained `if(kind !== ...) return` or `if(kind === ...) assert`. A future incompatible Store shape could short-circuit assertions, presenting a vacuous positive. | **Fixed test-only** in `a9929dc3...`: assertion-narrowed generic `Extract<SkillDraft,{kind:K}>` and unconditional next assertions. No production Store implementation. |
| F02-02 | High | Create immutable-Basis test passed already frozen `BASIS`; freezing/aliasing the exact caller argument could be mistaken for a defensive Begin snapshot. | **Strengthened test-only**: pass a mutable Basis and own-key array, mutate both after Begin, and assert copied, frozen, unchanged captured Basis and observed names. Still RED until real Skill Begin. |
| F02-03 | High | Twenty-three existing RED tests mostly terminated at first inert Skill Begin/helper assertion. They did not each prove their downstream RPC/Token/late-receipt clause. | **Partly mitigated**: six separate probes for kind predicate, own vs inherited keys including unsafe `__proto__`, exact duplicate/no-RPC, original-Basis RPC, occupied real Resource lane, and distinct business outcome notices. **Do not equate all RED IDs with independently proven deep races.** |
| F02-04 | High | Helper RPC tests use a `Pick<ContextManagerClientProfileMutations>` spy cast to a full API. This proves exact function/basis argument shape, **not** real Controller/Host CAS, unknown-after-commit, read-back, or persisted sibling preservation. | **Pending real UI qualification**: B1-3 fixture now exposes only the two existing Remote Skill RPCs under the *real* Business Face, with actual write counters and deterministic external Skill revision. Real Host Stored-sibling preservation was previously independently qualified in B0, not by this fixture. |
| F02-05 | High | No mounted Skill section existed; claiming R02–R10 from a missing DOM would have been incorrect. | First **true R01 mount RED** at `ac4f84b0...`, two real published Renderer generations, expected 1 section / actual 0. Staged an **explicitly inert**, warning-labeled, read-only Skill section at `59c77534...`; this gives R01 a real own-key/Mode positive and allows distinct R02–R05 *Begin* negative probes. Does not implement Skill forms/Save. |
| F02-06 | Medium | String path semantics include valid `''`, whitespace, Unicode, `constructor`, `toString`, `prototype`, `valueOf`, and unsafe `__proto__`. Inherited property names must not be confused with own Settings entries. | Added independent own-vs-inherited check; R01 seeds `constructor`, `toString`, Unicode and read-only unsafe `__proto__`, sorts by actual UTF-16 code units, and verifies configured modes only. R02's empty-name RPC and other keys' final wire identity remain unqualified behind Begin. |
| F02-07 | High | A negative stale callback that never mutates due to **globally inert** Begin is a *vacuous pass*; it does not prove future Store Begin safely rejects stale rendered target. | R05 first validates the stale callback made no draft/write after external Settings revision, **then** demands a freshly rendered callback create the current draft. Fresh path fails, so R05 is a genuine *positive frontier* RED, **not** an independent proof of the negative security property. Recheck negative after Begin GREEN. |
| F02-08 | High | The broader R06–R10 matrix requires an active real Skill draft and/or a real Save handler. The B1-3 typed Store actions and pure commit remain deliberately inert. | **Unresolved by design.** No synthetic Store, fake successful Skill draft or unqualified production RPC is added to bypass this. Future B2 staged entry must immediately re-run R06–R10 and obtain independent targeted RED/GREEN evidence, without treating Begin-only failure as downstream proof. |
| F02-09 | Medium | `selectedProfileId=null` may display the default Profile; stale local row selection can change without Settings revision. | The inert Renderer section uses the actual derived selected row and root Store open-session guard, not an unconditional `selectedProfileId===profileId` assumption; final Skill Begin/Save selected-intent checks remain B2 work. |
| F02-10 | Medium | Editing an unsafe Profile/Skill path must be blocked without denying readable historical rows; native catalog/Agent effectiveness may not be inferred. | R01 read-only own `__proto__` row has a disabled editor; valid `constructor` remains enabled. The test seam renders *only configured Profile entries* with explicit advisory text, never a catalog or Agent verdict. |

## II. Exact execution evidence (not inferred from test names)

### B1-2b test-depth RED

- Test hardening HEAD `a9929dc35c941a7d38de45dd9cab4d86967567e7`;
  [Draft Quick #41112699712](https://github.com/WwlWss/dsh-context-manager/actions/runs/41112699712):
  strict TypeScript compile + test bundle succeeded; **187 Client cases,
  159 PASS, 28 intentional Skill RED, 0 skip**. Five added independent
  helper/kind RED probes; one real occupied-Resource Store control passes.
  No previously qualified F01-SR1/legacy Client assertion regressed.

### B1-3 real Published Renderer staged RED

- **Mount-only RED** HEAD `ac4f84b04bd81f12c599d61bbf6bde9c663e5ad0`;
  [#41112996036](https://github.com/WwlWss/dsh-context-manager/actions/runs/41112996036):
  both real `@deepseek-ai/dsh-client-ui-renderer` generations
  `0.1.2-rc.1` and `0.1.6-alpha.2` fail **exactly** on
  `B1-R01: expected 1 Skill section, actual 0`. Retained four-generation
  historical F01 UI, pinned-oldest Store/Node/Slot tests all PASS.
- **Independent Begin-frontier RED** HEAD `59c775343f3208f0fab6e5c5f63691aa43194fe1`;
  [#41113521571](https://github.com/WwlWss/dsh-context-manager/actions/runs/41113521571).
  On **both** retained actual Renderer generations:
  - R01: **PASS** with five exact own configured rows, explicit modes,
    code-unit order, unsafe `__proto__` read-only and no mutation or
    invented native inventory.
  - R02: **RED** on actual Create button; `draft.kind` is absent,
    expected `skill-mode-create`. The later explicit-Auto empty-key RPC
    assertions are present but **not yet reached**.
  - R03: **RED** on actual Edit button; absent draft vs
    `skill-mode-edit`. The later Manual→Pinned wire assertion is present but has not
    been reached; unchanged-mode zero-RPC still needs a separate real UI probe.
  - R04: **RED** on actual Remove button; absent draft vs
    `skill-binding-delete`. Later confirmation/warning/remove RPC
    assertions are not yet reached.
  - R05: old rendered Edit after external Settings revision made no draft
    or RPC; the positive **fresh** Edit still cannot Begin. This is
    **RED at fresh Begin**, not yet a separate negative stale-fence proof.
- F01-SR1 **all four** existing published Renderer versions PASS;
  pinned-oldest targeted Client **52/52 PASS**, Node **268/268 PASS**,
  Client Slot PASS. Existing M7C/M8A1/M8A2 tests are not deleted.
- [Normal Draft Quick #41113521656](https://github.com/WwlWss/dsh-context-manager/actions/runs/41113521656):
  strict compile/build PASS, **159/187 Client PASS, 28 deliberate Skill RED**.
  Failure occurs before the normal Node/Slot stage; the separate scoped job
  supplies unchanged Node/Slot evidence. This is **not Ready Full**.

## III. B1-3 remaining exit matrix

| Case | Current evidence | Required follow-on |
|---|---|---|
| R01 | PASS after independently recorded mount RED | Replace inert read-only renderer seam with reviewed Skill Editor; keep exact own-key controls |
| R02 | Real Create Begin RED | Reach editable name/Auto Save; test `''`, Unicode, special valid names, one original-Basis setter RPC and zero Resource/Agent writes |
| R03 | Real Edit Begin RED | Reach changed Mode Save and unchanged Mode zero RPC |
| R04 | Real Delete Begin RED | Reach exact quoted confirmation warning about unknown Stored siblings and one whole-binding remove |
| R05 | Real stale-negative / fresh-positive frontier RED | Independently prove old rendered Profile/Skill/Host rotation rejected *after* Skill Begin becomes functional |
| R06 | **NOT QUALIFIED** | Visible vs invisible external Settings CAS, respectively zero RPC vs one rejected RPC, zero persisted unauthorized changes |
| R07 | **NOT QUALIFIED** | Old Save after Cancel/pane/selection/root-teardown emits zero writes and cannot overwrite owner |
| R08 | **NOT QUALIFIED** | Same-render double Save, Save→Cancel, dropped reply; exactly one RPC, blocked Unknown and explicit Discard |
| R09 | **NOT QUALIFIED** | Applied+Degraded vs Unknown/Conflict; retain original terminal receipt against late refresh |
| R10 | **NOT QUALIFIED** | Close→Reopen retains original Skill draft Basis/Token; old callbacks denied, newly rendered Save allowed |

**Qualification rule:** a missing form, inert Store Begin, missing import,
TypeScript error or fixture mock **must never be reported as proof of a
subsequent Save/CAS/outcome property**. Do not turn PR Ready, merge, run a
spurious 86-job Full, or remove failing tests to obtain a green overall CI.
The temporary, **explicitly labeled inert** Skill UI entrypoint is permitted
only on this Draft branch as a B1-3 probe seam and must be replaced before
any release/merge. It does not create or persist a Skill Binding.
