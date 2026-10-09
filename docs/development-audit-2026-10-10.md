# Development state and workflow audit — 2026-10-10

This is an evidence-bounded checkpoint, not a feature-completion claim or a replacement for [roadmap.md](roadmap.md), [compatibility.md](compatibility.md), or [development-guide.md](development-guide.md). Verify current branch/CI after later changes.

## Baseline and evidence

- Main at this audit: `f7c00516827c30dff827564aca31512ac5445662`, after [PR #30](https://github.com/WwlWss/dsh-context-manager/pull/30).
- [PR #31](https://github.com/WwlWss/dsh-context-manager/pull/31) introduces Quick/Full qualification and the candidate artifact intake; prior candidate-artifact [run #37948993328](https://github.com/WwlWss/dsh-context-manager/actions/runs/37948993328) succeeded on its three explicitly pinned published versions.
- The previously green full [run #37949176452](https://github.com/WwlWss/dsh-context-manager/actions/runs/37949176452) applies to PR #31 **before this smoke/roadmap follow-up change**. It cannot qualify a later head. A fresh exact-head full Ready-PR run is mandatory.
- Current production `src/client/plugin.ts` renders only the `foundationMessage` in the Drawer; it has not delivered Profile list/edit UX.
- [0.2.x feasibility intake](dsh-v02-feasibility.md) establishes E1 and structural E2/E6 only. E4/E5 SettingsForms persistence, AgentPreset Registry operation, migration and lifecycle are **not yet proven**.

## Completion and gaps

| Scope | Audited status | Evidence owner / next boundary |
| --- | --- | --- |
| M1–M2 | Implemented | Host package, Settings-backed profile Domain, narrow mutation semantics |
| M3A–M3C | Implemented on retained DSH generations | AgentPreset roster/Session identity/legacy native copy and remove; **not** new Registry parity |
| M4A–M4C2 | Implemented | Prompt Library, Binding and model-effective Agent-scoped prompt/runtime integration |
| M5A–M5C | Implemented | Four-mode skill policy and Pinned durable instruction runtime |
| M6A–M6C | Implemented | Generated Remote, Host mutations, diagnostics and change hints |
| M7A/M7B0/M7B1-1/M7B2-A/M7B1-2 | Implemented | Browser artifact, authority-safe Client model, Profile mutation controller, Slot business bridge |
| M7C/M7D | Not completed | Real Profile Drawer and browser/packaging closeout |
| M7B1-3/M7B2-B | Not completed | Lazy PromptResource + keyed diagnostics and resource mutation basis |
| M8–M16 | Planned, not complete | Resource editors, bindings, transforms and extended renderer |

A green CI verifies the capabilities tested, **not** that the product already has usable Profile editing screens.

## Reviewed problems / corrective actions

1. **P2 documentation drift** — README still claimed M7B1 would be next. Align README, B1 plan and roadmap to merged #27/#29/#30 and the actual still-placeholder Drawer.
2. **P2 artifact evidence gap** — the old `dsh-smoke` jobs independently built a workspace copy per DSH version, despite the intended same-built-artifact policy. PR #31 now sends the tested tarball from `package` to all smoke consumers. Do not claim this repair passed until the *new* Ready-PR head is green.
3. **U: new Host generation** — 0.1.7+/0.2.x removes old Settings section registration and legacy preset authoring semantics. Keep support disabled; prototype published public SettingsForms and AgentPresetRegistry behavior independently before production migration.
4. **P2 compatibility metadata risk (not fixed in this process PR)** — the package manifest uses broad caret ranges, e.g. `^0.1.1-rc.2` and `^0.1.6-alpha.2`. While newer **prereleases** do not automatically satisfy those expressions, a future stable `0.1.7` under `<0.2.0` may satisfy them without ever having passed E4/E5. In a dedicated manifest-contract PR, determine a supported-version policy and add negative resolution tests for unqualified versions, preserving explicit retained peer/consumer tests.
5. **H/process debt** — prior repeated large CI feedback and duplicate #27/#28 PRs increased latency and review ambiguity. Use Draft Quick checks until focused code review, then full Ready qualification and one exact-head closeout. Label every failure P/H/U/I *before* touching production.
6. **Potential release claim overreach** — structural `npm pack` verification is not a real Host service mount, successful CLI startup is not proof all plugin Fibers became active, and a Client declaration compile is not a real browser lifecycle. Label evidence separately.

## Revised development order

**Workstream A — retained product experience (next):** M7C Profile-only vertical slice. Use completed Host Remote / B1-1 / B1-2 / B2-A as-is. Ship profile list/select, create/delete, metadata and basePreset edit, explicit Save, immutable draft basis, authoritative refresh, and visible conflict/unavailable/malformed states. No PromptResource/Skill editor work and no extra Host state engine. Run focused component + real retained Client Slot/Remote smoke. Follow with M7D browser/load/unload/packed same-artifact closeout before declaring M7 complete.

**Workstream B — 0.2 public-API feasibility (separate, parallel, not a support release):** exact published 0.2.0-rc.2 temporary-profile E4/E5 for Config persistence (opaque payloads, malformed sibling isolation, revision conflicts, unknown fields, secrets, lossless legacy migration, rollback, lifecycle). Separately test Registry list/resolve/readDocument and prove explicit no-copy/remove behavior. If no safe persistence owner passes, keep the new Host unsupported rather than writing to Cordis private patches. Admit 0.2.1-alpha only as a distinct canary with its removed invariants.

**Workstream C — resource editing:** B1-3 lazy resource + keyed diagnostics, followed by B2-B revision-owned PromptResource mutation controller, then M8A Prompt editor. Only add the matching deferred Session/Agent diagnostics when the real source exists. M8B–M8E and M9+ remain separate vertical slices.

**Workstream D — manifest support hygiene:** address the prerelease caret/unsupported future stable 0.1.x issue with explicit resolution/negative tests before any peer-range expansion.

## Review / CI decision policy

- **Contract:** exact public owner, version, runtime action, persistence/revision semantics, and E-class proof. Reject absent/private seams before implementation.
- **Quick:** one Draft Ubuntu/Node 22 typecheck/build/package-unit lane; it does not qualify a merge.
- **Targeted:** only affected published Host/Client seam plus a realistic teardown or race probe; fix P/H/U/I by category.
- **Full:** Ready PR, exact head, retained complete matrix, packed consumer and same packed bundle in each DSH smoke lane.
- **Final:** one strict review of the tested head; re-review only affected behavior after a substantive fix; merge only a green matching head.

Do not turn a historical CI run or a source-compatibility guess into a support guarantee. A new user-visible vertical slice should be preferred to another large model-only subsystem when its required authoritative operations already exist.
