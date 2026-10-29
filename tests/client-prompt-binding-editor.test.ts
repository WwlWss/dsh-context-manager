import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createContextManagerPresentationStore } from '../src/client/presentation-store.js'
import {
  parsePromptBindingOrder,
  sortedPromptBindings,
  validatePromptBindingCreate,
  createdPromptBindingInput,
  promptBindingEditChanged,
  promptBindingResourceHealth,
  promptBindingPlacementHealth,
  blockForPromptBindingResult,
} from '../src/client/prompt-binding-editor.js'
import type { ContextManagerRemoteProfile } from '../src/remote/types.js'
import type { ContextManagerClientSnapshot } from '../src/client/model-types.js'
import type { ContextManagerClientProfileMutationBasis } from '../src/client/mutation-types.js'

const BASIS: ContextManagerClientProfileMutationBasis = Object.freeze({
  instanceId: 'm8a2-host-A', revision: 7,
})

/** Compile-time boundary for planned DSH defineStore actions; no loose any or TypeScript suppression. */
interface ExpectedPromptBindingPresentationActions {
  beginPromptBindingCreate(input: {
    profileId: string
    basis: ContextManagerClientProfileMutationBasis
  }): void
  updatePromptBindingCreate(
    field: 'bindingId' | 'resourceId' | 'enabled' | 'placement' | 'orderText',
    value: string | boolean,
  ): void
  beginPromptBindingFieldEdit(input: {
    profileId: string
    bindingId: string
    field: 'resourceId' | 'enabled' | 'placement' | 'order'
    original: string | boolean | number
    basis: ContextManagerClientProfileMutationBasis
  }): void
  updatePromptBindingField(value: string | boolean): void
  beginPromptBindingDelete(input: {
    profileId: string
    bindingId: string
    basis: ContextManagerClientProfileMutationBasis
  }): void
  blockPromptBindingDraft(token: number, reason: 'unknown' | 'conflict' | 'stale' | 'unverified'): void
}

/** Safe partial capability probe while the new actions are deliberately absent (RED). */
function proposedActions(actions: object): Partial<ExpectedPromptBindingPresentationActions> {
  return actions as Partial<ExpectedPromptBindingPresentationActions>
}

type ObservedDraft = {
  kind: string
  token: number
  basis: ContextManagerClientProfileMutationBasis
  profileId: string
  bindingId?: string
  resourceId?: string
  field?: string
  value?: string | boolean | number
  blocked?: string
}

/** The runtime assertions, rather than casts, decide whether implementation exists. */
function bindingDraft(store: ReturnType<ReturnType<typeof createContextManagerPresentationStore>['create']>): ObservedDraft {
  const candidate: unknown = store.getSnapshot().draft
  assert.ok(candidate !== null && typeof candidate === 'object')
  assert.ok('kind' in candidate && typeof candidate.kind === 'string')
  assert.ok('token' in candidate && typeof candidate.token === 'number')
  assert.ok('basis' in candidate && typeof candidate.basis === 'object')
  assert.ok('profileId' in candidate && typeof candidate.profileId === 'string')
  return candidate as ObservedDraft
}

test('M8A2 RED: one shared Profile draft slot accepts exact Binding create and preserves it on close', () => {
  const store = createContextManagerPresentationStore().create()
  const actions = proposedActions(store.actions)
  assert.equal(typeof actions.beginPromptBindingCreate, 'function',
    'M8A2 must add a Profile-scoped Binding draft action; feature is intentionally absent at RED')
  store.actions.selectProfile('main')
  actions.beginPromptBindingCreate?.({ profileId: 'main', basis: BASIS })
  const draft = bindingDraft(store)
  assert.equal(draft.kind, 'prompt-binding-create')
  assert.deepEqual(draft.basis, BASIS)
  assert.equal(typeof actions.updatePromptBindingCreate, 'function')
  actions.updatePromptBindingCreate?.('bindingId', '  exact  ')
  actions.updatePromptBindingCreate?.('resourceId', '__proto__')
  assert.equal(bindingDraft(store).bindingId, '  exact  ')
  assert.equal(bindingDraft(store).resourceId, '__proto__')
  store.actions.close()
  store.actions.open()
  assert.equal(bindingDraft(store).token, draft.token)
  store.actions.selectProfile('other')
  store.actions.selectPane('resources')
  assert.equal(store.getSnapshot().selectedProfileId, 'main')
  assert.equal(store.getSnapshot().pane, 'profiles')
  store.actions.cancelDraft()
  store.actions.selectPane('resources')
  assert.equal(store.getSnapshot().pane, 'resources')
})

