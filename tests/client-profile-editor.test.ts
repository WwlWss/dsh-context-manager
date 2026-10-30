import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  blockForMutationResult,
  createdProfileInput,
  editValueChanged,
  noticeForMutationResult,
  validateCreateDraft,
  type ProfileDraft,
} from '../src/client/profile-editor.js'
import {
  deriveProfileView,
  isProfileBeginCurrent,
  isProfileDraftCurrent,
  resolveProfilePreset,
} from '../src/client/profile-view.js'
import { createContextManagerPresentationStore } from '../src/client/presentation-store.js'
import type { ContextManagerClientSnapshot } from '../src/client/model-types.js'
import type {
  ContextManagerClientProfileMutationBasis,
  ContextManagerClientProfileMutationResult,
} from '../src/client/mutation-types.js'

const BASIS: ContextManagerClientProfileMutationBasis = Object.freeze({
  instanceId: 'host-a', revision: 7,
})

function exampleSnapshot(): ContextManagerClientSnapshot {
  return {
    attachment: 'attached',
    protocol: { status: 'compatible', apiVersion: 3 },
    sync: { status: 'idle' },
    instanceId: 'host-a',
    changes: {
      instanceId: 'host-a',
      resourceAuthorityId: null,
      generation: 1,
      profiles: 1,
      promptResources: 0,
      presets: 1,
      runtime: 1,
    },
    profiles: {
      status: 'ready',
      stale: false,
      data: {
        schemaVersion: 1,
        schemaCompatible: true,
        configuredDefaultProfileId: 'main',
        usableDefaultProfileId: 'main',
        profiles: {
          main: { name: 'Main', description: 'Original', basePreset: 'native', skills: {}, prompts: {} },
          other: { name: 'Other', basePreset: 'lost', skills: {}, prompts: {} },
        },
        diagnostics: [
          { code: 'invalid-profile', profileId: 'broken', message: 'not an object' },
        ],
        persistence: { available: true, registered: true, writable: true, revision: 7 },
      },
    },
    presets: {
      status: 'ready',
      stale: false,
      data: {
        directory: {
          status: 'available',
          defaultId: 'native',
          authorable: false,
          presets: [{ id: 'native', trust: 'system', isDefault: true }],
        },
        profiles: {
          main: { basePreset: { status: 'resolved', configuredId: 'native' } },
          other: { basePreset: { status: 'missing', configuredId: 'lost' } },
        },
      },
    },
    promptPlacement: { status: 'idle', stale: false },
    resources: { list: { status: 'idle', stale: false }, documents: new Map() },
    diagnostics: { sessions: new Map(), prompts: new Map(), skills: new Map(), pinned: new Map() },
  }
}

test('profile read-only projection includes invalid stored rows without treating them as editable Domain objects', () => {
  const snapshot = exampleSnapshot()
  const view = deriveProfileView(snapshot, null)
  assert.deepEqual(view.rows.map(row => row.id), ['main', 'broken', 'other'])
  assert.equal(view.selectedId, 'main')
  assert.equal(view.writable, true)
  assert.equal(view.rows.find(row => row.id === 'broken')?.kind, 'invalid')
  assert.equal(view.rows.find(row => row.id === 'broken')?.profile, undefined)
  assert.equal(deriveProfileView(snapshot, 'broken').selected?.kind, 'invalid')
  assert.equal(resolveProfilePreset(snapshot, 'main'), 'resolved')
  assert.equal(resolveProfilePreset(snapshot, 'other'), 'missing')
})

test('stale, mismatched authority, unavailable persistence and incompatible schema disable editing', () => {
  const snapshot = exampleSnapshot()
  assert.equal(deriveProfileView({
    ...snapshot, profiles: { ...snapshot.profiles, stale: true },
  }, null).writable, false)
  assert.equal(deriveProfileView({
    ...snapshot, instanceId: 'new-host',
  }, null).writable, false)
  assert.equal(deriveProfileView({
    ...snapshot,
    profiles: { ...snapshot.profiles, data: {
      ...snapshot.profiles.data!,
      persistence: { available: true, registered: true, writable: false, revision: 7 },
    } },
  }, null).writable, false)
  const incompatible = deriveProfileView({
    ...snapshot,
    profiles: { ...snapshot.profiles, data: {
      ...snapshot.profiles.data!,
      schemaCompatible: false,
      profiles: {},
    } },
  }, null)
  assert.equal(incompatible.writable, false)
  assert.equal(incompatible.rows.length, 0)
  assert.equal(resolveProfilePreset({
    ...snapshot, presets: { ...snapshot.presets, stale: true },
  }, 'main'), 'unverified')
})

