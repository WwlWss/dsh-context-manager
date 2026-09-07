import assert from 'node:assert/strict'
import { test } from 'node:test'

import { Context, Service } from '@deepseek-ai/cordis'
import { SettingsProvider } from '@deepseek-ai/dsh-settings'

import {
  CONTEXT_MANAGER_SETTINGS_NAMESPACE,
  ContextManagerPresetDirectory,
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

class FakeAgentPresets extends Service {
  constructor(ctx, state) {
    super(ctx, 'agentPresets')
    this.state = state
  }

  get defaultId() {
    return this.state.defaultId
  }

  get authorable() {
    return this.state.authorable
  }

  async list() {
    this.state.listCalls++
    if (this.state.listError !== undefined) throw this.state.listError
    return this.state.presets
  }

  mount() {
    throw new Error('M3A must not mount presets')
  }

  recompose() {
    throw new Error('M3A must not recompose presets')
  }

  standingKeyFor() {
    throw new Error('M3A must not create standing preset mounts')
  }
}

function profile(basePreset, name = basePreset) {
  return {
    name,
    basePreset,
    skills: {},
  }
}

function settingsDoc(profiles, schemaVersion = 1) {
  return {
    [CONTEXT_MANAGER_SETTINGS_NAMESPACE]: {
      schemaVersion,
      profiles,
    },
  }
}

async function boot({ profiles = {}, schemaVersion = 1, presetState, withSettings = true } = {}) {
  const ctx = new Context()

  let settingsFiber
  if (withSettings) {
    settingsFiber = ctx.plugin(MemorySettings, settingsDoc(profiles, schemaVersion))
    await settingsFiber
  }

  const managerFiber = ctx.plugin(ContextManagerService)
  await managerFiber

  const directoryFiber = ctx.plugin(ContextManagerPresetDirectory)
  await directoryFiber

  let presetFiber
  if (presetState !== undefined) {
    presetFiber = ctx.plugin(FakeAgentPresets, presetState)
    await presetFiber
  }

  return {
    ctx,
    manager: ctx.get('dshContextManager'),
    directory: ctx.get('dshContextPresetDirectory'),
    settingsFiber,
    managerFiber,
    directoryFiber,
    presetFiber,
  }
}

function nativeState(overrides = {}) {
  return {
    defaultId: 'standard',
    authorable: true,
    presets: [],
    listCalls: 0,
    ...overrides,
  }
}

test('directory remains active without agentPresets and preserves configured ids as unavailable', async () => {
  const { directory } = await boot({
    profiles: {
      roleplay: profile('future-preset'),
    },
  })

  const snapshot = await directory.snapshot()
  assert.equal(snapshot.directory.status, 'unavailable')
  assert.deepEqual(snapshot.profiles.roleplay, {
    basePreset: {
      status: 'unavailable',
      configuredId: 'future-preset',
    },
  })
})

test('native roster remains available when Settings is absent', async () => {
  const state = nativeState({
    presets: [{ id: 'standard', trust: 'system' }],
  })
  const { directory } = await boot({
    withSettings: false,
    presetState: state,
  })

  const snapshot = await directory.snapshot()
  assert.equal(snapshot.directory.status, 'available')
  assert.equal(snapshot.directory.presets.length, 1)
  assert.deepEqual(Object.keys(snapshot.profiles), [])
})

test('optional agentPresets attach and detach are observed without a stale cache', async () => {
  const state = nativeState({
    presets: [{ id: 'standard', trust: 'system' }],
  })
  const { ctx, directory } = await boot({
    profiles: { main: profile('standard') },
  })

  assert.equal((await directory.snapshot()).directory.status, 'unavailable')

  const presetFiber = ctx.plugin(FakeAgentPresets, state)
  await presetFiber
  let snapshot = await directory.snapshot()
  assert.equal(snapshot.directory.status, 'available')
  assert.equal(snapshot.profiles.main.basePreset.status, 'resolved')

  await presetFiber.dispose()
  snapshot = await directory.snapshot()
  assert.equal(snapshot.directory.status, 'unavailable')
  assert.equal(snapshot.profiles.main.basePreset.status, 'unavailable')
})

test('configured ids resolve exactly to resolved, missing, or broken without native-default fallback', async () => {
  const state = nativeState({
    defaultId: 'standard',
    presets: [
      {
        id: 'standard',
        trust: 'system',
        name: 'Standard',
        description: 'Default preset',
      },
      {
        id: 'broken-preset',
        trust: 'user',
        broken: 'missing composition',
      },
    ],
  })
  const { directory } = await boot({
    profiles: {
      good: profile('standard'),
      missing: profile('future-preset'),
      broken: profile('broken-preset'),
    },
    presetState: state,
  })

  const snapshot = await directory.snapshot()
  assert.equal(snapshot.profiles.good.basePreset.status, 'resolved')
  assert.equal(snapshot.profiles.missing.basePreset.status, 'missing')
  assert.equal(snapshot.profiles.missing.basePreset.configuredId, 'future-preset')
  assert.equal(snapshot.profiles.broken.basePreset.status, 'broken')
  assert.equal(snapshot.profiles.broken.basePreset.reason, 'missing composition')
  assert.equal(snapshot.directory.defaultId, 'standard')
})

test('one aggregate snapshot performs exactly one native list call regardless of profile count', async () => {
  const profiles = Object.create(null)
  for (let index = 0; index < 100; index++) {
    profiles[`profile-${index}`] = profile(index % 2 === 0 ? 'standard' : 'other')
  }

  const state = nativeState({
    presets: [
      { id: 'standard', trust: 'system' },
      { id: 'other', trust: 'user' },
    ],
  })
  const { directory } = await boot({ profiles, presetState: state })

  await directory.snapshot()
  assert.equal(state.listCalls, 1)

  await directory.snapshot()
  assert.equal(state.listCalls, 2)
})

test('roster changes are visible on the next snapshot because M3A keeps no cross-snapshot cache', async () => {
  const state = nativeState({ presets: [] })
  const { directory } = await boot({
    profiles: { future: profile('future-preset') },
    presetState: state,
  })

  assert.equal((await directory.snapshot()).profiles.future.basePreset.status, 'missing')
  state.presets = [{ id: 'future-preset', trust: 'user' }]
  assert.equal((await directory.snapshot()).profiles.future.basePreset.status, 'resolved')
})

test('a present agentPresets service whose list fails rejects instead of masquerading as unavailable', async () => {
  const failure = new Error('native discovery failed')
  const state = nativeState({ listError: failure })
  const { directory } = await boot({
    profiles: { main: profile('standard') },
    presetState: state,
  })

  await assert.rejects(directory.snapshot(), error => error === failure)
})

test('an incompatible agentPresets service fails loud instead of masquerading as unavailable', async () => {
  class BrokenAgentPresets extends Service {
    constructor(ctx) {
      super(ctx, 'agentPresets')
      this.defaultId = 'standard'
      this.authorable = true
    }
  }

  const { ctx, directory } = await boot({
    profiles: { main: profile('standard') },
  })
  const fiber = ctx.plugin(BrokenAgentPresets)
  await fiber

  await assert.rejects(
    directory.snapshot(),
    /unsupported agentPresets API; expected list\(\)/,
  )
})

test('invalid minimum roster fields fail loud while unknown extra fields remain compatible', async () => {
  const state = nativeState({
    presets: [{
      id: 'standard',
      trust: 'system',
      futureField: { safeToIgnore: true },
    }],
  })
  const { directory } = await boot({
    profiles: { main: profile('standard') },
    presetState: state,
  })

  assert.equal((await directory.snapshot()).profiles.main.basePreset.status, 'resolved')

  state.presets = [{ id: 'standard', trust: 'workspace' }]
  await assert.rejects(
    directory.snapshot(),
    /unsupported agentPresets API; list\(\)\[0\]\.trust/,
  )
})

test('native rows are projected to immutable path-free DTOs without leaking source references or policy fields', async () => {
  const native = {
    id: 'standard',
    trust: 'system',
    path: '/host/private/presets/standard/cordis.yml',
    order: 10,
    name: 'Standard',
    description: 'Native default',
  }
  const state = nativeState({ presets: [native] })
  const { directory } = await boot({
    profiles: { main: profile('standard') },
    presetState: state,
  })

  const snapshot = await directory.snapshot()
  const row = snapshot.directory.presets[0]

  assert.deepEqual(row, {
    id: 'standard',
    trust: 'system',
    isDefault: true,
    name: 'Standard',
    description: 'Native default',
  })
  assert.notEqual(row, native)
  assert.equal('path' in row, false)
  assert.equal('order' in row, false)
  assert.equal('editable' in row, false)
  assert.equal(Object.isFrozen(snapshot), true)
  assert.equal(Object.isFrozen(snapshot.directory), true)
  assert.equal(Object.isFrozen(snapshot.directory.presets), true)
  assert.equal(Object.isFrozen(row), true)
  assert.equal(Object.isFrozen(snapshot.profiles), true)
  assert.equal(Object.isFrozen(snapshot.profiles.main), true)
  assert.equal(Object.isFrozen(snapshot.profiles.main.basePreset), true)
})

test('M3A never touches mount, recompose, or standing-mount APIs', async () => {
  const state = nativeState({
    presets: [{ id: 'standard', trust: 'system' }],
  })
  const { directory } = await boot({
    profiles: { main: profile('standard') },
    presetState: state,
  })

  const snapshot = await directory.snapshot()
  assert.equal(snapshot.profiles.main.basePreset.status, 'resolved')
})

test('malformed stored profiles remain a Domain concern and are not reparsed by preset discovery', async () => {
  const state = nativeState({
    presets: [{ id: 'standard', trust: 'system' }],
  })
  const { directory, manager } = await boot({
    profiles: {
      good: profile('standard'),
      broken: { name: 42, basePreset: 'standard' },
    },
    presetState: state,
  })

  const domain = manager.snapshot()
  assert.equal(domain.profiles.broken, undefined)
  assert.ok(domain.diagnostics.some(item => item.code === 'invalid-profile' && item.profileId === 'broken'))

  const snapshot = await directory.snapshot()
  assert.deepEqual(Object.keys(snapshot.profiles), ['good'])
})

test('unsupported schema versions can still expose the native directory but produce no usable profile resolutions', async () => {
  const state = nativeState({
    presets: [{ id: 'standard', trust: 'system' }],
  })
  const { directory } = await boot({
    profiles: { future: profile('standard') },
    schemaVersion: 999,
    presetState: state,
  })

  const snapshot = await directory.snapshot()
  assert.equal(snapshot.directory.status, 'available')
  assert.equal(snapshot.directory.presets.length, 1)
  assert.deepEqual(Object.keys(snapshot.profiles), [])
})
