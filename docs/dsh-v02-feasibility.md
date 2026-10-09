# DSH 0.1.7+/0.2.x public-capability feasibility intake

**Status (2026-10-10):** E1 upstream source review and published-artifact **structural preflight** passed for the three explicitly pinned candidates; the original success is archived in [GitHub Actions #37948993328](https://github.com/WwlWss/dsh-context-manager/actions/runs/37948993328). Checks prove package identity, export files and declaration token presence **only**. They do not compile an external TypeScript consumer (full E2), load services (E4/E5), or compose a DSH Host (full E6). DSH 0.1.7+/0.2.x therefore remain unsupported; production adapters, stored data and peer ranges are unchanged.

## Provenance and evidence boundary

- Retained last-tested forward generation: dsh-v0.1.6-alpha.2. Its existing Host and Client claims are unaffected.
- Host breaking generation: at least as early as dsh-v0.1.7-alpha.1, when SettingsForms and AgentPresetRegistry replace the old public services.
- New version intake target: dsh-v0.2.0-rc.2. Forward-only exploratory candidate: dsh-v0.2.1-alpha.2.
- Official master observed 2026-10-09 at d743267388641bc76f17c45ce8b4c231aed1d32c. A source SHA does not qualify a published artifact.
- Executable artifact probe: scripts/probe-dsh-published-artifacts.mjs and .github/workflows/upstream-intake.yml. It uses npm pack on exact published versions, extracts the real public declarations, confirms export files, and saves the npm tarball integrity. Passed for `0.1.6-alpha.2`, `0.2.0-rc.2`, and `0.2.1-alpha.2`. It establishes published artifact structure only. E2 consumer compilation, E4/E5 service/lifecycle and E6 Host composition remain open. Re-run if this probe or the pinned candidates change.

Primary upstream sources:

- [Retained Settings service](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.6-alpha.2/packages/settings/settings/src/index.ts)
- [New SettingsForms service](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.0-rc.2/packages/settings/settings/src/index.ts)
- [New Settings package guide](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.0-rc.2/packages/settings/settings/README.md)
- [Retained AgentPresets](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.6-alpha.2/packages/preset/agent-presets/src/index.ts)
- [New AgentPresetRegistry](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.0-rc.2/packages/preset/agent-preset-registry/src/index.ts)
- [New declarative AgentPreset plugin](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.0-rc.2/packages/preset/agent-preset/src/index.ts)
- [Invariant removal migration guide](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-alpha.2/docs/upgrade-guide/v0.2.0-rc.2/remove-runtime-invariants/guide.zh.md)

## 1. Settings: blocking persistence ownership change (U)

### Current Context Manager contract

src/adapters/settings.ts selects either the old module-level installSettingsSection helper or retained SettingsProvider.installSection. src/service/context-manager.ts relies on an independently registered Settings namespace with descriptor value, user, revision, writable and DSH-native narrow mutate semantics.

The existing persisted envelope contains schemaVersion, optional defaultProfileId and an opaque profiles mapping. Safety requirements include malformed-resource isolation, unknown-field preservation, raw-invalid-document refusal, narrow writes, secret redaction, correct revision CAS, and Host authority rotation.

### 0.1.7+/0.2.x public source

SettingsProvider/installSection disappears. The service is now SettingsForms, with describe/update/replace/mutate over the active Cordis Profile plugin-entry Config. Writable fields are defined via the published volatile Config schema, not by adding independent Settings sections.

The old Context Manager namespace is therefore **not** transparently replaceable with a volatile form field. Existing production will fail loud because settings.installSection is unavailable.

The new DSH migration for legacy settings.yaml renames the old document to settings.yaml.imported and attempts entry-by-entry import. Invalid/unmatched entries are logged and remain only in the renamed file. This does **not** guarantee that dsh-context-manager user data has migrated safely.

### Feasibility gate before designing production migration

Only a real public SettingsForms + ConfigEditor temporary-profile experiment can decide whether a plugin Config field is sufficient. The experiment must demonstrate:

1. Round-trip of existing schemaVersion, all opaque Profile payloads and unknown sibling values.
2. Isolation of one Domain-invalid Profile from other valid Profiles.
3. Narrow path mutations, preservation of unrelated fields and redacted secret values.
4. Accurate expectedRevision conflicts, concurrent writers and authority replacement.
5. Malformed raw document refusal without silently rewriting it from last-good state.
6. Durable restart/reload behavior and correct dispose/HMR teardown.
7. Explicit safe migration from legacy settings.yaml with backup, unmatched-section reporting, rollback and no silent data loss.
8. Correct behavior when Settings is absent, read-only or unable to expose the required schema.
9. Actual published 0.2.0 public packages, without depending on Cordis private patch-editor internals.

Possible public owners to study: the native plugin Config/volatile path or another public DSH durable store with equivalent transaction semantics. Do not edit Cordis patch files directly, create fake revision tokens, or bolt on a second arbitrary persistent store.

**Verdict: blocked pending E4/E5 native-runtime persistence feasibility.** Do not touch the old Host adapter or widen peer support yet.

## 2. AgentPreset: discovery still public, legacy directory authoring removed (U)

### Old capability

The retained AgentPresets Host service exposes defaultId, authorable, list() rows with trust (system/user), and read/copy/remove of actual native preset compositions. Context Manager's M3A and M3C adapters intentionally enforce this exact minimum contract.

### New capability

From 0.1.7 onward the Host service is AgentPresetRegistry, with AgentPreset definitions registered as ordinary plugin entries. The registry still exposes defaultId, list() and resolve(id?). Its public list rows use id and optional name/description/order/broken. They no longer expose trust or authorable.

The old read(id), copy(from,id,name?) and remove(id) methods no longer exist. The new readDocument(agentPreset) returns a generated YAML *view of a declared child plugin list*, with metadata. This is useful for read-only inspection, but must not be claimed byte-for-byte equivalent to the former original native composition text. The new readDocument API must itself be exercised before use.

src/adapters/agent-presets.ts currently rejects list rows without trust. src/adapters/preset-authoring.ts rejects missing authoring methods. These are correct fail-loud responses in an unsupported generation, not a reason to invent user trust or authorability.

### Feasibility direction

- Test real new Registry creation/list, changed/missing/broken definitions, resolve and disposal, without modifying original basePreset IDs.
- Split native roster discovery from native authoring capability. Preserve a genuinely unknown trust/origin rather than inventing 'user' or 'system'.
- Keep BasePreset resolution separate from Session identity. Do not turn registry status into stored Profile data.
- Consider a separate read-only document capability for readDocument only if the actual public API supports it.
- If native copy/remove are absent, expose those controls as explicitly unsupported. No direct filesystem copying/deletion, no patch-file surgery, and no simulated Registry write.
- Protect both retained old-service support and new-service behavior with separate published runtime tests after the adapter is designed.

**Verdict: read-only M3A integration seems feasible; M3C read/copy/remove equivalence is absent from the audited Registry contract.** Production support still awaits E4/E5 proof.

## 3. Remaining seams

| Seam | Source observation | Next test |
| --- | --- | --- |
| Slots / renderer | InjectFace, ComposedProps and bindInjectSources remain; 0.2.0/0.2.1 key sources have identical Git blob SHAs | Published Client loader and React selector runtime with same-built Context Manager artifact |
| Typert | Decorators and public protocol remain, with internal/dependency changes | Generated v2 protocol declarations, real Gateway and lifecycle |
| Session / Prompt / Skill | Public runtime continues to evolve | Focused M3B/M4/M5 real-service regression, not merely compile |
| Invariants | Package and per-package invariant subpaths removed for 0.2.1-alpha | Version-conditional canary setup, follow upstream migration guide |
| Boot/composition | Registry/plugin entry composition changed | Verify actual activated Host services, not only a successful config dump |

## 4. Required decision sequence

A. Execute the SettingsForms persistence feasibility probe in an isolated temporary DSH profile with backups and lossless-diff checks. If Config cannot meet every relevant persistence invariant, do not shoehorn profiles into it.

B. Execute real AgentPresetRegistry discovery/resolution/readDocument tests; explicitly record read-only capability limits and no legacy authoring parity.

C. Propose version-aware narrow Host adapters only after A/B produce an explicit verdict. Keep the production old-generation behavior intact.

D. Qualify Typert, Session/Prompt/Skill and published Client loader/renderer against the same built plugin artifact.

E. Expand peer ranges or support language **only after** published E4/E5/E6 evidence is green. 0.2.1-alpha requires a separate intake from 0.2.0.

**Support classification now:** 0.1.7+/0.2.x are **unqualified and not supported by current production**. The known Settings/AgentPreset incompatibilities are upstream contract changes, not fixed by this report.