test('failed, stale and loading surfaces retain cached rows only for read-only inspection', () => {
  const original = exampleSnapshot()
  const states = [
    { status: 'error' as const, stale: true, data: original.profiles.data,
      error: { kind: 'remote' as const, code: 'TEMPORARY', message: 'read failed' } },
    { status: 'loading' as const, stale: true, data: original.profiles.data },
    { status: 'ready' as const, stale: true, data: original.profiles.data },
  ]
  for (const profiles of states) {
    const view = deriveProfileView({ ...original, profiles }, null)
    assert.deepEqual(view.rows.map(row => row.id), ['main', 'broken', 'other'])
    assert.equal(view.canRead, true)
    assert.equal(view.writable, false)
    assert.equal(view.selectedId, 'main')
  }
  const detached = deriveProfileView({
    ...original, attachment: 'detached',
    profiles: states[0],
  }, null)
  assert.equal(detached.rows.length, 3)
  assert.equal(detached.writable, false)
})

test('basis is the captured instanceId and Settings revision, not the change cursor', () => {
  const draft: ProfileDraft = {
    kind: 'edit-field', token: 12, profileId: 'main',
    field: 'name', original: 'Main', value: 'Next',
    removeDescription: false, basis: BASIS,
  }
  const snapshot = exampleSnapshot()
  assert.equal(isProfileDraftCurrent(snapshot, draft), true)
  assert.equal(isProfileDraftCurrent({
    ...snapshot,
    changes: { ...snapshot.changes!, profiles: 989898 },
  }, draft), true)
  assert.equal(isProfileDraftCurrent({
    ...snapshot,
    profiles: {
      ...snapshot.profiles,
      data: { ...snapshot.profiles.data!, persistence: {
        ...snapshot.profiles.data!.persistence,
        revision: 8,
      } },
    },
  }, draft), false)
  assert.equal(isProfileDraftCurrent({ ...snapshot, instanceId: 'other-host' }, draft), false)
})

test('create input is atomic, validation disallows unsafe/duplicate IDs, and optional description stays absent', () => {
  const draft = {
    kind: 'create', token: 1, basis: BASIS,
    id: 'new', name: 'New', basePreset: 'missing-native', description: '',
  } as const satisfies ProfileDraft
  assert.equal(validateCreateDraft(draft, new Set(['existing'])), 'valid')
  assert.equal(validateCreateDraft({ ...draft, id: 'existing' }, new Set(['existing'])), 'exists')
  assert.equal(validateCreateDraft({ ...draft, id: '__proto__' }, new Set()), 'unsafe-id')
  assert.equal(validateCreateDraft({ ...draft, id: '   ' }, new Set()), 'missing-id')
  assert.deepEqual(createdProfileInput(draft), {
    name: 'New', basePreset: 'missing-native', skills: {}, prompts: {},
  })
  assert.equal(createdProfileInput({ ...draft, description: 'Details' }).description, 'Details')
})

test('edit field checks one write only and preserves empty-string versus absence semantics', () => {
  const base = {
    kind: 'edit-field', token: 4, profileId: 'main',
    field: 'description', basis: BASIS,
    original: 'Hello', value: '', removeDescription: false,
  } as const satisfies ProfileDraft
  assert.equal(editValueChanged(base), true)
  assert.equal(editValueChanged({ ...base, value: 'Hello' }), false)
  assert.equal(editValueChanged({ ...base, removeDescription: true }), true)
  assert.equal(editValueChanged({ ...base, original: undefined, removeDescription: true }), false)
  assert.equal(editValueChanged({ ...base, original: undefined, removeDescription: false }), true)
})

