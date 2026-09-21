import assert from 'node:assert/strict'
import { Context, Service } from '@deepseek-ai/cordis'
import { SettingsProvider } from '@deepseek-ai/dsh-settings'
import { test } from 'node:test'

import {
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

class FakePromptLibrary extends Service {
  constructor(ctx) {
    super(ctx, 'dshContextPromptLibrary')
    this.rows = new Map()
  }

  list() {
    return [...this.rows.entries()].map(([id, resource]) => ({
      status: 'usable',
      id,
      name: resource.name,
      ...(resource.description === undefined ? {} : { description: resource.description }),
      revision: resource.revision,
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

  async createPrompt(id, input) {
    if (this.rows.has(id)) {
      const error = new Error('prompt exists')
      error.code = 'prompt-resource-exists'
      throw error
    }
    this.rows.set(id, { ...structuredClone(input), revision: 1, hidden: 'host-only-extension' })
    return { id, revision: 1 }
  }

  async replacePrompt(id, input, expectedRevision) {
    const current = this.rows.get(id)
    if (current === undefined) {
      const error = new Error('missing prompt')
      error.code = 'prompt-resource-not-found'
      throw error
    }
    if (current.revision !== expectedRevision) {
      const error = new Error('prompt conflict')
      error.code = 'prompt-resource-conflict'
      throw error
    }
    const revision = current.revision + 1
    this.rows.set(id, {
      ...current,
      ...structuredClone(input),
      revision,
    })
    return { id, revision }
  }

  async deletePrompt(id, expectedRevision) {
    const current = this.rows.get(id)
    if (current === undefined) {
      const error = new Error('missing prompt')
      error.code = 'prompt-resource-not-found'
      throw error
    }
    if (current.revision !== expectedRevision) {
      const error = new Error('prompt conflict')
      error.code = 'prompt-resource-conflict'
      throw error
    }
    this.rows.delete(id)
  }
}

async function boot() {
  const ctx = new Context()
  const settingsFiber = ctx.plugin(MemorySettings, {})
  await settingsFiber
  const managerFiber = ctx.plugin(ContextManagerService)
  await managerFiber
  const promptFiber = ctx.plugin(FakePromptLibrary)
  await promptFiber
  const remoteFiber = ctx.plugin(ContextManagerRemoteService)
  await remoteFiber
  return { ctx, settingsFiber, managerFiber, promptFiber, remoteFiber }
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
  }, snapshot.persistence.revision)

  assert.equal(result.ok, true)
  snapshot = result.value
  assert.equal(snapshot.profiles.main.name, 'Main')
  assert.equal(snapshot.profiles.main.skills.docker.mode, 'manual')

  result = await remote.setProfileName('main', 'Renamed', snapshot.persistence.revision)
  assert.equal(result.ok, true)
  assert.equal(result.value.profiles.main.name, 'Renamed')

  result = await remote.setProfileDescription('main', null, result.value.persistence.revision)
  assert.equal(result.ok, true)
  assert.equal(result.value.profiles.main.description, undefined)

  result = await remote.setProfileBasePreset(
    'main',
    'future-preset',
    result.value.persistence.revision,
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
  }, before.persistence.revision)
  assert.equal(created.ok, true)

  const conflict = await remote.setProfileName('main', 'stale', before.persistence.revision)
  assert.deepEqual(conflict.ok, false)
  assert.equal(conflict.error.code, 'profile-conflict')
  assert.equal(conflict.error.expectedRevision, before.persistence.revision)
  assert.equal(conflict.error.actualRevision, created.value.persistence.revision)

  const invalid = await remote.setProfileName('main', 'bad', -1)
  assert.equal(invalid.ok, false)
  assert.equal(invalid.error.code, 'invalid-revision')
})

test('M6B Prompt Resource Remote keeps list metadata-only and get projection narrow', async () => {
  const { ctx } = await boot()
  const remote = ctx.dshContextRemote

  let result = await remote.createPromptResource('p', {
    name: 'Prompt',
    description: 'desc',
    content: 'secret body only get should return',
  })
  assert.deepEqual(result, { ok: true, value: { id: 'p', revision: 1 } })

  const list = remote.listPromptResources()
  assert.equal(list.ok, true)
  assert.deepEqual(list.value, [{
    status: 'usable',
    id: 'p',
    name: 'Prompt',
    description: 'desc',
    revision: 1,
  }])
  assert.equal(JSON.stringify(list).includes('secret body'), false)
  assert.equal(JSON.stringify(list).includes('host-only-extension'), false)

  const get = remote.getPromptResource('p')
  assert.equal(get.ok, true)
  assert.equal(get.value.content, 'secret body only get should return')
  assert.equal(Object.hasOwn(get.value, 'hidden'), false)

  result = await remote.replacePromptResource('p', {
    name: 'Prompt 2',
    content: 'updated',
  }, 1)
  assert.deepEqual(result, { ok: true, value: { id: 'p', revision: 2 } })

  const conflict = await remote.deletePromptResource('p', 1)
  assert.equal(conflict.ok, false)
  assert.equal(conflict.error.code, 'prompt-resource-conflict')

  const deleted = await remote.deletePromptResource('p', 2)
  assert.deepEqual(deleted, { ok: true, value: { id: 'p' } })
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
