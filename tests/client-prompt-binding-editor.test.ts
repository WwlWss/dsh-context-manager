import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  createContextManagerPresentationStore,
  mayDispatchImmediateProfileWrite,
  ownsLiveProfileDraft,
  readLivePresentationForActions,
} from '../src/client/presentation-store.js'
import {
  parsePromptBindingOrder,
  sortedPromptBindings,
  validatePromptBindingCreate,
  createdPromptBindingInput,
  promptBindingEditChanged,
  promptBindingResourceHealth,
  promptBindingPlacementHealth,
  blockForPromptBindingResult,
  isWritablePromptBindingPath,
  isPromptBindingBeginCurrent,
} from '../src/client/prompt-binding-editor.js'
import type { ContextManagerRemoteProfile } from '../src/remote/types.js'
import type { ContextManagerClientSnapshot } from '../src/client/model-types.js'
import type { ContextManagerClientProfileMutationBasis } from '../src/client/mutation-types.js'

const BASIS: ContextManagerClientProfileMutationBasis = Object.freeze({
  instanceId: 'm8a2-host-A', revision: 7,
})

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

/** Runtime assertion over the real compiled Store; actions are no longer hypothetical Partial RED stubs. */
function bindingDraft(store: ReturnType<ReturnType<typeof createContextManagerPresentationStore>['create']>): ObservedDraft {
  const candidate: unknown = store.getSnapshot().draft
  assert.ok(candidate !== null && typeof candidate === 'object')
  assert.ok('kind' in candidate && typeof candidate.kind === 'string')
  assert.ok('token' in candidate && typeof candidate.token === 'number')
  assert.ok('basis' in candidate && typeof candidate.basis === 'object')
  assert.ok('profileId' in candidate && typeof candidate.profileId === 'string')
  return candidate as ObservedDraft
}

test('M8A2 GREEN: one shared Profile draft slot accepts exact Binding create and preserves it on close', () => {
  const store = createContextManagerPresentationStore().create()
  const actions = store.actions
  assert.equal(typeof actions.beginPromptBindingCreate, 'function',
    'Binding draft action must remain available in the strictly typed Store')
  store.actions.selectProfile('main')
  actions.beginPromptBindingCreate({ profileId: 'main', basis: BASIS })
  const draft = bindingDraft(store)
  assert.equal(draft.kind, 'prompt-binding-create')
  assert.deepEqual(draft.basis, BASIS)
  assert.equal(typeof actions.updatePromptBindingCreate, 'function')
  actions.updatePromptBindingCreate(draft.token, 'bindingId', '  exact  ')
  actions.updatePromptBindingCreate(draft.token, 'resourceId', '__proto__')
  assert.equal(bindingDraft(store).bindingId, '  exact  ')
  assert.equal(bindingDraft(store).resourceId, '__proto__')
  store.actions.close()
  store.actions.open()
  assert.equal(bindingDraft(store).token, draft.token)
  store.actions.selectProfile('other')
  store.actions.selectPane('resources')
  assert.equal(store.getSnapshot().selectedProfileId, 'main')
  assert.equal(store.getSnapshot().pane, 'profiles')
  store.actions.cancelDraft(draft.token)
  store.actions.selectPane('resources')
  assert.equal(store.getSnapshot().pane, 'resources')
})

test('M8A2 GREEN: Binding leaf draft remains blocked after unknown and cannot be replaced by late actions', () => {
  const store = createContextManagerPresentationStore().create()
  const actions = store.actions
  assert.equal(typeof actions.beginPromptBindingFieldEdit, 'function')
  assert.equal(typeof actions.blockPromptBindingDraft, 'function')
  store.actions.selectProfile('main')
  actions.beginPromptBindingFieldEdit({
    profileId: 'main', bindingId: 'p',
    field: 'resourceId', original: 'missing-1', basis: BASIS,
  })
  const first = bindingDraft(store)
  assert.equal(first.kind, 'prompt-binding-edit-field')
  assert.equal(first.field, 'resourceId')
  assert.equal(typeof actions.updatePromptBindingField, 'function')
  actions.updatePromptBindingField(first.token, 'missing-2')
  assert.equal(bindingDraft(store).value, 'missing-2')
  actions.blockPromptBindingDraft(first.token, 'unknown')
  assert.equal(bindingDraft(store).blocked, 'unknown')
  actions.updatePromptBindingField(first.token, 'silent-replay')
  assert.equal(bindingDraft(store).value, 'missing-2')
  store.actions.close()
  store.actions.open()
  assert.equal(bindingDraft(store).blocked, 'unknown')
  store.actions.discardBlockedDraft(first.token)
  store.actions.completeDraft(first.token, null)
  assert.equal(store.getSnapshot().draft, null)
})