test('classifies success, conflict, precondition, uncertain transport and obsolete lifecycle separately', () => {
  const success: ContextManagerClientProfileMutationResult = { status: 'applied', refresh: 'fresh' }
  const degraded: ContextManagerClientProfileMutationResult = { status: 'applied', refresh: 'degraded' }
  const conflict: ContextManagerClientProfileMutationResult = {
    status: 'rejected', refresh: 'fresh',
    error: { kind: 'business', code: 'profile-conflict', message: 'changed' },
  }
  const stale: ContextManagerClientProfileMutationResult = {
    status: 'rejected', refresh: 'not-requested',
    error: { kind: 'precondition', code: 'profile-basis-stale', message: 'old' },
  }
  const unknown: ContextManagerClientProfileMutationResult = {
    status: 'unknown', refresh: 'degraded',
    error: { kind: 'call-rejected', message: 'lost response' },
  }
  assert.equal(noticeForMutationResult(success)?.code, 'noticeSaved')
  assert.equal(noticeForMutationResult(degraded)?.code, 'noticeSavedDegraded')
  assert.equal(blockForMutationResult(conflict), 'conflict')
  assert.equal(blockForMutationResult(stale), 'stale')
  assert.equal(blockForMutationResult(unknown), 'unknown')
  assert.equal(noticeForMutationResult(unknown)?.code, 'noticeOutcomeUnknown')
  assert.equal(noticeForMutationResult({ status: 'superseded' }), undefined)
})

test('DSH presentation store retains drafts across overlay close/reopen and guards a new selection', () => {
  const store = createContextManagerPresentationStore().create()
  store.actions.open()
  store.actions.beginFieldEdit({ profileId: 'main', field: 'name', original: 'Main', basis: BASIS })
  const draft = store.getSnapshot().draft
  assert.equal(draft?.kind, 'edit-field')
  assert.deepEqual(draft?.basis, BASIS)
  store.actions.updateField(draft!.token, 'Changed')
  store.actions.close()
  store.actions.open()
  assert.equal(store.getSnapshot().draft?.kind, 'edit-field')
  store.actions.selectProfile('other')
  assert.equal(store.getSnapshot().selectedProfileId, 'main')
  assert.equal(store.getSnapshot().notice?.code, 'noticeDraftActive')
  store.actions.cancelDraft(draft!.token)
  store.actions.selectProfile('other')
  assert.equal(store.getSnapshot().selectedProfileId, 'other')
})

test('DSH presentation store blocks uncertain replay, and older completions cannot clear newer drafts', () => {
  const store = createContextManagerPresentationStore().create()
  store.actions.open()
  store.actions.beginCreate(BASIS)
  const firstToken = store.getSnapshot().draft?.token
  assert.ok(firstToken)
  store.actions.updateCreate(firstToken, 'id', 'new')
  store.actions.blockDraft(firstToken, 'unknown', { code: 'noticeOutcomeUnknown', kind: 'warning' })
  assert.equal(store.getSnapshot().draft?.blocked, 'unknown')
  store.actions.updateCreate(firstToken, 'id', 'illegal-retry')
  assert.equal(store.getSnapshot().draft?.kind, 'create')
  const blockedDraft = store.getSnapshot().draft
  if (blockedDraft?.kind === 'create') {
    assert.equal(blockedDraft.id, 'new')
  }
  store.actions.discardBlockedDraft(firstToken)
  store.actions.beginCreate(BASIS)
  const second = store.getSnapshot().draft
  assert.ok(second && second.token !== firstToken)
  store.actions.completeDraft(firstToken, { code: 'noticeSaved', kind: 'success' }, 'wrong')
  assert.equal(store.getSnapshot().draft?.token, second.token)
  store.actions.completeDraft(second.token, { code: 'noticeSaved', kind: 'success' }, 'new')
  assert.equal(store.getSnapshot().draft, null)
  assert.equal(store.getSnapshot().selectedProfileId, 'new')
})


