import assert from 'node:assert/strict'
import { test } from 'node:test'

import { Context, Service } from '@deepseek-ai/cordis'
import { SettingsProvider } from '@deepseek-ai/dsh-settings'

import {
  CONTEXT_MANAGER_SETTINGS_NAMESPACE,
  ContextManagerError,
  ContextManagerPresetAuthoring,
  ContextManagerPresetDirectory,
  ContextManagerService,
  ContextManagerSessionPresetIdentity,
} from '../lib/index.js'

class FakeAgentPresets extends Service {
  constructor(ctx, state) {
    super(ctx, 'agentPresets')
    this.state = state
  }

  read(id) {
    this.state.calls.push(['read', id])
    if (this.state.readError !== undefined) throw this.state.readError
    return Promise.resolve(this.state.readValue)
  }

  copy(from, id, name) {
    this.state.calls.push(['copy', from, id, name])
    if (this.state.copyError !== undefined) throw this.state.copyError
    return Promise.resolve()
  }

  remove(id) {
    this.state.calls.push(['remove', id])
    if (this.state.removeError !== undefined) throw this.state.removeError
    return Promise.resolve()
  }

  list() {
    throw new Error('M3C bridge must not preflight the native roster')
  }

  mount() {
    throw new Error('M3C bridge must not mount presets')
  }

  recompose() {
    throw new Error('M3C bridge must not recompose agents')
  }

  select() {
    throw new Error('M3C bridge must not select presets for sessions')
  }
}

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

class MutableAgentPresets extends Service {
  constructor(ctx, state) {
    super(ctx, 'agentPresets')
    this.state = state
  }

  get defaultId() {
    return this.state.defaultId
  }

  get authorable() {
    return true
  }

  async list() {
    return this.state.presets
  }

  async read(id) {
    return `composition:${id}`
  }

  async copy(from, id, name) {
    if (this.state.presets.some(preset => preset.id === id)) {
      throw new Error(`preset ${id} already exists`)
    }
    this.state.presets.push({
      id,
      trust: 'user',
      ...(name === undefined ? {} : { name }),
      description: `copied from ${from}`,
    })
  }

  async remove(id) {
    const index = this.state.presets.findIndex(preset => preset.id === id)
    if (index === -1) throw new Error(`preset ${id} not found`)
    this.state.presets.splice(index, 1)
  }
}

class FakeSessions extends Service {
  constructor(ctx, sessions) {
    super(ctx, 'sessions')
    this.sessions = sessions
  }

  get(id) {
    return this.sessions.get(id)
  }
}

function nativeState(overrides = {}) {
  return {
    calls: [],
    readValue: '- name: example\n',
    ...overrides,
  }
}

async function boot(state) {
  const ctx = new Context()
  const authoringFiber = ctx.plugin(ContextManagerPresetAuthoring)
  await authoringFiber

  let presetFiber
  if (state !== undefined) {
    presetFiber = ctx.plugin(FakeAgentPresets, state)
    await presetFiber
  }

  return {
    ctx,
    authoring: ctx.get('dshContextPresetAuthoring'),
    authoringFiber,
    presetFiber,
  }
}

function isUnavailable(error) {
  return error instanceof ContextManagerError
    && error.code === 'preset-authoring-unavailable'
}

test('authoring service remains composed when native agentPresets is absent', async () => {
  const { authoring } = await boot()

  await assert.rejects(authoring.read('standard'), isUnavailable)
  await assert.rejects(authoring.copy('standard', 'mine'), isUnavailable)
  await assert.rejects(authoring.remove('mine'), isUnavailable)
})

