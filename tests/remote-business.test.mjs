import assert from 'node:assert/strict'
import { Context, Service } from '@deepseek-ai/cordis'
import { SettingsProvider } from '@deepseek-ai/dsh-settings'
import { test } from 'node:test'

import {
  ContextManagerChangeTracker,
  ContextManagerRemoteService,
  ContextManagerService,
} from '../lib/index.js'

class MemorySettings extends SettingsProvider {
  constructor(ctx, doc = {}) {
    super(ctx)
    this.doc = structuredClone(doc)
  }

  get writable() {
    return true
  }

  async load() {
    return structuredClone(this.doc)
  }

  async persist(ns, section) {
    this.doc[ns] = structuredClone(section)
  }
}

class ThrowingChanges extends Service {
  constructor(ctx) {
    super(ctx, 'dshContextChanges')
  }

  snapshot() {
    throw new Error("EACCES: '/home/private/context-manager/secret'")
  }
}

class FakePromptLibrary extends Service {
  constructor(ctx) {
    super(ctx, 'dshContextPromptLibrary')
    this.rows = new Map()
    this.authorityId = 'fake-storage-authority'
  }

  resourceWriteAuthority() { return this.authorityId }

  list() {
    return [...this.rows.entries()].map(([id, resource]) => ({
      status: 'usable',
      id,
      name: resource.name,
      ...(resource.description === undefined ? {} : { description: resource.description }),
      revision: resource.revision,
      incarnationId: resource.__dshCmResourceIncarnation ?? null,
    }))
  }

  get(id) {
    const resource = this.rows.get(id)
    if (resource === undefined) {
      const error = new Error('missing prompt')
      error.code = 'prompt-resource-not-found'
      throw error
    }
    return { id, resource: structuredClone(resource) }
  }

  async createPrompt(id, input, basis) {
    if (basis?.resourceAuthorityId !== this.authorityId) throw Object.assign(new Error('authority changed'), { code: 'prompt-resource-authority-conflict' })
    if (this.rows.has(id)) {
      const error = new Error('prompt exists')
      error.code = 'prompt-resource-exists'
      throw error
    }
    this.rows.set(id, { ...structuredClone(input), revision: 1, __dshCmResourceIncarnation: 'fake-incarnation-' + id, hidden: 'host-only-extension' })
    return { id, revision: 1 }
  }

  checkBasis(id, basis) {
    if (basis?.resourceAuthorityId !== this.authorityId) throw Object.assign(new Error('authority changed'), { code: 'prompt-resource-authority-conflict' })
    if (basis.resourceId !== id) throw Object.assign(new Error('id mismatch'), { code: 'invalid-prompt-resource' })
    const current = this.rows.get(id)
    if (current === undefined) throw Object.assign(new Error('missing prompt'), { code: 'prompt-resource-not-found' })
    if (current.__dshCmResourceIncarnation !== basis.incarnationId) {
      throw Object.assign(new Error('resource replaced'), { code: 'prompt-resource-incarnation-conflict' })
    }
    if (current.revision !== basis.revision) throw Object.assign(new Error('prompt conflict'), { code: 'prompt-resource-conflict' })
    return current
  }

  async replacePrompt(id, input, basis) {
    const current = this.checkBasis(id, basis)
    if (current === undefined) {
      const error = new Error('missing prompt')
      error.code = 'prompt-resource-not-found'
      throw error
    }
    const revision = current.revision + 1
    // Match the real Host's replace semantics: editable fields are replaced,
    // absent description is removed, and unrelated stored extensions survive.
    const { name: _name, description: _description, content: _content, revision: _revision, ...extensions } = current
    this.rows.set(id, { ...extensions, ...structuredClone(input), revision })
    return { id, revision }
  }

  async deletePrompt(id, basis) {
    const current = this.checkBasis(id, basis)
    if (current === undefined) {
      const error = new Error('missing prompt')
      error.code = 'prompt-resource-not-found'
      throw error
    }
    this.rows.delete(id)
  }

  async setPromptName(id, name, basis) {
    const current = this.checkBasis(id, basis)
    return this.replacePrompt(id, { name, content: current.content, ...(current.description === undefined ? {} : { description: current.description }) }, basis)
  }
  async setPromptDescription(id, description, basis) {
    const current = this.checkBasis(id, basis)
    return this.replacePrompt(id, { name: current.name, content: current.content, ...(description === undefined ? {} : { description }) }, basis)
  }
  async setPromptContent(id, content, basis) {
    const current = this.checkBasis(id, basis)
    return this.replacePrompt(id, { name: current.name, content, ...(current.description === undefined ? {} : { description: current.description }) }, basis)
  }
}

