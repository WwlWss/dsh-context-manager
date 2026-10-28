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
  store.actions.updateResourceCreate('id', 'original')
  store.actions.updateResourceCreate('content', 'exact\n')
  store.actions.close()
  store.actions.open()
  assert.equal(store.getSnapshot().pane, 'resources')
  assert.equal(store.getSnapshot().resourceDraft?.kind, 'create')
  assert.equal(store.getSnapshot().resourceDraft?.content, 'exact\n')
  store.actions.selectPane('profiles')
  assert.equal(store.getSnapshot().pane, 'resources')
  store.actions.selectResource('another')
  assert.equal(store.getSnapshot().selectedResourceId, null)
  const token = store.getSnapshot().resourceDraft?.token
  assert.ok(token)
  store.actions.blockResourceDraft(token, 'unknown', { code: 'resourceNoticeUnknown', kind: 'warning' })
  store.actions.updateResourceCreate('id', 'not-allowed')
  assert.equal(store.getSnapshot().resourceDraft?.id, 'original')
  store.actions.cancelResourceDraft()
  store.actions.selectPane('profiles')
  assert.equal(store.getSnapshot().pane, 'profiles')
})

test('resource presentation token prevents late completion from clearing a new draft', () => {
  const s = createContextManagerPresentationStore().create()
  s.actions.beginResourceCreate(CREATE)
  const old = s.getSnapshot().resourceDraft?.token
  assert.ok(old)
  s.actions.cancelResourceDraft()
  s.actions.beginResourceCreate(CREATE)
  const fresh = s.getSnapshot().resourceDraft?.token
  assert.ok(fresh && fresh !== old)
  s.actions.completeResourceDraft(old, null, 'obsolete')
  assert.equal(s.getSnapshot().resourceDraft?.token, fresh)
  s.actions.completeResourceDraft(fresh, { code: 'resourceNoticeSaved', kind: 'success' }, 'fresh')
  assert.equal(s.getSnapshot().resourceDraft, null)
  assert.equal(s.getSnapshot().selectedResourceId, 'fresh')
})