test('M7C final Strict GREEN: first blocked Profile terminal receipt survives late UI actions', () => {
  for (const { reason, code } of [
    { reason: 'unknown', code: 'noticeOutcomeUnknown' },
    { reason: 'conflict', code: 'noticeConflict' },
  ] as const) {
    const store = createContextManagerPresentationStore().create()
    const a = store.actions
    a.open()
    a.beginFieldEdit({ profileId: 'main', field: 'name', original: 'Original', basis: BASIS })
    const first = store.getSnapshot().draft
    assert.ok(first?.kind === 'edit-field')
    const notice = { code, kind: 'warning', detail: 'immutable original receipt' } as const
    a.blockDraft(first.token, reason, notice)
    a.selectPane('resources')
    a.selectProfile('other')
    a.beginCreate(BASIS)
    a.setNotice({ code: 'noticeUnavailable', kind: 'warning' })
    a.blockDraft(first.token, 'stale', { code: 'noticeDraftStale', kind: 'warning' })
    a.completeDraft(first.token, { code: 'noticeSaved', kind: 'success' }, 'wrong-profile')
    const after = store.getSnapshot()
    assert.equal(after.draft?.token, first.token, reason + ': blocked draft retained')
    assert.equal(after.draft?.blocked, reason)
    assert.deepEqual(after.notice, notice, reason + ': original detail must remain')
    assert.equal(after.pane, 'profiles')
    assert.equal(after.selectedProfileId, 'main')
    a.discardBlockedDraft(first.token)
    assert.equal(store.getSnapshot().draft, null)
  }
})

test('M8A2 Fix4: Profile Begin compares rendered Settings revision and exact usable/invalid targets', () => {
  const rendered = exampleSnapshot()
  const main = deriveProfileView(rendered, 'main').selected
  const invalid = deriveProfileView(rendered, 'broken').selected
  assert.ok(main?.kind === 'usable')
  assert.ok(invalid?.kind === 'invalid')
  assert.equal(isProfileBeginCurrent(rendered, BASIS), true)
  assert.equal(isProfileBeginCurrent(rendered, BASIS, main, 'name', 'Main'), true)
  assert.equal(isProfileBeginCurrent(rendered, BASIS, main, 'name', 'stale original'), false)
  assert.equal(isProfileBeginCurrent(rendered, BASIS, invalid), true,
    'invalid Profile diagnostic must remain an eligible explicit Delete target')
  assert.equal(isProfileBeginCurrent(rendered, BASIS, invalid, 'name', 'value'), false)
  assert.equal(isProfileBeginCurrent(rendered, { ...BASIS, revision: BASIS.revision + 1 }, main), false)
  assert.equal(isProfileBeginCurrent(rendered, { ...BASIS, instanceId: 'other-host' }, main), false)
  assert.equal(isProfileBeginCurrent({
    ...rendered,
    changes: { ...rendered.changes!, resourceAuthorityId: 'unrelated-resource-rotation' },
  }, BASIS, main), true, 'unrelated Resource authority cannot stale Profile Begin')
  const data = rendered.profiles.data!
  const rehydrated = {
    ...rendered,
    profiles: {
      ...rendered.profiles, data: {
        ...data, profiles: {
          ...data.profiles, main: { ...data.profiles.main },
        },
      },
    },
  }
  const newRow = deriveProfileView(rehydrated, 'main').selected
  assert.ok(newRow?.kind === 'usable')
  assert.equal(isProfileBeginCurrent(rehydrated, BASIS, newRow, 'name', 'Main'), true)
  assert.equal(isProfileBeginCurrent(rehydrated, BASIS, main), false,
    'a rendered row must come from the snapshot used in the Begin fence')
})