async function boot() {
  const ctx = new Context()
  const settingsFiber = ctx.plugin(MemorySettings, {})
  await settingsFiber
  const managerFiber = ctx.plugin(ContextManagerService)
  await managerFiber
  const changesFiber = ctx.plugin(ContextManagerChangeTracker)
  await changesFiber
  const promptFiber = ctx.plugin(FakePromptLibrary)
  await promptFiber
  const remoteFiber = ctx.plugin(ContextManagerRemoteService)
  await remoteFiber
  return { ctx, settingsFiber, managerFiber, changesFiber, promptFiber, remoteFiber }
}

function resourceCreateBasis(remote) {
  return { resourceAuthorityId: remote.changes().resourceAuthorityId }
}
function resourceBasis(remote, id) {
  const resource = remote.getPromptResource(id).value
  return {
    resourceAuthorityId: remote.changes().resourceAuthorityId,
    resourceId: id,
    incarnationId: resource.incarnationId,
    revision: resource.revision,
  }
}

function profileBasis(remote, revision) {
  return {
    instanceId: remote.changes().instanceId,
    revision,
  }
}

test('M6B profile Remote returns authoritative snapshots after narrow mutations', async () => {
  const { ctx } = await boot()
  const remote = ctx.dshContextRemote

  let snapshot = remote.profiles()
  assert.equal(snapshot.persistence.writable, true)
  assert.equal(typeof snapshot.persistence.revision, 'number')

  let result = await remote.createProfile('main', {
    name: 'Main',
    description: 'initial',
    basePreset: 'standard',
    skills: { docker: { mode: 'manual' } },
    prompts: {},
  }, profileBasis(remote, snapshot.persistence.revision))

  assert.equal(result.ok, true)
  snapshot = result.value
  assert.equal(snapshot.profiles.main.name, 'Main')
  assert.equal(snapshot.profiles.main.skills.docker.mode, 'manual')

  result = await remote.setProfileName('main', 'Renamed', profileBasis(remote, snapshot.persistence.revision))
  assert.equal(result.ok, true)
  assert.equal(result.value.profiles.main.name, 'Renamed')

  result = await remote.setProfileDescription('main', null, profileBasis(remote, result.value.persistence.revision))
  assert.equal(result.ok, true)
  assert.equal(result.value.profiles.main.description, undefined)

  result = await remote.setProfileBasePreset(
    'main',
    'future-preset',
    profileBasis(remote, result.value.persistence.revision),
  )
  assert.equal(result.ok, true)
  assert.equal(result.value.profiles.main.basePreset, 'future-preset')
})

test('M6B profile Remote maps stale Settings revisions and invalid revisions to package-owned errors', async () => {
  const { ctx } = await boot()
  const remote = ctx.dshContextRemote

  const before = remote.profiles()
  const created = await remote.createProfile('main', {
    name: 'Main',
    basePreset: 'standard',
  }, profileBasis(remote, before.persistence.revision))
  assert.equal(created.ok, true)

  const conflict = await remote.setProfileName('main', 'stale', profileBasis(remote, before.persistence.revision))
  assert.deepEqual(conflict.ok, false)
  assert.equal(conflict.error.code, 'profile-conflict')
  assert.equal(conflict.error.expectedRevision, before.persistence.revision)
  assert.equal(conflict.error.actualRevision, created.value.persistence.revision)

  const invalid = await remote.setProfileName('main', 'bad', {
    instanceId: remote.changes().instanceId,
    revision: -1,
  })
  assert.equal(invalid.ok, false)
  assert.equal(invalid.error.code, 'invalid-revision')
})

test('M7B2 profile Remote rejects a wrong Host instance even when Settings revision matches', async () => {
  const { ctx } = await boot()
  const remote = ctx.dshContextRemote

  const before = remote.profiles()
  const revision = before.persistence.revision
  assert.equal(typeof revision, 'number')
  const actualInstanceId = remote.changes().instanceId

  const result = await remote.createProfile('must-not-exist', {
    name: 'Wrong host',
    basePreset: 'standard',
  }, {
    instanceId: 'stale-host-instance',
    revision,
  })

  assert.equal(result.ok, false)
  assert.equal(result.error.code, 'host-instance-conflict')
  assert.equal(result.error.expectedInstanceId, 'stale-host-instance')
  assert.equal(result.error.actualInstanceId, actualInstanceId)

  const after = remote.profiles()
  assert.equal(after.persistence.revision, revision)
  assert.equal(after.profiles['must-not-exist'], undefined)
})

