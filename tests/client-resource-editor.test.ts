import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ContextManagerClientSnapshot, ContextManagerClientPromptResourceReadStamp } from '../src/client/model-types.js'
import type { ContextManagerClientResourceMutations, ContextManagerClientResourceMutationResult } from '../src/client/resource-mutation-types.js'
import { createContextManagerPresentationStore } from '../src/client/presentation-store.js'
import type { ResourceDraft } from '../src/client/resource-editor.js'
import {
  deriveResourceView,
  isResourceDraftCurrent,
  validateResourceCreateDraft,
  resourceEditChanges,
  commitResourceDraft,
  blockForResourceMutationResult,
  noticeForResourceMutationResult,
} from '../src/client/resource-editor.js'

const STAMP: ContextManagerClientPromptResourceReadStamp = Object.freeze({
  instanceId: 'profile-instance-A',
  resourceAuthorityId: 'library-A',
  resourceId: 'alpha',
  incarnationId: 'incarnation-A',
  revision: 5,
  source: 'document',
})
const CREATE = Object.freeze({ resourceAuthorityId: 'library-A' })
const DOCUMENT = Object.freeze({
  id: 'alpha', name: 'Original', content: 'Line 1\nLine 2\n',
  revision: 5, incarnationId: 'incarnation-A', description: undefined,
})

function snapshot(): ContextManagerClientSnapshot {
  return {
    attachment: 'attached',
    instanceId: 'profile-instance-A',
    protocol: { status: 'compatible', apiVersion: 3 },
    sync: { status: 'idle' },
    changes: {
      instanceId: 'profile-instance-A',
      resourceAuthorityId: 'library-A',
      generation: 1, profiles: 1, presets: 1, runtime: 1, promptResources: 1,
    },
    profiles: { status: 'idle', stale: false },
    presets: { status: 'idle', stale: false },
    promptPlacement: { status: 'idle', stale: false },
    resources: {
      list: { status: 'ready', stale: false, data: [
        { status: 'usable', id: 'alpha', name: 'Original', revision: 5, incarnationId: 'incarnation-A' },
        { status: 'invalid', id: 'corrupt', message: 'unsupported data' },
      ] },
      documents: new Map([['alpha', { status: 'ready', stale: false, data: DOCUMENT }]]),
    },
    diagnostics: { sessions: new Map(), prompts: new Map(), skills: new Map(), pinned: new Map() },
  }
}

function editDraft(): Extract<ResourceDraft, { kind: 'edit' }> {
  return {
    kind: 'edit', token: 1, stamp: STAMP, original: {
      name: DOCUMENT.name, description: undefined, content: DOCUMENT.content,
    },
    name: DOCUMENT.name, description: '', content: DOCUMENT.content,
    removeDescription: false, descriptionTouched: false,
  }
}

function recorder() {
  const calls: Array<{ method: string; args: readonly unknown[] }> = []
  const APPLIED = Object.freeze({ status: 'applied', refresh: 'fresh' } as const)
  const result = (method: string, args: readonly unknown[]): Promise<ContextManagerClientResourceMutationResult> => {
    calls.push({ method, args }); return Promise.resolve(APPLIED)
  }
  const mutations: ContextManagerClientResourceMutations = {
    createPromptResource: (...args) => result('create', args),
    replacePromptResource: (...args) => result('replace', args),
    deletePromptResource: (...args) => result('delete', args),
    setPromptResourceName: (...args) => result('name', args),
    setPromptResourceDescription: (...args) => result('description', args),
    setPromptResourceContent: (...args) => result('content', args),
  }
  return { mutations, calls }
}

test('authoritative Resource projection preserves invalid rows and does not edit stale data', () => {
  const current = snapshot()
  const view = deriveResourceView(current, null)
  assert.deepEqual(view.rows.map(x => x.id), ['alpha', 'corrupt'])
  assert.equal(view.selectedId, 'alpha')
  assert.equal(view.selected?.status, 'usable')
  assert.equal(view.canEditSelected, true)
  assert.equal(view.writable, true)
  assert.equal(deriveResourceView({ ...current, resources: {
    ...current.resources, list: { ...current.resources.list, stale: true },
  } }, 'alpha').writable, false)
  assert.equal(deriveResourceView(current, 'corrupt').canEditSelected, false)
  assert.equal(deriveResourceView({ ...current, resources: {
    ...current.resources, documents: new Map(),
  } }, 'alpha').canEditSelected, false)
})

