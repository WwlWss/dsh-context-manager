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
    protocol: { status: 'compatible', apiVersion: 2 },
    sync: { status: 'idle' },
    instanceId: 'host-a',
    changes: {
      instanceId: 'host-a',
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
  store.actions.updateField('Changed')
  store.actions.close()
  store.actions.open()
  assert.equal(store.getSnapshot().draft?.kind, 'edit-field')
  store.actions.selectProfile('other')
  assert.equal(store.getSnapshot().selectedProfileId, 'main')
  assert.equal(store.getSnapshot().notice?.code, 'noticeDraftActive')
  store.actions.cancelDraft()
  store.actions.selectProfile('other')
  assert.equal(store.getSnapshot().selectedProfileId, 'other')
})

test('DSH presentation store blocks uncertain replay, and older completions cannot clear newer drafts', () => {
  const store = createContextManagerPresentationStore().create()
  store.actions.beginCreate(BASIS)
  const firstToken = store.getSnapshot().draft?.token
  assert.ok(firstToken)
  store.actions.updateCreate('id', 'new')
  store.actions.blockDraft(firstToken, 'unknown', { code: 'noticeOutcomeUnknown', kind: 'warning' })
  assert.equal(store.getSnapshot().draft?.blocked, 'unknown')
  store.actions.updateCreate('id', 'illegal-retry')
  assert.equal(store.getSnapshot().draft?.kind, 'create')
  if (store.getSnapshot().draft?.kind === 'create') {
    assert.equal(store.getSnapshot().draft.id, 'new')
  }
  store.actions.cancelDraft()
  store.actions.beginCreate(BASIS)
  const second = store.getSnapshot().draft
  assert.ok(second && second.token !== firstToken)
  store.actions.completeDraft(firstToken, { code: 'noticeSaved', kind: 'success' }, 'wrong')
  assert.equal(store.getSnapshot().draft?.token, second.token)
  store.actions.completeDraft(second.token, { code: 'noticeSaved', kind: 'success' }, 'new')
  assert.equal(store.getSnapshot().draft, null)
  assert.equal(store.getSnapshot().selectedProfileId, 'new')
})