test('M8A2 GREEN: Binding delete is explicit and mutually exclusive with other Profile drafts', () => {
  const store = createContextManagerPresentationStore().create()
  const actions = store.actions
  assert.equal(typeof actions.beginPromptBindingDelete, 'function')
  store.actions.selectProfile('main')
  actions.beginPromptBindingDelete({ profileId: 'main', bindingId: 'p', basis: BASIS })
  const draft = bindingDraft(store)
  assert.equal(draft.kind, 'prompt-binding-delete')
  assert.equal(draft.bindingId, 'p')
  store.actions.beginCreate(BASIS)
  assert.equal(bindingDraft(store).token, draft.token)
  store.actions.selectPane('resources')
  assert.equal(store.getSnapshot().pane, 'profiles')
  store.actions.cancelDraft(draft.token)
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
    store.actions.discardBlockedDraft(token)
    store.actions.selectPane('resources')
    assert.equal(store.getSnapshot().pane, 'resources')
  }
})

test('M8A2 Fix GREEN: Begin verifies rendered Profile + Binding and immutable Profile basis', () => {
  const binding = { resourceId: 'original', enabled: true,
    placement: 'after-persona' as const, order: -2 }
  const profile: ContextManagerRemoteProfile = {
    name: 'Exact snapshot', basePreset: 'native',
    skills: {}, prompts: { exact: binding },
  }
  const snapshot: ContextManagerClientSnapshot = {
    attachment: 'attached', protocol: { status: 'compatible', apiVersion: 3 },
    sync: { status: 'idle' }, instanceId: BASIS.instanceId,
    changes: {
      instanceId: BASIS.instanceId, resourceAuthorityId: 'resources-v1',
      generation: 10, profiles: 4, promptResources: 1, presets: 5, runtime: 2,
    },
    profiles: {
      status: 'ready', stale: false,
      data: {
        schemaVersion: 1, schemaCompatible: true,
        profiles: { main: profile }, diagnostics: [],
        persistence: { available: true, registered: true, writable: true, revision: BASIS.revision },
      },
    },
    presets: { status: 'idle', stale: false },
    promptPlacement: { status: 'idle', stale: false },
    resources: { list: { status: 'idle', stale: false }, documents: new Map() },
    diagnostics: { sessions: new Map(), prompts: new Map(), skills: new Map(), pinned: new Map() },
  }
  assert.equal(isPromptBindingBeginCurrent(snapshot, 'main', profile, BASIS), true)
  assert.equal(isPromptBindingBeginCurrent(snapshot, 'main', profile, BASIS, 'exact', binding), true)
  assert.equal(isPromptBindingBeginCurrent(snapshot, 'main', profile,
    { ...BASIS, revision: BASIS.revision + 1 }, 'exact', binding), false)
  assert.equal(isPromptBindingBeginCurrent(snapshot, 'main', profile,
    { ...BASIS, instanceId: 'host-new' }, 'exact', binding), false)
  assert.equal(isPromptBindingBeginCurrent(snapshot, 'missing', profile, BASIS), false)
  assert.equal(isPromptBindingBeginCurrent(snapshot, 'main', { ...profile }, BASIS), false)
  assert.equal(isPromptBindingBeginCurrent(snapshot, 'main', profile, BASIS,
    'exact', { ...binding }), false)
  assert.equal(isPromptBindingBeginCurrent(snapshot, 'main', profile, BASIS,
    'nonexistent', undefined), false)
  assert.equal(isPromptBindingBeginCurrent({
    ...snapshot, profiles: { ...snapshot.profiles, stale: true },
  }, 'main', profile, BASIS), false)
  assert.equal(isPromptBindingBeginCurrent({
    ...snapshot, changes: {
      ...snapshot.changes!, resourceAuthorityId: 'resources-v2',
      generation: 11, promptResources: 2,
    },
  }, 'main', profile, BASIS, 'exact', binding), true,
  'Resource-only authority transition must not stale Profile mutation basis')
})