test('read-only and stale Resource views can inspect matching cached content without permitting edits', () => {
  const current = snapshot()
  const readonly = deriveResourceView({
    ...current,
    changes: { ...current.changes!, resourceAuthorityId: null },
  }, 'alpha')
  assert.equal(readonly.writable, false)
  assert.equal(readonly.canEditSelected, false)
  assert.equal(readonly.canInspectSelected, true)
  assert.equal(readonly.document?.content, DOCUMENT.content)

  const stale = deriveResourceView({
    ...current,
    resources: { ...current.resources, list: { ...current.resources.list, stale: true } },
  }, 'alpha')
  assert.equal(stale.listFresh, false)
  assert.equal(stale.canEditSelected, false)
  assert.equal(stale.canInspectSelected, true)

  const changedDocument = deriveResourceView({
    ...current,
    resources: { ...current.resources, documents: new Map([['alpha', {
      status: 'ready', stale: false,
      data: { ...DOCUMENT, incarnationId: 'new-after-replace' },
    }]]) },
  }, 'alpha')
  assert.equal(changedDocument.canInspectSelected, false)
})

test('Resource ID follows PromptLibrary arbitrary-id contract instead of Settings path-key rules', () => {
  const draft: ResourceDraft = {
    kind: 'create', token: 1, basis: CREATE,
    id: '__proto__', name: 'literal', description: '', content: '',
  }
  assert.equal(validateResourceCreateDraft(draft, new Set()), 'valid')
  assert.equal(validateResourceCreateDraft({ ...draft, id: '  ' }, new Set()), 'missing-id')
  assert.equal(validateResourceCreateDraft({ ...draft, id: 'corrupt' }, new Set(['corrupt'])), 'exists')
  assert.equal(validateResourceCreateDraft({ ...draft, id: '  exact  ' }, new Set()), 'valid')
})

test('editor Stamp survives Profile instance rotation when same Resource authority and Document basis are freshly observed', () => {
  const original = snapshot()
  const draft = editDraft()
  assert.equal(isResourceDraftCurrent(original, draft), true)
  const profileRotated = {
    ...original,
    instanceId: 'profile-instance-B',
    changes: { ...original.changes!, instanceId: 'profile-instance-B' },
  }
  assert.equal(isResourceDraftCurrent(profileRotated, draft), true)
  assert.equal(isResourceDraftCurrent({
    ...original, changes: { ...original.changes!, resourceAuthorityId: 'library-B' },
  }, draft), false)
  assert.equal(isResourceDraftCurrent({ ...original, resources: {
    ...original.resources, documents: new Map([['alpha', {
      status: 'ready', stale: false, data: { ...DOCUMENT, incarnationId: 'recreated' },
    }]]),
  } }, draft), false)
  assert.equal(isResourceDraftCurrent({ ...original, resources: {
    ...original.resources, documents: new Map([['alpha', {
      status: 'ready', stale: true, data: DOCUMENT,
    }]]),
  } }, draft), false)
  const create: ResourceDraft = {
    kind: 'create', token: 2, basis: CREATE,
    id: 'beta', name: '', description: '', content: '',
  }
  assert.equal(isResourceDraftCurrent(profileRotated, create), true)
  assert.equal(isResourceDraftCurrent({ ...original, changes: {
    ...original.changes!, resourceAuthorityId: null,
  } }, create), false)
})