// M8B B1-2a executable behavioral RED. A retained Begin callback from the
// previously open Drawer must not occupy an invisible draft after Close.
// Invoke the REAL published Presentation Store actions; do not mock their
// behavior or treat an import/TypeScript error as meaningful RED evidence.
type B1ClosedBeginStore = ReturnType<ReturnType<typeof createContextManagerPresentationStore>['create']>
const B1_RESOURCE_STAMP = Object.freeze({
  instanceId: 'm8b-profile-instance', resourceAuthorityId: 'm8b-library',
  resourceId: 'exact', incarnationId: 'incarnation', revision: 3,
  source: 'document' as const,
})
const B1_RESOURCE_DOCUMENT = Object.freeze({
  id: 'exact', name: 'Stored', description: 'Exact',
  content: 'body\n', incarnationId: 'incarnation', revision: 3,
})
const b1ClosedBeginProbes: Array<{
  name: string
  pane: 'profiles' | 'resources'
  begin: (store: B1ClosedBeginStore) => void
}> = [
  { name: 'M7C Profile create', pane: 'profiles',
    begin: s => s.actions.beginCreate(BASIS) },
  { name: 'M7C Profile field edit', pane: 'profiles',
    begin: s => s.actions.beginFieldEdit({
      profileId: 'main', field: 'name', original: 'Main', basis: BASIS,
    }) },
  { name: 'M7C Profile delete', pane: 'profiles',
    begin: s => s.actions.beginDelete('main', BASIS) },
  { name: 'M8A2 PromptBinding create', pane: 'profiles',
    begin: s => s.actions.beginPromptBindingCreate({ profileId: 'main', basis: BASIS }) },
  { name: 'M8A2 PromptBinding edit', pane: 'profiles',
    begin: s => s.actions.beginPromptBindingFieldEdit({
      profileId: 'main', bindingId: 'binding', field: 'enabled',
      original: true, basis: BASIS,
    }) },
  { name: 'M8A2 PromptBinding delete', pane: 'profiles',
    begin: s => s.actions.beginPromptBindingDelete({
      profileId: 'main', bindingId: 'binding', basis: BASIS,
    }) },
  { name: 'M8A1 Resource create', pane: 'resources',
    begin: s => s.actions.beginResourceCreate({ resourceAuthorityId: 'm8b-library' }) },
  { name: 'M8A1 Resource edit', pane: 'resources',
    begin: s => s.actions.beginResourceEdit(B1_RESOURCE_DOCUMENT, B1_RESOURCE_STAMP) },
  { name: 'M8A1 Resource delete', pane: 'resources',
    begin: s => s.actions.beginResourceDelete('exact', 'Stored', B1_RESOURCE_STAMP) },
]

for (const probe of b1ClosedBeginProbes) {
  test('M8B B1-2a RED: closed Drawer forbids ' + probe.name + ' Begin without hidden draft or notice', () => {
    const store = createContextManagerPresentationStore().create()
    store.actions.open()
    if (probe.pane === 'resources') {
      store.actions.selectPane('resources')
      store.actions.selectResource('exact')
    } else {
      store.actions.selectProfile('main')
    }
    // Capture the actual stale callback before Close, not a fresh after-Close
    // callback that the real React UI would normally stop rendering.
    const retainedBegin = () => probe.begin(store)
    store.actions.close()
    const before = store.getSnapshot()
    assert.equal(before.open, false)
    assert.equal(before.draft, null)
    assert.equal(before.resourceDraft, null)

    retainedBegin()
    const after = store.getSnapshot()
    assert.equal(after.open, false)
    assert.equal(after.draft, null, 'closed Begin may not create a hidden Profile draft')
    assert.equal(after.resourceDraft, null, 'closed Begin may not create a hidden Resource draft')
    assert.equal(after.nextDraftToken, before.nextDraftToken,
      'closed Begin must not consume a Profile token')
    assert.equal(after.nextResourceDraftToken, before.nextResourceDraftToken,
      'closed Begin must not consume a Resource token')
    assert.equal(after.selectedProfileId, before.selectedProfileId)
    assert.equal(after.selectedResourceId, before.selectedResourceId)
    assert.deepEqual(after.notice, before.notice,
      'closed Begin may not leave a misleading Draft Active warning for reopen')
    assert.deepEqual(after.resourceNotice, before.resourceNotice)

    // A new genuine Begin after explicit Reopen remains permitted. This
    // positive case does not claim old React closures are safe after Reopen:
    // that is a distinct B1 session-epoch behavioral RED.
    store.actions.open()
    probe.begin(store)
    assert.equal(store.getSnapshot().open, true)
    assert.ok(
      probe.pane === 'profiles' ? store.getSnapshot().draft !== null
        : store.getSnapshot().resourceDraft !== null,
      'the open Drawer must still permit the normal Begin path',
    )
  })
}