test('M8A2 Fix GREEN: Settings path safety is exact and separate from Resource values', () => {
  assert.equal(isWritablePromptBindingPath('main', '__proto__'), false)
  assert.equal(isWritablePromptBindingPath('__proto__', 'normal'), false)
  for (const id of ['', ' ', '  exact  ', 'constructor', 'prototype', '用户/\t标签']) {
    assert.equal(isWritablePromptBindingPath('main', id), true, JSON.stringify(id))
    assert.equal(isWritablePromptBindingPath(id, 'normal'), true, JSON.stringify(id))
  }
})

test('M8A2 Fix2 RED: every existing Begin action retains a blocked Binding terminal notice', () => {
  const cases = [
    { blocked: 'unknown', code: 'noticeOutcomeUnknown' },
    { blocked: 'conflict', code: 'noticeConflict' },
    { blocked: 'unverified', code: 'noticeSavedDegraded' },
  ] as const
  for (const c of cases) {
    const store = createContextManagerPresentationStore().create()
    store.actions.selectProfile('main')
    store.actions.beginPromptBindingFieldEdit({
      profileId: 'main', bindingId: 'exact', field: 'enabled', original: true, basis: BASIS,
    })
    const token = store.getSnapshot().draft?.token
    assert.ok(token !== undefined)
    store.actions.blockDraft(token, c.blocked, {
      code: c.code, kind: 'warning', detail: 'irreversible terminal receipt',
    })
    const original = store.getSnapshot().draft
    const reentry = [
      () => store.actions.beginCreate(BASIS),
      () => store.actions.beginFieldEdit({
        profileId: 'main', field: 'name', original: 'Main', basis: BASIS,
      }),
      () => store.actions.beginDelete('main', BASIS),
      () => store.actions.beginPromptBindingCreate({ profileId: 'main', basis: BASIS }),
      () => store.actions.beginPromptBindingFieldEdit({
        profileId: 'main', bindingId: 'exact', field: 'enabled',
        original: true, basis: BASIS,
      }),
      () => store.actions.beginPromptBindingDelete({
        profileId: 'main', bindingId: 'exact', basis: BASIS,
      }),
    ]
    for (const attempt of reentry) {
      attempt()
      assert.equal(store.getSnapshot().draft, original, c.blocked + ': existing draft must stay')
      assert.equal(store.getSnapshot().notice?.code, c.code,
        c.blocked + ': reentry must not replace the terminal result')
      assert.equal(store.getSnapshot().notice?.detail, 'irreversible terminal receipt')
    }
    store.actions.discardBlockedDraft(token)
    store.actions.beginCreate(BASIS)
    assert.equal(store.getSnapshot().draft?.kind, 'create')
  }
})

test('M8A2 Fix2: one actual DSH StoreInstance provides synchronous live dispatch ownership and revokes on cleanup', () => {
  const handle = createContextManagerPresentationStore()
  const instance = handle.create()
  const actions = instance.actions
  assert.strictEqual(readLivePresentationForActions(actions), instance.getSnapshot())
  assert.equal(mayDispatchImmediateProfileWrite(readLivePresentationForActions(actions), null), false)
  actions.open()
  assert.equal(mayDispatchImmediateProfileWrite(readLivePresentationForActions(actions), null), true)
  actions.selectProfile('main')
  assert.equal(mayDispatchImmediateProfileWrite(readLivePresentationForActions(actions), 'main'), true)
  assert.equal(mayDispatchImmediateProfileWrite(readLivePresentationForActions(actions), null), false)
  actions.beginPromptBindingFieldEdit({
    profileId: 'main', bindingId: 'b', field: 'enabled', original: true, basis: BASIS,
  })
  const draft = instance.getSnapshot().draft
  assert.ok(draft !== null)
  assert.equal(mayDispatchImmediateProfileWrite(readLivePresentationForActions(actions), 'main'), false)
  assert.equal(ownsLiveProfileDraft(readLivePresentationForActions(actions), draft), true)
  actions.updatePromptBindingField(draft.token, false)
  assert.equal(ownsLiveProfileDraft(readLivePresentationForActions(actions), draft), false,
    'old same-token draft object must not authorize a stale Save after a synchronous update')
  const current = instance.getSnapshot().draft
  assert.ok(current !== null)
  assert.equal(ownsLiveProfileDraft(readLivePresentationForActions(actions), current), true)
  actions.blockDraft(current.token, 'unknown', {
    code: 'noticeOutcomeUnknown', kind: 'warning', detail: 'uncertain',
  })
  assert.equal(ownsLiveProfileDraft(readLivePresentationForActions(actions), current), false)
  actions.discardBlockedDraft(current.token)
  assert.equal(mayDispatchImmediateProfileWrite(readLivePresentationForActions(actions), 'main'), true)
  const remounted = handle.create()
  assert.equal(readLivePresentationForActions(actions), undefined,
    'a replaced root Store instance invalidates old actions identity immediately')
  assert.strictEqual(readLivePresentationForActions(remounted.actions), remounted.getSnapshot())
  handle.revokeSnapshotReader()
  assert.equal(readLivePresentationForActions(remounted.actions), undefined)
  assert.equal(readLivePresentationForActions(actions), undefined,
    'a captured obsolete callback must not read a disposed Store')
  assert.equal(mayDispatchImmediateProfileWrite(readLivePresentationForActions(actions), 'main'), false)
})