test('single-field Resource Save chooses one leaf mutation; multi-field chooses exactly one replace with original Stamp', async () => {
  const f = recorder()
  const name = { ...editDraft(), name: 'New Name' }
  const desc = { ...editDraft(), description: '' }
  const body = { ...editDraft(), content: 'exact\n\n' }
  const absent = editDraft()
  assert.equal(resourceEditChanges(absent).length, 0)
  assert.equal(resourceEditChanges(desc).length, 0)
  assert.equal(await commitResourceDraft(absent, f.mutations), undefined)
  await commitResourceDraft(name, f.mutations)
  await commitResourceDraft(body, f.mutations)
  await commitResourceDraft({ ...editDraft(), description: '', original: { ...editDraft().original, description: 'old' }, removeDescription: true }, f.mutations)
  await commitResourceDraft({ ...editDraft(), description: '', original: { ...editDraft().original, description: undefined }, removeDescription: false, descriptionTouched: true }, f.mutations)
  await commitResourceDraft({ ...editDraft(), name: 'N', content: 'C' }, f.mutations)
  assert.deepEqual(f.calls.map(c => c.method), ['name', 'content', 'description', 'description', 'replace'])
  assert.deepEqual(f.calls[2]?.args, [STAMP, null])
  assert.deepEqual(f.calls[3]?.args, [STAMP, ''])
  assert.deepEqual(f.calls[4]?.args, [STAMP, { name: 'N', content: 'C' }])
  assert.equal(f.calls.length, 5)
})

test('create and delete use captured basis with exact payload and do not imply any ProfileBinding write', async () => {
  const f = recorder()
  const create: ResourceDraft = {
    kind: 'create', token: 1, basis: CREATE,
    id: '__proto__', name: 'N', description: '', content: 'Line\n',
  }
  const remove: ResourceDraft = {
    kind: 'delete', token: 2, stamp: { ...STAMP, source: 'list' },
    resourceId: 'alpha', name: 'Original',
  }
  await commitResourceDraft(create, f.mutations)
  await commitResourceDraft(remove, f.mutations)
  assert.deepEqual(f.calls, [
    { method: 'create', args: [CREATE, '__proto__', { name: 'N', content: 'Line\n' }] },
    { method: 'delete', args: [remove.stamp] },
  ])
})

test('outcome classification never treats unknown as applied or retries applied-degraded', () => {
  const unknown: ContextManagerClientResourceMutationResult = {
    status: 'unknown', refresh: 'fresh',
    error: { kind: 'call-rejected', message: 'response dropped' },
  }
  const conflict: ContextManagerClientResourceMutationResult = {
    status: 'rejected', refresh: 'fresh',
    error: { kind: 'business', code: 'prompt-resource-incarnation-conflict', message: 'old source' },
  }
  assert.equal(blockForResourceMutationResult(unknown), 'unknown')
  assert.equal(blockForResourceMutationResult(conflict), 'conflict')
  assert.equal(blockForResourceMutationResult({ status: 'applied', refresh: 'degraded' }), 'unverified')
  assert.equal(blockForResourceMutationResult({ status: 'applied', refresh: 'fresh' }), undefined)
  assert.equal(noticeForResourceMutationResult(unknown)?.code, 'resourceNoticeUnknown')
  assert.equal(noticeForResourceMutationResult({ status: 'applied', refresh: 'degraded' })?.code, 'resourceNoticeDegraded')
  assert.equal(noticeForResourceMutationResult({ status: 'superseded' }), undefined)
})

test('presentation store keeps Resource draft across close/reopen and prevents tab/selection loss', () => {
  const store = createContextManagerPresentationStore().create()
  store.actions.selectPane('resources')
  store.actions.beginResourceCreate(CREATE)
  const initialToken = store.getSnapshot().resourceDraft?.token
  assert.ok(initialToken)
  store.actions.updateResourceCreate(initialToken, 'id', 'original')
  store.actions.updateResourceCreate(initialToken, 'content', 'exact\n')
  store.actions.close()
  store.actions.open()
  assert.equal(store.getSnapshot().pane, 'resources')
  assert.equal(store.getSnapshot().resourceDraft?.kind, 'create')
  const reopenedDraft = store.getSnapshot().resourceDraft
  assert.equal(reopenedDraft?.kind === 'create' ? reopenedDraft.content : undefined, 'exact\n')
  store.actions.selectPane('profiles')
  assert.equal(store.getSnapshot().pane, 'resources')
  store.actions.selectResource('another')
  assert.equal(store.getSnapshot().selectedResourceId, null)
  const token = store.getSnapshot().resourceDraft?.token
  assert.ok(token)
  store.actions.blockResourceDraft(token, 'unknown', { code: 'resourceNoticeUnknown', kind: 'warning' })
  store.actions.updateResourceCreate(initialToken, 'id', 'not-allowed')
  const blockedDraft = store.getSnapshot().resourceDraft
  assert.equal(blockedDraft?.kind === 'create' ? blockedDraft.id : undefined, 'original')
  store.actions.discardBlockedResourceDraft(initialToken)
  store.actions.selectPane('profiles')
  assert.equal(store.getSnapshot().pane, 'profiles')
})