test('M8A2 RED: Binding leaf draft remains blocked after unknown and cannot be replaced by late actions', () => {
  const store = createContextManagerPresentationStore().create()
  const actions = proposedActions(store.actions)
  assert.equal(typeof actions.beginPromptBindingFieldEdit, 'function')
  assert.equal(typeof actions.blockPromptBindingDraft, 'function')
  store.actions.selectProfile('main')
  actions.beginPromptBindingFieldEdit?.({
    profileId: 'main', bindingId: 'p',
    field: 'resourceId', original: 'missing-1', basis: BASIS,
  })
  const first = bindingDraft(store)
  assert.equal(first.kind, 'prompt-binding-edit-field')
  assert.equal(first.field, 'resourceId')
  assert.equal(typeof actions.updatePromptBindingField, 'function')
  actions.updatePromptBindingField?.('missing-2')
  assert.equal(bindingDraft(store).value, 'missing-2')
  actions.blockPromptBindingDraft?.(first.token, 'unknown')
  assert.equal(bindingDraft(store).blocked, 'unknown')
  actions.updatePromptBindingField?.('silent-replay')
  assert.equal(bindingDraft(store).value, 'missing-2')
  store.actions.close()
  store.actions.open()
  assert.equal(bindingDraft(store).blocked, 'unknown')
  store.actions.cancelDraft()
  store.actions.completeDraft(first.token, null)
  assert.equal(store.getSnapshot().draft, null)
})

test('M8A2 RED: Binding delete is explicit and mutually exclusive with other Profile drafts', () => {
  const store = createContextManagerPresentationStore().create()
  const actions = proposedActions(store.actions)
  assert.equal(typeof actions.beginPromptBindingDelete, 'function')
  store.actions.selectProfile('main')
  actions.beginPromptBindingDelete?.({ profileId: 'main', bindingId: 'p', basis: BASIS })
  const draft = bindingDraft(store)
  assert.equal(draft.kind, 'prompt-binding-delete')
  assert.equal(draft.bindingId, 'p')
  store.actions.beginCreate(BASIS)
  assert.equal(bindingDraft(store).token, draft.token)
  store.actions.selectPane('resources')
  assert.equal(store.getSnapshot().pane, 'profiles')
  store.actions.cancelDraft()
  assert.equal(store.getSnapshot().draft, null)
  assert.equal(store.getSnapshot().resourceDraft, null)
})

test('M8A2 GREEN: exact Binding IDs, safe decimal orders and complete one-RPC create payload', () => {
  const base = {
    kind: 'prompt-binding-create', token: 1, profileId: 'main', basis: BASIS,
    bindingId: '', resourceId: '__proto__', enabled: true,
    placement: 'before-persona', orderText: '-42',
  } as const
  assert.equal(validatePromptBindingCreate(base, new Set()), 'valid')
  assert.equal(validatePromptBindingCreate({ ...base, bindingId: '  ' }, new Set()), 'valid')
  assert.equal(validatePromptBindingCreate({ ...base, bindingId: 'constructor' }, new Set()), 'valid')
  assert.equal(validatePromptBindingCreate({ ...base, bindingId: '__proto__' }, new Set()), 'unsafe-id')
  assert.equal(validatePromptBindingCreate({ ...base, bindingId: '' }, new Set([''])), 'exists')
  assert.deepEqual(createdPromptBindingInput(base), {
    resourceId: '__proto__', enabled: true, placement: 'before-persona', order: -42,
  })
  assert.equal(parsePromptBindingOrder('+1'), 1)
  assert.equal(parsePromptBindingOrder('-0'), 0)
  assert.equal(parsePromptBindingOrder(String(Number.MIN_SAFE_INTEGER)), Number.MIN_SAFE_INTEGER)
  assert.equal(parsePromptBindingOrder(String(Number.MAX_SAFE_INTEGER)), Number.MAX_SAFE_INTEGER)
  for (const raw of ['', ' ', '1.2', '1e3', 'NaN', 'Infinity',
    String(Number.MAX_SAFE_INTEGER + 1), String(Number.MIN_SAFE_INTEGER - 1)]) {
    assert.equal(parsePromptBindingOrder(raw), undefined, JSON.stringify(raw))
    assert.equal(validatePromptBindingCreate({ ...base, orderText: raw }, new Set()), 'invalid-order')
  }
})

test('M8A2 GREEN: order then exact code-unit Binding ID, no rewriting or normalization', () => {
  const profile: ContextManagerRemoteProfile = {
    name: 'Main', basePreset: 'native', skills: {},
    prompts: {
      z: { resourceId: 'shared', enabled: true, placement: 'after-persona', order: -1 },
      b: { resourceId: 'shared', enabled: true, placement: 'after-persona', order: 0 },
      a: { resourceId: 'missing', enabled: false, placement: 'runtime-context', order: 0 },
      A: { resourceId: 'shared', enabled: true, placement: 'after-persona', order: 0 },
    },
  }
  assert.deepEqual(sortedPromptBindings(profile).map(([id]) => id), ['z', 'A', 'a', 'b'])
  assert.deepEqual(Object.keys(profile.prompts), ['z', 'b', 'a', 'A'])
  const editedOrder = {
    kind: 'prompt-binding-edit-field', token: 2, basis: BASIS, profileId: 'main',
    bindingId: 'a', field: 'order', original: 0, value: '00',
  } as const
  assert.equal(promptBindingEditChanged(editedOrder), false)
  assert.equal(promptBindingEditChanged({ ...editedOrder, value: '-1' }), true)
  assert.equal(promptBindingEditChanged({ ...editedOrder, value: '' }), false)
})