test('M7B2 rotates instanceId across Settings provider replacement and rejects the old same-revision basis', async () => {
  const { ctx, settingsFiber } = await boot()
  const remote = ctx.dshContextRemote

  const before = remote.profiles()
  assert.equal(before.persistence.revision, 0)
  const basis = profileBasis(remote, before.persistence.revision)

  await settingsFiber.dispose()
  const settingsB = ctx.plugin(MemorySettings, {})
  await settingsB

  const replacement = remote.profiles()
  assert.equal(replacement.persistence.revision, 0)

  const result = await remote.createProfile('must-not-cross-settings', {
    name: 'Wrong settings authority',
    basePreset: 'standard',
  }, basis)

  assert.equal(result.ok, false)
  assert.equal(result.error.code, 'host-instance-conflict')
  assert.equal(result.error.expectedInstanceId, basis.instanceId)
  assert.notEqual(result.error.actualInstanceId, basis.instanceId)

  const after = remote.profiles()
  assert.equal(after.persistence.revision, 0)
  assert.equal(after.profiles['must-not-cross-settings'], undefined)
})

test('M7B2 rotates instanceId across ContextManagerService replacement and rejects the old same-revision basis', async () => {
  const { ctx, managerFiber } = await boot()
  const remote = ctx.dshContextRemote

  const before = remote.profiles()
  assert.equal(before.persistence.revision, 0)
  const basis = profileBasis(remote, before.persistence.revision)

  await managerFiber.dispose()
  const managerB = ctx.plugin(ContextManagerService)
  await managerB

  const replacement = remote.profiles()
  assert.equal(replacement.persistence.revision, 0)

  const result = await remote.createProfile('must-not-cross-manager', {
    name: 'Wrong manager authority',
    basePreset: 'standard',
  }, basis)

  assert.equal(result.ok, false)
  assert.equal(result.error.code, 'host-instance-conflict')
  assert.equal(result.error.expectedInstanceId, basis.instanceId)
  assert.notEqual(result.error.actualInstanceId, basis.instanceId)

  const after = remote.profiles()
  assert.equal(after.persistence.revision, 0)
  assert.equal(after.profiles['must-not-cross-manager'], undefined)
})

test('M7B2 sanitizes unexpected change-authority failures before rejecting a profile mutation', async () => {
  const { ctx, changesFiber } = await boot()
  const remote = ctx.dshContextRemote

  const before = remote.profiles()
  const basis = profileBasis(remote, before.persistence.revision)

  await changesFiber.dispose()
  const throwingChanges = ctx.plugin(ThrowingChanges)
  await throwingChanges

  await assert.rejects(
    remote.createProfile('must-not-run', {
      name: 'Must not run',
      basePreset: 'standard',
    }, basis),
    error => {
      assert.equal(error.message, 'Context Manager Remote operation failed')
      assert.equal(error.message.includes('/home/private'), false)
      assert.match(String(error.cause?.message), /\/home\/private\/context-manager\/secret/)
      return true
    },
  )

  const after = remote.profiles()
  assert.equal(after.persistence.revision, before.persistence.revision)
  assert.equal(after.profiles['must-not-run'], undefined)
})

test('M6B Prompt Resource Remote keeps list metadata-only and get projection narrow', async () => {
  const { ctx } = await boot()
  const remote = ctx.dshContextRemote

  let result = await remote.createPromptResource('p', {
    name: 'Prompt',
    description: 'desc',
    content: 'secret body only get should return',
  }, resourceCreateBasis(remote))
  assert.deepEqual(result, { ok: true, value: { id: 'p', revision: 1 } })
  const firstBasis = resourceBasis(remote, 'p')

  const list = remote.listPromptResources()
  assert.equal(list.ok, true)
  assert.deepEqual(list.value, [{
    status: 'usable',
    id: 'p',
    name: 'Prompt',
    description: 'desc',
    revision: 1,
    incarnationId: firstBasis.incarnationId,
  }])
  assert.equal(JSON.stringify(list).includes('secret body'), false)
  assert.equal(JSON.stringify(list).includes('host-only-extension'), false)

  const get = remote.getPromptResource('p')
  assert.equal(get.ok, true)
  assert.equal(get.value.content, 'secret body only get should return')
  assert.equal(get.value.incarnationId, firstBasis.incarnationId)
  assert.equal(Object.hasOwn(get.value, 'hidden'), false)

  result = await remote.replacePromptResource('p', {
    name: 'Prompt 2',
    content: 'updated',
  }, firstBasis)
  assert.deepEqual(result, { ok: true, value: { id: 'p', revision: 2 } })

  const conflict = await remote.deletePromptResource('p', firstBasis)
  assert.equal(conflict.ok, false)
  assert.equal(conflict.error.code, 'prompt-resource-conflict')

  const deleted = await remote.deletePromptResource('p', resourceBasis(remote, 'p'))
  assert.deepEqual(deleted, { ok: true, value: { id: 'p' } })
})