test('M8A2 Fix3 RED: M7C Begin and M8A1 Begin obey shared pane and one-draft invariant', () => {
  const handle = createContextManagerPresentationStore()
  const store = handle.create()
  store.actions.open()
  const basis = { resourceAuthorityId: 'resource-owner' }
  // Old Resource Begin callback must not create a hidden draft in Profiles.
  store.actions.beginResourceCreate(basis)
  assert.equal(store.getSnapshot().resourceDraft, null, 'wrong-pane Resource Begin must be refused')
  store.actions.selectPane('resources')
  store.actions.beginResourceCreate(basis)
  const resourceDraft = store.getSnapshot().resourceDraft
  assert.equal(resourceDraft?.kind, 'create')
  // The three historical Profile Begin APIs must not create an invisible
  // Profile draft while Resources owns the editing slot.
  store.actions.beginCreate(BASIS)
  store.actions.beginFieldEdit({ profileId: 'main', field: 'name', original: 'Main', basis: BASIS })
  store.actions.beginDelete('main', BASIS)
  assert.equal(store.getSnapshot().draft, null, 'Resource draft must exclude all Profile draft kinds')
  assert.strictEqual(store.getSnapshot().resourceDraft, resourceDraft)
  store.actions.cancelResourceDraft(resourceDraft.token)
  store.actions.selectPane('profiles')
  assert.equal(store.getSnapshot().pane, 'profiles')
  store.actions.beginCreate(BASIS)
  assert.equal(store.getSnapshot().draft?.kind, 'create')
  assert.equal(store.getSnapshot().resourceDraft, null)
})

test('M8A2 Fix3 RED: old callbacks cannot mutate or clear a newer Binding terminal draft', () => {
  const store = createContextManagerPresentationStore().create()
  const a = store.actions
  a.open()
  a.selectProfile('main')
  a.beginPromptBindingCreate({ profileId: 'main', basis: BASIS })
  const old = store.getSnapshot().draft
  assert.equal(old?.kind, 'prompt-binding-create')
  const oldToken = old.token
  a.cancelDraft(oldToken)
  a.beginPromptBindingCreate({ profileId: 'main', basis: BASIS })
  const next = store.getSnapshot().draft
  assert.equal(next?.kind, 'prompt-binding-create')
  assert.notEqual(next.token, oldToken)
  a.updatePromptBindingCreate(oldToken, 'bindingId', 'obsolete-input')
  assert.equal(store.getSnapshot().draft.bindingId, '', 'stale input must not alter a later draft')
  a.blockDraft(next.token, 'unknown', {
    code: 'noticeOutcomeUnknown', kind: 'warning', detail: 'outcome not known',
  })
  a.cancelDraft(oldToken)
  assert.strictEqual(store.getSnapshot().draft?.token, next.token,
    'an old Cancel callback may not discard a newer Unknown draft')
  assert.equal(store.getSnapshot().notice?.code, 'noticeOutcomeUnknown')
})