test('M8A2 GREEN: resource metadata and global placement are advisory, unverified is not missing', () => {
  const snapshot: ContextManagerClientSnapshot = {
    attachment: 'attached',
    protocol: { status: 'compatible', apiVersion: 3 },
    sync: { status: 'idle' },
    profiles: { status: 'idle', stale: false },
    presets: { status: 'idle', stale: false },
    promptPlacement: {
      status: 'ready', stale: false,
      data: {
        status: 'available',
        placements: {
          'before-persona': 'system-prompt',
          'after-persona': 'system-prompt',
          'before-tool-guidance': 'system-prompt',
          'after-tool-guidance': 'system-prompt',
          'runtime-context': 'runtime-context',
        },
      },
    },
    resources: {
      list: { status: 'ready', stale: false, data: [
        { status: 'usable', id: 'known', name: 'Known', revision: 1, incarnationId: null },
        { status: 'invalid', id: 'broken', message: 'Invalid record' },
      ] },
      documents: new Map(),
    },
    diagnostics: { sessions: new Map(), prompts: new Map(), skills: new Map(), pinned: new Map() },
  }
  assert.equal(promptBindingResourceHealth(snapshot, 'known'), 'usable')
  assert.equal(promptBindingResourceHealth(snapshot, 'broken'), 'invalid')
  assert.equal(promptBindingResourceHealth(snapshot, 'missing'), 'missing')
  assert.equal(promptBindingResourceHealth({
    ...snapshot, resources: { ...snapshot.resources,
      list: { ...snapshot.resources.list, stale: true },
    },
  }, 'missing'), 'unverified')
  assert.equal(promptBindingPlacementHealth(snapshot, 'after-persona'), 'available')
  assert.equal(promptBindingPlacementHealth({
    ...snapshot, promptPlacement: { status: 'ready', stale: false, data: { status: 'unavailable' } },
  }, 'runtime-context'), 'unavailable')
  assert.equal(promptBindingPlacementHealth({
    ...snapshot, promptPlacement: { ...snapshot.promptPlacement, stale: true },
  }, 'runtime-context'), 'unverified')
})

test('M8A2 GREEN: confirmed-degraded, uncertain and conflicting outcomes block exact old drafts', () => {
  assert.equal(blockForPromptBindingResult({ status: 'applied', refresh: 'fresh' }), undefined)
  assert.equal(blockForPromptBindingResult({ status: 'applied', refresh: 'degraded' }), 'unverified')
  assert.equal(blockForPromptBindingResult({
    status: 'unknown', refresh: 'fresh',
    error: { kind: 'call-rejected', message: 'lost reply' },
  }), 'unknown')
  assert.equal(blockForPromptBindingResult({
    status: 'rejected', refresh: 'fresh',
    error: { kind: 'business', code: 'host-instance-conflict', message: 'swapped' },
  }), 'conflict')
  assert.equal(blockForPromptBindingResult({
    status: 'rejected', refresh: 'not-requested',
    error: { kind: 'business', code: 'prompt-binding-not-found', message: 'missing' },
  }), 'stale')
  assert.equal(blockForPromptBindingResult({
    status: 'rejected', refresh: 'not-requested',
    error: { kind: 'business', code: 'invalid-prompt-order', message: 'bad order' },
  }), undefined)
  assert.equal(blockForPromptBindingResult({ status: 'superseded' }), 'stale')
})

test('M8A2 Fix RED: blocked Binding terminal notice survives forbidden navigation and late read failure', () => {
  for (const [blocked, code] of [
    ['unknown', 'noticeOutcomeUnknown'],
    ['conflict', 'noticeConflict'],
    ['unverified', 'noticeSavedDegraded'],
  ] as const) {
    const store = createContextManagerPresentationStore().create()
    store.actions.selectProfile('main')
    store.actions.beginPromptBindingFieldEdit({
      profileId: 'main', bindingId: 'p',
      field: 'enabled', original: true, basis: BASIS,
    })
    const token = bindingDraft(store).token
    store.actions.blockDraft(token, blocked, { code, kind: 'warning', detail: 'original result' })
    store.actions.selectPane('resources')
    store.actions.selectProfile('other')
    store.actions.setNotice({ code: 'noticeRefreshFailed', kind: 'error' })
    assert.equal(store.getSnapshot().pane, 'profiles')
    assert.equal(store.getSnapshot().selectedProfileId, 'main')
    assert.equal(store.getSnapshot().draft?.blocked, blocked)
    assert.equal(store.getSnapshot().notice?.code, code, blocked + ': terminal result must survive')
    assert.equal(store.getSnapshot().notice?.detail, 'original result')
    store.actions.cancelDraft()
    store.actions.selectPane('resources')
    assert.equal(store.getSnapshot().pane, 'resources')
  }
})