test('optional agentPresets attach, detach, and reattach are observed without caching', async () => {
  const { ctx, authoring } = await boot()

  const first = nativeState({ readValue: 'first' })
  const firstFiber = ctx.plugin(FakeAgentPresets, first)
  await firstFiber
  assert.equal(await authoring.read('standard'), 'first')

  await firstFiber.dispose()
  await assert.rejects(authoring.read('standard'), isUnavailable)

  const second = nativeState({ readValue: 'second' })
  const secondFiber = ctx.plugin(FakeAgentPresets, second)
  await secondFiber
  assert.equal(await authoring.read('standard'), 'second')
  assert.deepEqual(first.calls, [['read', 'standard']])
  assert.deepEqual(second.calls, [['read', 'standard']])
})

test('read returns native composition text exactly and performs no roster or runtime operation', async () => {
  const content = '  - name: plugin\n    config: !!js/function >\n      function () { return 1 }\n'
  const state = nativeState({ readValue: content })
  const { authoring } = await boot(state)

  assert.equal(await authoring.read('  Native-ID  '), content)
  assert.deepEqual(state.calls, [['read', '  Native-ID  ']])
})

test('copy delegates exact authored strings and preserves an omitted display name', async () => {
  const state = nativeState()
  const { authoring } = await boot(state)

  await authoring.copy(' Source-ID ', ' Target-ID ', '  Display Name  ')
  await authoring.copy('standard', 'mine')

  assert.deepEqual(state.calls, [
    ['copy', ' Source-ID ', ' Target-ID ', '  Display Name  '],
    ['copy', 'standard', 'mine', undefined],
  ])
})

test('remove delegates the exact id and does not inspect trust or roster state first', async () => {
  const state = nativeState()
  const { authoring } = await boot(state)

  await authoring.remove('  maybe-user  ')

  assert.deepEqual(state.calls, [['remove', '  maybe-user  ']])
})

test('native read, copy, and remove refusals propagate by identity', async () => {
  const readError = new Error('native read refusal')
  const copyError = new Error('native copy refusal')
  const removeError = new Error('native remove refusal')
  const state = nativeState({ readError, copyError, removeError })
  const { authoring } = await boot(state)

  await assert.rejects(authoring.read('standard'), error => error === readError)
  await assert.rejects(authoring.copy('standard', 'mine'), error => error === copyError)
  await assert.rejects(authoring.remove('mine'), error => error === removeError)
})

test('read validates only read() and ignores malformed unrelated authoring methods', async () => {
  class ReadOnlyAgentPresets extends Service {
    constructor(ctx) {
      super(ctx, 'agentPresets')
      this.copy = 42
      this.remove = null
    }

    read(id) {
      return Promise.resolve(`read:${id}`)
    }
  }

  const ctx = new Context()
  const authoringFiber = ctx.plugin(ContextManagerPresetAuthoring)
  await authoringFiber
  const nativeFiber = ctx.plugin(ReadOnlyAgentPresets)
  await nativeFiber

  assert.equal(await ctx.dshContextPresetAuthoring.read('standard'), 'read:standard')
})

test('copy validates only copy() and ignores malformed unrelated methods', async () => {
  class CopyOnlyAgentPresets extends Service {
    constructor(ctx) {
      super(ctx, 'agentPresets')
      this.read = 42
      this.remove = null
      this.calls = []
    }

    copy(from, id, name) {
      this.calls.push([from, id, name])
      return Promise.resolve()
    }
  }

  const ctx = new Context()
  const authoringFiber = ctx.plugin(ContextManagerPresetAuthoring)
  await authoringFiber
  const nativeFiber = ctx.plugin(CopyOnlyAgentPresets)
  await nativeFiber

  await ctx.dshContextPresetAuthoring.copy('standard', 'mine', 'Mine')
  assert.deepEqual(ctx.agentPresets.calls, [['standard', 'mine', 'Mine']])
})

test('remove validates only remove() and ignores malformed unrelated methods', async () => {
  class RemoveOnlyAgentPresets extends Service {
    constructor(ctx) {
      super(ctx, 'agentPresets')
      this.read = 42
      this.copy = null
      this.calls = []
    }

    remove(id) {
      this.calls.push(id)
      return Promise.resolve()
    }
  }

  const ctx = new Context()
  const authoringFiber = ctx.plugin(ContextManagerPresetAuthoring)
  await authoringFiber
  const nativeFiber = ctx.plugin(RemoveOnlyAgentPresets)
  await nativeFiber

  await ctx.dshContextPresetAuthoring.remove('mine')
  assert.deepEqual(ctx.agentPresets.calls, ['mine'])
})