test('M8B B1-2a control: closing an existing Profile or Resource draft keeps token and first terminal receipt', () => {
  const profile = createContextManagerPresentationStore().create()
  profile.actions.open()
  profile.actions.beginFieldEdit({
    profileId: 'main', field: 'name', original: 'Main', basis: BASIS,
  })
  const existingProfile = profile.getSnapshot().draft
  assert.ok(existingProfile !== null)
  profile.actions.blockDraft(existingProfile.token, 'unknown', {
    code: 'noticeOutcomeUnknown', kind: 'warning', detail: 'original Host receipt',
  })
  profile.actions.close()
  const retainedProfile = profile.getSnapshot().draft
  assert.equal(retainedProfile?.token, existingProfile.token)
  profile.actions.beginCreate(BASIS)
  assert.equal(profile.getSnapshot().draft?.token, existingProfile.token)
  assert.equal(profile.getSnapshot().notice?.detail, 'original Host receipt')
  profile.actions.open()
  assert.equal(profile.getSnapshot().draft?.token, existingProfile.token)
  profile.actions.discardBlockedDraft(existingProfile.token)
  profile.actions.beginCreate(BASIS)
  assert.equal(profile.getSnapshot().draft?.kind, 'create')

  const resource = createContextManagerPresentationStore().create()
  resource.actions.open()
  resource.actions.selectPane('resources')
  resource.actions.beginResourceCreate({ resourceAuthorityId: 'm8b-library' })
  const existingResource = resource.getSnapshot().resourceDraft
  assert.ok(existingResource !== null)
  resource.actions.blockResourceDraft(existingResource.token, 'unknown', {
    code: 'resourceNoticeUnknown', kind: 'warning', detail: 'original Resource receipt',
  })
  resource.actions.close()
  resource.actions.beginResourceEdit(B1_RESOURCE_DOCUMENT, B1_RESOURCE_STAMP)
  assert.equal(resource.getSnapshot().resourceDraft?.token, existingResource.token)
  assert.equal(resource.getSnapshot().resourceNotice?.detail, 'original Resource receipt')
  resource.actions.open()
  assert.equal(resource.getSnapshot().resourceDraft?.token, existingResource.token)
  resource.actions.discardBlockedResourceDraft(existingResource.token)
  resource.actions.beginResourceCreate({ resourceAuthorityId: 'm8b-library' })
  assert.equal(resource.getSnapshot().resourceDraft?.kind, 'create')
})


test('M8B F01-SR1 RED: real root Store advances only on a newly opened Drawer session', () => {
  const store = createContextManagerPresentationStore().create()
  // Read as an optional test observation so B1 RED is a behavioral assertion,
  // not a missing-field or TypeScript compile failure before the production fix.
  const getEpoch = () => (store.getSnapshot() as unknown as { openSessionEpoch?: number }).openSessionEpoch
  assert.equal(getEpoch(), 0, 'the first closed session starts at epoch zero')
  store.actions.open()
  assert.equal(getEpoch(), 1, 'closed-to-open is a new visible session')
  store.actions.open()
  assert.equal(getEpoch(), 1, 'idempotent open must not invalidate live callbacks')
  store.actions.selectProfile('main')
  store.actions.beginFieldEdit({
    profileId: 'main', field: 'name', original: 'Main', basis: BASIS,
  })
  const original = store.getSnapshot().draft
  assert.ok(original)
  store.actions.close()
  assert.equal(getEpoch(), 1, 'close retains epoch and original draft')
  assert.strictEqual(store.getSnapshot().draft, original)
  store.actions.close()
  assert.equal(getEpoch(), 1)
  store.actions.open()
  assert.equal(getEpoch(), 2, 'reopened callbacks need a new epoch')
  assert.strictEqual(store.getSnapshot().draft, original)
  assert.deepEqual(store.getSnapshot().draft?.basis, BASIS)
  store.actions.toggle()
  assert.equal(getEpoch(), 2, 'open-to-closed toggle does not advance session')
  store.actions.toggle()
  assert.equal(getEpoch(), 3, 'closed-to-open toggle must advance session')
  assert.strictEqual(store.getSnapshot().draft, original)
})
