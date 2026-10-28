# M8A1 — PromptResource Library Editor

**Status:** Draft, implementation in progress. **Base:** merged M7B2-B1 PR #39 `a186fda5fe468aabcda1286b25bcc75c2843e91c`, independent main Full Qualification 86/86 green. M8A2 owns PromptBinding edits and must not be conflated with this slice.

## Delivered product scope

Add a Resource tab inside the existing Context Manager Drawer: authoritative PromptLibrary list (including invalid rows), targeted document read and diagnostics, explicit create/edit/delete UI, lossless multi-line content, absent-vs-empty description semantics, deliberate deletion confirmation that does not cascade Profile bindings, and accurate applied/rejected/unknown/degraded reporting. Keep Profile Drawer and its existing editor unchanged except for one tab navigation wrapper.

## Required ownership and invariants

- Host retains the only writable store. Reuse exactly the six M7B2-B1 Business Face resource mutations, `capturePromptResourceCreateBasis`, `capturePromptResourceReadStamp`, `loadPromptResourceList`, `loadPromptResource`, and `hooks.resourceMutation`. No Remote v4, Host edits, alternate cache, new Remote event/polling, or authority discovery.
- The UI-only Presentation Store owns current tab, selected Resource id, local draft and notice. Drafts survive closing/reopening the overlay, and prevent switching tab/record without explicit Cancel/Discard. No draft bytes are written to the ContextManager Model. A closed pane must never auto-submit writes.
- Captured edit-time Stamp is immutable and is **never replaced at Save time**. Compare Resource authority/id/incarnation/revision (not Profile instanceId) against currently fresh B1-3 Document/List to enable submission. Profile instance rotation can be followed by *read-only* revalidation against the original stamp. Resource source rotation or ABA blocks the old draft.
- Create captures Resource Authority once, does not silently recapture at Save. PromptResource IDs are arbitrary exact strings (unlike Settings-path ProfileBinding keys): do **not** prohibit `__proto__` or trim authored IDs. Empty/whitespace-only ID can be rejected locally but values sent to Host must otherwise be byte-for-byte unchanged.
- A single Save dispatches **one** mutation: single changed field uses the matching leaf setter; multiple changed fields use replace; deletion has its own confirmation. A delete does not delete or rewrite referring ProfileBinding records.
- On `applied+fresh`, close the draft and consume fresh B1-3 read state. `applied+degraded` retains a blocked draft, warns that write succeeded, and forbids double submission. Conflict/stale and transport Unknown retain blocked drafts; Unknown **never** becomes applied by comparing read-back content. Correctable validation errors retain editable draft only while its original Stamp stays current.
- Single-flight belongs to Resource Controller, not to the UI. Use the existing React-free presentation/store conventions, B1-2 Renderer hooks and retained UI bridge. Avoid package-local React subscription.

## Implementation seams

- New `src/client/resource-editor.ts`: pure projection, draft validation, basis checks, mutation command selection and notice/result classification.
- New `src/client/resource-drawer.ts`: Resource tab UI with list, targeted document, create/edit/delete forms and semantics.
- `src/client/presentation-store.ts`: additive local Resource draft, pane and selection actions. Preserve Profile editor behavior/lifecycle.
- `src/client/plugin.ts`: narrow mounted tab navigation between existing Profile Drawer and new Resource Drawer.
- `src/client/locales.ts`, `src/client/plugin.module.css`: bilingual labels and existing token-based styling only.
- New strictly executed `tests/client-resource-editor.test.ts`; extend existing real DSH renderer/packed tests to cover the Resource tab. Wire the TS/Node test into existing strict type and CLI test scripts. Profile/Host/Remote/Controller production modules remain untouched unless a confirmed regression demands a minimal fix.

## Gate and acceptance

Published upstream preflight is already established at M7B1-2/B1-3/B2-B1 and must be demonstrated again through a retained Renderer runtime probe in this slice. One Draft PR, strictly typed RED -> GREEN UI/draft tests, concrete published SlotCore/Renderer runtime evidence, Quick CI; strict source review (P1/P2 remediation), Ready for Full qualification on exact HEAD, final review, merge, independent main CI. Cases include exact content round trip; optional description absent vs empty; one-RPC Save; Create duplicate/invalid; ABA same id+revision different incarnation; Profile instance change with same Resource source; Source change; late mutation; transport Unknown without retry; applied+degraded; delete dangling ProfileBinding; tab/close preserved drafts and disposal; responsive real Renderer.
