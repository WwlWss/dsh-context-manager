# M7C — Profile-only Drawer Core

**Baseline:** main `74e6fc5d262ce6852c830160cd9fd6ff1a915eea` (merged PRs #31/#32).
**Status:** implementation slice; M7D browser/package closeout remains a separate milestone.

## Target

Replace the M7A/B0 foundation message with a usable Profile editor while retaining the
M7B1-1 authoritative model, M7B1-2 renderer hooks and M7B2-A single-flight
mutation controller. The existing additive `sidebar.footer.action` and
`shell.overlay` registration and `./client` loader remain unchanged in ownership.
Do not widen the supported Client/Host version range or DSH peer constraints.

## Product boundaries

- Show parsed Profile rows plus read-only rows for each Domain-invalid stored Profile
  surfaced by `invalid-profile` diagnostics. No ordinary field editor for invalid raw data.
- Read and display configured/usable default IDs, Profile/Preset resolution,
  Settings writable/read-only/unavailable status, schema incompatibility,
  snapshot stale/loading/error and Host protocol/attachment status.
- Create a Profile atomically through the existing `createProfile(id, input, basis)`.
  Editing name, description or basePreset is **one distinct Host write per explicit Save**,
  never a loop of three writes with one stale Settings revision.
- Make/clear default and delete are explicit independent actions. Deleting the configured
  default deliberately preserves its dangling reference; never silently repair or
  replace it with another Profile.
- Profile ID is not a name and cannot be renamed through `setProfileName`.
- The basePreset ID is declarative. Missing/broken native presets are shown,
  never automatically switched, selected, mounted or recomposed.
- An absent optional description is different from an empty string. Its removal
  sends `null` through the existing Remote bridge; setting empty sends `''`.
- List/selection/creation/field edit/delete, manual Refresh, guarded actions and
  all status/error copy are localized in the existing zh/en Locale namespace.
- PromptResource editing, Skill editor, native preset authoring, Session/Agent
  keyed diagnostics, auto-poll/focus/reconnect refresh and advanced raw payload
  replacement remain in later milestones.

## State ownership and rendering

`ContextManagerClientModel.state` remains the sole authoritative source for
profiles, presets, changes and persistence revision. Its `mutations.state`
remains the sole authoritative operation-lane source. Both cross the retained
`inject.hooks` boundary as `useContextManager` and `useProfileMutation`.

The DSH `defineStore` presentation store owns only `open`, selected Profile ID,
an at-most-one locally drafted create/field/delete intent with its **captured immutable
`{instanceId, revision}` basis**, a monotonic presentation-only draft token and
local feedback notices. It never copies Profile snapshots or business controller
objects and never manually subscribes through `useSyncExternalStore`.

Opening an edit or confirmation captures a basis once. Typing only modifies
the presentation draft. Save forwards that exact basis unchanged through B1-2.
No Save-time refresh, mutation retry, optimistic authoritative cache patch or
Client-side Settings write is allowed. Selection changes are blocked during a
draft until explicitly cancelled. Closing the overlay leaves its draft intact.

The outer Drawer shell checks `open` before mounting its inner content;
the inner content owns its hooks unconditionally, avoiding React hook-order
problems. The existing Slot registration still owns Remote/locale teardown.
The UI traps Tab focus in the dialog, focuses it upon mounting, restores focus
upon unmounting and closes on Escape without discarding a draft.

## Post-write semantics

| B2-A outcome | M7C response |
| --- | --- |
| `applied/fresh` | Release only the matching draft token; show successful authoritative reconciliation |
| `applied/degraded` | Release matching draft; indicate *confirmed* write, incomplete read-back; never resubmit |
| `rejected` invalid input/existing/path | Keep editable draft, show machine-code-classified error |
| `rejected` stale basis or authority/profile conflict | Preserve and block draft; allow read-only Refresh, then explicit discard/restart |
| `unknown` transport | Preserve and block draft, do **not** replay uncertain write |
| `busy` | Keep draft; do not enqueue or retry |
| `detached`/`disposed`/`incompatible` | Preserve blocked draft and disable writes |
| `superseded` | Never publish success/failure of an obsolete lifecycle |

A change cursor does not substitute for the persistence revision. Current
`instanceId` and Settings revision are compared to the draft only for
presentation affordances; the existing B2-A operation controller remains
the authority for deciding whether a write may execute.

## Files

- `src/client/profile-editor.ts`: draft/result types, creation validation and error classification.
- `src/client/profile-view.ts`: read-only authoritative-to-view projection, invalid-row isolation, editability and preset resolution.
- `src/client/presentation-store.ts`: view-only selection/draft/notice actions with token guards.
- `src/client/profile-drawer.ts`: real React profile list/forms/diagnostics and explicit B2-A callbacks.
- `src/client/plugin.ts`: mount inner component in existing overlay shell; keyboard/focus boundary.
- `src/client/locales.ts` and `src/client/plugin.module.css`: bilingual product copy, retained theme tokens and responsive layout.
- `src/client/react-shim.d.ts`: only the public React hook types the UI actually consumes.

No changes are planned to the Host Domain, Settings adapter, Remote v2 DTOs,
M7B1 model, B2-A controller or B1-2 business face.

## Test and closeout

1. View-only store tests: selection, guarded draft replacement, close/reopen
   preservation, user cancellation, matching-token settlement.
2. Validation/results: duplicate/unsafe IDs, description presence, stale/unknown
   blocking, conflict, applied/degraded and superseded outcomes.
3. Real renderer Profile UI: state hydration, selecting, creating, editing one
   field, default-setting, deletion confirmation, invalid stored record, diagnostics,
   stale-basis/transport-unknown and read-only/unavailable state.
4. No extra generated `./client` externals, no production `useSyncExternalStore`,
   exact Remote v2 boundary; UI compiled against every retained 0.1.2+ Client
   public declaration generation.
5. Full ready-PR qualification: retained Host/Client contract matrix, packed
   same-built artifact consumers, all DSH smoke lanes and green required
   `dsh-context-manager / full qualification`.
6. Exact-head focused/final source review. M7D still owns assembled browser
   load/unload/HMR and packaged execution closeout before Milestone 7 is
   declared complete.