test('resource presentation token prevents late completion from clearing a new draft', () => {
  const s = createContextManagerPresentationStore().create()
  s.actions.selectPane('resources')
  s.actions.beginResourceCreate(CREATE)
  const old = s.getSnapshot().resourceDraft?.token
  assert.ok(old)
  s.actions.cancelResourceDraft(old)
  s.actions.beginResourceCreate(CREATE)
  const fresh = s.getSnapshot().resourceDraft?.token
  assert.ok(fresh && fresh !== old)
  s.actions.completeResourceDraft(old, null, 'obsolete')
  assert.equal(s.getSnapshot().resourceDraft?.token, fresh)
  s.actions.completeResourceDraft(fresh, { code: 'resourceNoticeSaved', kind: 'success' }, 'fresh')
  assert.equal(s.getSnapshot().resourceDraft, null)
  assert.equal(s.getSnapshot().selectedResourceId, 'fresh')
})

test('M8A2 Fix3: obsolete Resource edit events cannot modify a different same-kind draft', () => {
  const store = createContextManagerPresentationStore().create()
  const a = store.actions
  a.open()
  a.selectPane('resources')
  a.beginResourceEdit(DOCUMENT, STAMP)
  const older = store.getSnapshot().resourceDraft
  assert.ok(older?.kind === 'edit')
  a.updateResourceEdit(older.token, 'name', 'first edit')
  a.cancelResourceDraft(older.token)
  a.beginResourceEdit(DOCUMENT, STAMP)
  const newer = store.getSnapshot().resourceDraft
  assert.ok(newer?.kind === 'edit')
  assert.notEqual(newer.token, older.token)
  a.updateResourceEdit(older.token, 'name', 'obsolete edit')
  a.markResourceDescriptionRemoved(older.token)
  a.markResourceDescriptionEmpty(older.token)
  a.cancelResourceDraft(older.token)
  const still = store.getSnapshot().resourceDraft
  assert.ok(still?.kind === 'edit')
  assert.equal(still.token, newer.token)
  assert.equal(still.name, DOCUMENT.name)
  assert.equal(still.descriptionTouched, false)
  assert.equal(still.removeDescription, false)
  a.updateResourceEdit(newer.token, 'name', 'current edit')
  const updated = store.getSnapshot().resourceDraft
  assert.equal(updated?.kind === 'edit' ? updated.name : undefined, 'current edit')
})


test('M8A2 Fix4 RED: all blocked Resource receipts survive ordinary Store actions and later blocks', () => {
  const cases = [
    { reason: 'unknown', code: 'resourceNoticeUnknown' },
    { reason: 'conflict', code: 'resourceNoticeConflict' },
    { reason: 'unverified', code: 'resourceNoticeDegraded' },
  ] as const
  for (const item of cases) {
    const store = createContextManagerPresentationStore().create()
    const actions = store.actions
    actions.open()
    actions.selectPane('resources')
    actions.beginResourceCreate(CREATE)
    const token = store.getSnapshot().resourceDraft?.token
    assert.ok(token)
    const original = { code: item.code, kind: 'warning', detail: 'exact first Host result' } as const
    actions.blockResourceDraft(token, item.reason, original)
    actions.selectPane('profiles')
    actions.selectResource('unrelated')
    actions.setResourceNotice({ code: 'resourceNoticeUnavailable', kind: 'warning' })
    actions.blockResourceDraft(token, 'stale', {
      code: 'resourceNoticeStale', kind: 'warning', detail: 'late obsolete result',
    })
    assert.deepEqual(store.getSnapshot().resourceNotice, original,
      item.reason + ': original Resource terminal receipt must remain visible')
    assert.equal(store.getSnapshot().resourceDraft?.blocked, item.reason,
      'a late block must not reinterpret the first terminal result')
    actions.discardBlockedResourceDraft(token)
    assert.equal(store.getSnapshot().resourceDraft, null)
    assert.equal(store.getSnapshot().resourceNotice, null)
    actions.selectPane('profiles')
    assert.equal(store.getSnapshot().pane, 'profiles')
  }
})
