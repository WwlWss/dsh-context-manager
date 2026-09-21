import assert from 'node:assert/strict'
import { test } from 'node:test'

import { Context, Service } from '@deepseek-ai/cordis'
import { SettingsProvider } from '@deepseek-ai/dsh-settings'

import {
  CONTEXT_MANAGER_SETTINGS_NAMESPACE,
  ContextManagerChangeTracker,
  ContextManagerError,
  ContextManagerPresetAuthoring,
  ContextManagerPromptLibrary,
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

class MemoryTable {
  constructor() {
    this.records = new Map()
  }

  get(key) {
    return this.records.get(key)
  }

  entries() {
    return new Map(this.records).entries()
  }

  async put(key, value) {
    this.records.set(key, structuredClone(value))
  }

  async delete(key) {
    return this.records.delete(key)
  }

  async update(key, update) {
    const current = this.records.get(key)
    if (current === undefined) throw new Error(`missing key ${key}`)
    const next = update(current)
    this.records.set(key, structuredClone(next))
    return this.records.get(key)
  }
}

class MemoryStorageDomain extends Service {
  constructor(ctx) {
    super(ctx, 'storageDomain')
    this.tableValue = new MemoryTable()
  }

  async open() {
    return {
      table: () => this.tableValue,
      async close() {},
    }
  }
}

class FakeAgentPresets extends Service {
  constructor(ctx) {
    super(ctx, 'agentPresets')
    this.copyError = undefined
    this.removeError = undefined
  }

  async read(id) {
    return `composition:${id}`
  }

  async copy() {
    if (this.copyError !== undefined) throw this.copyError
  }

  async remove() {
    if (this.removeError !== undefined) throw this.removeError
  }
}

test('change tracker partitions profile, preset, prompt-resource, and runtime invalidations', async (t) => {
  const ctx = new Context()
  t.after(() => ctx.fiber.dispose())

  const trackerFiber = ctx.plugin(ContextManagerChangeTracker)
  await trackerFiber
  const tracker = ctx.dshContextChanges
  const initial = tracker.snapshot()

  ctx.emit('dsh-context-manager/change')
  let next = tracker.snapshot()
  assert.equal(next.generation, initial.generation + 1)
  assert.equal(next.profiles, initial.profiles + 1)
  assert.equal(next.presets, initial.presets + 1)
  assert.equal(next.runtime, initial.runtime + 1)
  assert.equal(next.promptResources, initial.promptResources)

  const beforePresetSettings = next
  ctx.emit('settings/document-updated', 'agent-presets', 9)
  next = tracker.snapshot()
  assert.equal(next.presets, beforePresetSettings.presets + 1)
  assert.equal(next.runtime, beforePresetSettings.runtime)

  const beforeUnrelatedSettings = next
  ctx.emit('settings/document-updated', 'unrelated', 10)
  assert.deepEqual(tracker.snapshot(), beforeUnrelatedSettings)

  for (const event of ['agent/created', 'agent/disposed', 'agent-preset/selected', 'skills/change', 'system-prompt/change']) {
    const before = tracker.snapshot()
    ctx.emit(event)
    const after = tracker.snapshot()
    assert.equal(after.generation, before.generation + 1)
    assert.equal(after.runtime, before.runtime + 1)
    assert.equal(after.profiles, before.profiles)
    assert.equal(after.promptResources, before.promptResources)
    assert.equal(after.presets, before.presets)
  }
})

test('profile Settings commits invalidate profiles, preset resolution, and runtime together', async (t) => {
  const ctx = new Context()
  t.after(() => ctx.fiber.dispose())

  const settingsFiber = ctx.plugin(MemorySettings, {})
  await settingsFiber
  const managerFiber = ctx.plugin(ContextManagerService)
  await managerFiber
  const trackerFiber = ctx.plugin(ContextManagerChangeTracker)
  await trackerFiber

  const before = ctx.dshContextChanges.snapshot()
  await ctx.dshContextManager.createProfile('main', {
    name: 'Main',
    basePreset: 'standard',
  }, ctx.dshContextManager.snapshot().persistence.revision)

  const after = ctx.dshContextChanges.snapshot()
  assert.ok(after.generation > before.generation)
  assert.ok(after.profiles > before.profiles)
  assert.ok(after.presets > before.presets)
  assert.ok(after.runtime > before.runtime)
  assert.equal(after.promptResources, before.promptResources)
})

test('PromptResource successful durable mutations bump promptResources and runtime exactly once', async (t) => {
  const ctx = new Context()
  t.after(() => ctx.fiber.dispose())

  const trackerFiber = ctx.plugin(ContextManagerChangeTracker)
  await trackerFiber
  const storageFiber = ctx.plugin(MemoryStorageDomain)
  await storageFiber
  const libraryFiber = ctx.plugin(ContextManagerPromptLibrary)
  await libraryFiber

  let before = ctx.dshContextChanges.snapshot()
  await ctx.dshContextPromptLibrary.createPrompt('p', { name: 'P', content: 'one' })
  let after = ctx.dshContextChanges.snapshot()
  assert.equal(after.generation, before.generation + 1)
  assert.equal(after.promptResources, before.promptResources + 1)
  assert.equal(after.runtime, before.runtime + 1)

  before = after
  await assert.rejects(
    ctx.dshContextPromptLibrary.createPrompt('p', { name: 'dup', content: 'x' }),
    error => error instanceof ContextManagerError && error.code === 'prompt-resource-exists',
  )
  assert.deepEqual(ctx.dshContextChanges.snapshot(), before)

  await ctx.dshContextPromptLibrary.setPromptContent('p', 'two', 1)
  after = ctx.dshContextChanges.snapshot()
  assert.equal(after.generation, before.generation + 1)
  assert.equal(after.promptResources, before.promptResources + 1)
  assert.equal(after.runtime, before.runtime + 1)

  before = after
  await assert.rejects(
    ctx.dshContextPromptLibrary.setPromptName('p', 'stale', 1),
    error => error instanceof ContextManagerError && error.code === 'prompt-resource-conflict',
  )
  assert.deepEqual(ctx.dshContextChanges.snapshot(), before)

  await ctx.dshContextPromptLibrary.deletePrompt('p', 2)
  after = ctx.dshContextChanges.snapshot()
  assert.equal(after.generation, before.generation + 1)
  assert.equal(after.promptResources, before.promptResources + 1)
  assert.equal(after.runtime, before.runtime + 1)
})

test('native preset authoring bumps only after successful copy/remove and never after refusal', async (t) => {
  const ctx = new Context()
  t.after(() => ctx.fiber.dispose())

  const trackerFiber = ctx.plugin(ContextManagerChangeTracker)
  await trackerFiber
  const authoringFiber = ctx.plugin(ContextManagerPresetAuthoring)
  await authoringFiber
  const nativeFiber = ctx.plugin(FakeAgentPresets)
  await nativeFiber

  let before = ctx.dshContextChanges.snapshot()
  await ctx.dshContextPresetAuthoring.copy('standard', 'mine')
  let after = ctx.dshContextChanges.snapshot()
  assert.equal(after.generation, before.generation + 1)
  assert.equal(after.presets, before.presets + 1)
  assert.equal(after.runtime, before.runtime)

  before = after
  ctx.agentPresets.copyError = new Error('native copy refusal')
  await assert.rejects(ctx.dshContextPresetAuthoring.copy('standard', 'bad'))
  assert.deepEqual(ctx.dshContextChanges.snapshot(), before)
  ctx.agentPresets.copyError = undefined

  await ctx.dshContextPresetAuthoring.remove('mine')
  after = ctx.dshContextChanges.snapshot()
  assert.equal(after.generation, before.generation + 1)
  assert.equal(after.presets, before.presets + 1)
})

test('change tracker instance identity is stable for one service lifetime and changes after remount', async () => {
  const ctx = new Context()
  const firstFiber = ctx.plugin(ContextManagerChangeTracker)
  await firstFiber
  const first = ctx.dshContextChanges.snapshot()
  assert.equal(ctx.dshContextChanges.snapshot().instanceId, first.instanceId)

  await firstFiber.dispose()
  const secondFiber = ctx.plugin(ContextManagerChangeTracker)
  await secondFiber
  const second = ctx.dshContextChanges.snapshot()
  assert.notEqual(second.instanceId, first.instanceId)

  await secondFiber.dispose()
  await ctx.fiber.dispose()
})
