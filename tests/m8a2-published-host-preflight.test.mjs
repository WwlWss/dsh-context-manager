import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

import { Context } from '@deepseek-ai/cordis'
import { SettingsProvider } from '@deepseek-ai/dsh-settings'

import {
  CONTEXT_MANAGER_SETTINGS_NAMESPACE,
  ContextManagerChangeTracker,
  ContextManagerError,
  ContextManagerRemoteService,
  ContextManagerService,
} from '../lib/index.js'

class PublishedMemorySettings extends SettingsProvider {
  constructor(ctx, initial = {}) {
    super(ctx)
    this.doc = structuredClone(initial)
  }
  get writable() { return true }
  async load() { return structuredClone(this.doc) }
  async persist(namespace, value) { this.doc[namespace] = structuredClone(value) }
}

async function boot(t) {
  const ctx = new Context()
  const fibers = []
  for (const plugin of [PublishedMemorySettings, ContextManagerService, ContextManagerChangeTracker, ContextManagerRemoteService]) {
    const fiber = ctx.plugin(plugin)
    await fiber
    fibers.push(fiber)
  }
  t.after(async () => {
    for (const fiber of fibers.reverse()) await fiber.dispose()
  })
  return { ctx, manager: ctx.get('dshContextManager'), remote: ctx.get('dshContextRemote') }
}

function binding(resourceId = 'unresolved/日本語') {
  return {
    resourceId,
    enabled: true,
    placement: 'before-persona',
    order: -100,
  }
}

function basis(remote) {
  return {
    instanceId: remote.changes().instanceId,
    revision: remote.profiles().persistence.revision,
  }
}

async function published(name) {
  const raw = await readFile(new URL('../node_modules/' + name + '/package.json', import.meta.url), 'utf8')
  return JSON.parse(raw).version
}

test('M8A2 published preflight: real retained Settings and public Remote v3 have six Profile binding operations', async t => {
  const { manager, remote } = await boot(t)
  const versions = {
    cordis: await published('@deepseek-ai/cordis'),
    settings: await published('@deepseek-ai/dsh-settings'),
    typert: await published('@deepseek-ai/dsh-typert-protocol'),
  }
  console.log('M8A2_PUBLISHED_HOST_PACKAGES ' + JSON.stringify(versions))
  assert.equal(remote.protocol().apiVersion, 3)
  for (const method of [
    'addPromptBinding', 'setPromptBindingResourceId', 'setPromptBindingEnabled',
    'setPromptBindingPlacement', 'setPromptBindingOrder', 'removePromptBinding',
  ]) assert.equal(typeof remote[method], 'function', method)

  await manager.createProfile('m8a2', {
    name: 'Preflight', basePreset: 'standard',
    skills: {}, prompts: {}, extension: { hostOnly: true },
  })
  // Real Host creation preserves Stored-only extension siblings.
  await manager.addPromptBinding('m8a2', 'extended', {
    ...binding(),
    future: { preserve: ['exact', 'values'] },
  }, manager.snapshot().persistence.revision)

  const called = []
  async function checked(label, fn) {
    const before = basis(remote)
    const reply = await fn(before)
    assert.equal(reply.ok, true, label + ': ' + JSON.stringify(reply))
    assert.equal(reply.value.persistence.revision, before.revision + 1, label)
    called.push(label)
  }
  await checked('create', b => remote.addPromptBinding('m8a2', 'new', binding('__proto__'), b))
  await checked('resourceId', b => remote.setPromptBindingResourceId('m8a2', 'extended', '  missing/内容  ', b))
  await checked('enabled', b => remote.setPromptBindingEnabled('m8a2', 'extended', false, b))
  await checked('placement', b => remote.setPromptBindingPlacement('m8a2', 'extended', 'runtime-context', b))
  await checked('order', b => remote.setPromptBindingOrder('m8a2', 'extended', Number.MIN_SAFE_INTEGER, b))
  await checked('delete', b => remote.removePromptBinding('m8a2', 'new', b))

  const stored = manager.getStoredProfile('m8a2')
  assert.deepEqual(called, ['create', 'resourceId', 'enabled', 'placement', 'order', 'delete'])
  assert.deepEqual(stored.extension, { hostOnly: true })
  assert.deepEqual(stored.prompts.extended.future, { preserve: ['exact', 'values'] })
  assert.equal(stored.prompts.extended.resourceId, '  missing/内容  ')
  assert.equal(stored.prompts.extended.enabled, false)
  assert.equal(stored.prompts.extended.placement, 'runtime-context')
  assert.equal(stored.prompts.extended.order, Number.MIN_SAFE_INTEGER)
  assert.equal(Object.hasOwn(stored.prompts, 'new'), false)
  console.log('M8A2_HOST_REMOTE_V3_PASS six independent one-revision commits, exact input and unknown siblings preserved')
})

test('M8A2 published preflight: Settings binding path-key edge matrix is observed losslessly', async t => {
  const { manager } = await boot(t)
  await manager.createProfile('keys', { name: 'Keys', basePreset: 'standard', skills: {}, prompts: {} })
  const observed = []
  for (const id of ['constructor', 'prototype', '  exact  ', '用户/\t条目', ' ', '', '__proto__']) {
    const priorRevision = manager.snapshot().persistence.revision
    const before = structuredClone(manager.getStoredProfile('keys'))
    try {
      await manager.addPromptBinding('keys', id, binding('  literal/资源  '), priorRevision)
      const stored = manager.getStoredProfile('keys')
      const projected = manager.snapshot().profiles.keys
      assert.equal(Object.hasOwn(stored.prompts, id), true, 'stored key must remain present: ' + JSON.stringify(id))
      assert.equal(Object.hasOwn(projected.prompts, id), true, 'domain key must remain present: ' + JSON.stringify(id))
      assert.equal(stored.prompts[id].resourceId, '  literal/资源  ')
      assert.equal(manager.snapshot().persistence.revision, priorRevision + 1)
      observed.push({ id, outcome: 'accepted' })
    } catch (error) {
      if (!(error instanceof Error)) throw error
      if (id === '__proto__') {
        assert.ok(error instanceof ContextManagerError)
        assert.equal(error.code, 'unsafe-path-key')
      }
      assert.equal(manager.snapshot().persistence.revision, priorRevision, 'failed key must not change revision')
      assert.deepEqual(manager.getStoredProfile('keys'), before, 'failed key must not change Stored state')
      observed.push({ id, outcome: 'rejected', code: error.code ?? error.name })
    }
  }
  const map = new Map(observed.map(item => [item.id, item]))
  for (const id of ['constructor', 'prototype', '  exact  ', '用户/\t条目']) {
    assert.equal(map.get(id)?.outcome, 'accepted', JSON.stringify(id))
  }
  assert.equal(map.get('__proto__')?.outcome, 'rejected')
  console.log('M8A2_PATH_KEY_RESULTS ' + JSON.stringify(observed))
  assert.equal(CONTEXT_MANAGER_SETTINGS_NAMESPACE, 'dsh-context-manager')
})