test('M7B2-B0 Resource leaf Remote preserves identity and maps independent conflicts', async (t) => {
  const { ctx } = await boot()
  t.after(() => ctx.fiber.dispose())
  const remote = ctx.dshContextRemote

  const created = await remote.createPromptResource('leaf', {
    name: 'Original', description: 'initial', content: 'body',
  }, resourceCreateBasis(remote))
  assert.deepEqual(created, { ok: true, value: { id: 'leaf', revision: 1 } })
  let basis = resourceBasis(remote, 'leaf')
  const incarnation = basis.incarnationId
  const staleBasis = basis
  assert.equal(ctx.dshContextPromptLibrary.rows.get('leaf').hidden, 'host-only-extension')

  const wrongAuthority = await remote.setPromptResourceName('leaf', 'unauthorized', {
    ...basis, resourceAuthorityId: 'older-resource-authority',
  })
  assert.equal(wrongAuthority.ok, false)
  assert.equal(wrongAuthority.error.code, 'prompt-resource-authority-conflict')
  const wrongIncarnation = await remote.setPromptResourceContent('leaf', 'unsafe', {
    ...basis, incarnationId: 'another-resource-incarnation',
  })
  assert.equal(wrongIncarnation.ok, false)
  assert.equal(wrongIncarnation.error.code, 'prompt-resource-incarnation-conflict')
  const wrongRevision = await remote.setPromptResourceDescription('leaf', 'unsafe', {
    ...basis, revision: basis.revision + 1,
  })
  assert.equal(wrongRevision.ok, false)
  assert.equal(wrongRevision.error.code, 'prompt-resource-conflict')
  assert.equal(remote.getPromptResource('leaf').value.revision, 1)
  assert.equal(remote.getPromptResource('leaf').value.content, 'body')

  let result = await remote.setPromptResourceName('leaf', 'Renamed', basis)
  assert.deepEqual(result, { ok: true, value: { id: 'leaf', revision: 2 } })
  basis = resourceBasis(remote, 'leaf')
  assert.equal(basis.incarnationId, incarnation)
  assert.equal(remote.getPromptResource('leaf').value.content, 'body')

  result = await remote.setPromptResourceDescription('leaf', 'description set', basis)
  assert.deepEqual(result, { ok: true, value: { id: 'leaf', revision: 3 } })
  assert.equal(remote.getPromptResource('leaf').value.description, 'description set')
  basis = resourceBasis(remote, 'leaf')

  result = await remote.setPromptResourceDescription('leaf', null, basis)
  assert.deepEqual(result, { ok: true, value: { id: 'leaf', revision: 4 } })
  assert.equal(remote.getPromptResource('leaf').value.description, undefined)
  assert.equal(Object.hasOwn(ctx.dshContextPromptLibrary.rows.get('leaf'), 'description'), false)
  basis = resourceBasis(remote, 'leaf')

  result = await remote.setPromptResourceContent('leaf', 'new body\\nutf8\\t正文', basis)
  assert.deepEqual(result, { ok: true, value: { id: 'leaf', revision: 5 } })
  const document = remote.getPromptResource('leaf').value
  assert.equal(document.name, 'Renamed')
  assert.equal(document.content, 'new body\\nutf8\\t正文')
  assert.equal(document.incarnationId, incarnation)
  assert.equal(document.description, undefined)
  assert.equal(ctx.dshContextPromptLibrary.rows.get('leaf').hidden, 'host-only-extension')

  const outdated = await remote.setPromptResourceContent('leaf', 'stale write', staleBasis)
  assert.equal(outdated.ok, false)
  assert.equal(outdated.error.code, 'prompt-resource-conflict')
  assert.equal(remote.getPromptResource('leaf').value.revision, 5)
})

test('M6B Prompt Resource absence degrades only Prompt endpoints', async () => {
  const ctx = new Context()
  const settingsFiber = ctx.plugin(MemorySettings, {})
  await settingsFiber
  const managerFiber = ctx.plugin(ContextManagerService)
  await managerFiber
  const remoteFiber = ctx.plugin(ContextManagerRemoteService)
  await remoteFiber

  assert.equal(ctx.dshContextRemote.profiles().persistence.available, true)

  const prompts = ctx.dshContextRemote.listPromptResources()
  assert.equal(prompts.ok, false)
  assert.equal(prompts.error.code, 'prompt-library-not-ready')
})