test('a present incompatible service fails loud on the operation whose method is missing', async () => {
  class BrokenAgentPresets extends Service {
    constructor(ctx) {
      super(ctx, 'agentPresets')
      this.read = 42
    }
  }

  const ctx = new Context()
  const authoringFiber = ctx.plugin(ContextManagerPresetAuthoring)
  await authoringFiber
  const nativeFiber = ctx.plugin(BrokenAgentPresets)
  await nativeFiber

  await assert.rejects(
    ctx.dshContextPresetAuthoring.read('standard'),
    /unsupported agentPresets authoring API; expected read\(\)/,
  )
})

test('a malformed read result fails loud instead of being normalized', async () => {
  const state = nativeState({ readValue: { content: 'not the legacy Host contract' } })
  const { authoring } = await boot(state)

  await assert.rejects(
    authoring.read('standard'),
    /unsupported agentPresets authoring API; read\(\) must resolve to a string/,
  )
})

test('technical JavaScript type boundaries reject non-string inputs without calling native operations', async () => {
  const state = nativeState()
  const { authoring } = await boot(state)

  await assert.rejects(authoring.read(123), /preset id must be a string/)
  await assert.rejects(authoring.copy('standard', 123), /target preset id must be a string/)
  await assert.rejects(authoring.copy('standard', 'mine', 123), /preset display name must be a string/)
  await assert.rejects(authoring.remove(123), /preset id must be a string/)
  assert.deepEqual(state.calls, [])
})

test('deleting a native preset leaves configured profile intent and live Session identity independent', async () => {
  const ctx = new Context()
  const settingsDoc = {
    [CONTEXT_MANAGER_SETTINGS_NAMESPACE]: {
      schemaVersion: 1,
      profiles: {
        roleplay: {
          name: 'Roleplay',
          basePreset: 'my-preset',
          skills: {},
        },
      },
    },
  }
  const native = {
    defaultId: 'standard',
    presets: [
      { id: 'standard', trust: 'system' },
      { id: 'my-preset', trust: 'user' },
    ],
  }
  const sessions = new Map([
    ['session-1', {
      header: { agentPreset: 'my-preset' },
      events: [],
    }],
  ])

  await ctx.plugin(MemorySettings, settingsDoc)
  await ctx.plugin(ContextManagerService)
  await ctx.plugin(ContextManagerPresetDirectory)
  await ctx.plugin(ContextManagerSessionPresetIdentity)
  await ctx.plugin(ContextManagerPresetAuthoring)
  await ctx.plugin(MutableAgentPresets, native)
  await ctx.plugin(FakeSessions, sessions)

  let snapshot = await ctx.dshContextPresetDirectory.snapshot()
  assert.equal(snapshot.profiles.roleplay.basePreset.status, 'resolved')
  assert.deepEqual(ctx.dshContextSessionPresetIdentity.snapshot('session-1'), {
    status: 'known',
    sessionId: 'session-1',
    presetId: 'my-preset',
  })

  await ctx.dshContextPresetAuthoring.remove('my-preset')

  snapshot = await ctx.dshContextPresetDirectory.snapshot()
  assert.deepEqual(snapshot.profiles.roleplay.basePreset, {
    status: 'missing',
    configuredId: 'my-preset',
  })
  assert.equal(ctx.dshContextManager.snapshot().profiles.roleplay.basePreset, 'my-preset')
  assert.deepEqual(ctx.dshContextSessionPresetIdentity.snapshot('session-1'), {
    status: 'known',
    sessionId: 'session-1',
    presetId: 'my-preset',
  })
})
