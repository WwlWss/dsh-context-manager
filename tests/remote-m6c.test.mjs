import assert from 'node:assert/strict'
import { test } from 'node:test'

import { Context, Service } from '@deepseek-ai/cordis'

import {
  ContextManagerError,
  ContextManagerRemoteService,
} from '../lib/index.js'

class FakePresetDirectory extends Service {
  constructor(ctx) {
    super(ctx, 'dshContextPresetDirectory')
  }

  async snapshot() {
    return {
      directory: {
        status: 'available',
        defaultId: 'standard',
        authorable: true,
        presets: [{
          id: 'standard',
          trust: 'system',
          isDefault: true,
          name: 'Standard',
          path: '/host/secret/preset',
        }],
      },
      profiles: {
        main: {
          basePreset: {
            status: 'resolved',
            configuredId: 'standard',
            preset: {
              id: 'standard',
              trust: 'system',
              isDefault: true,
              path: '/host/secret/preset',
            },
          },
        },
      },
    }
  }
}

class FakePresetAuthoring extends Service {
  constructor(ctx) {
    super(ctx, 'dshContextPresetAuthoring')
    this.calls = []
  }

  async read(id) {
    this.calls.push(['read', id])
    return '  exact\r\ncomposition\n'
  }

  async copy(from, id, name) {
    this.calls.push(['copy', from, id, name])
  }

  async remove(id) {
    this.calls.push(['remove', id])
  }
}

class FakeSessionPreset extends Service {
  constructor(ctx) {
    super(ctx, 'dshContextSessionPresetIdentity')
  }

  snapshot(sessionId) {
    return { status: 'known', sessionId, presetId: 'standard', internal: 'drop' }
  }
}

class FakePromptPlacement extends Service {
  constructor(ctx) {
    super(ctx, 'dshContextPromptPlacement')
  }

  snapshot() {
    return {
      status: 'available',
      placements: {
        'before-persona': 'system-prompt',
        'after-persona': 'system-prompt',
        'before-tool-guidance': 'system-prompt',
        'after-tool-guidance': 'system-prompt',
        'runtime-context': 'runtime-context',
      },
      nativeOrder: 999,
    }
  }
}

class FakePromptRuntime extends Service {
  constructor(ctx) {
    super(ctx, 'dshContextPromptRuntime')
  }

  async inspect(agentId) {
    return {
      status: 'resolved',
      agentId,
      profile: {
        status: 'active',
        profileId: 'main',
        presetId: 'standard',
        profile: {
          name: 'Host-only profile object',
          secret: 'must not cross wire',
        },
      },
      bindings: [{
        state: 'eligible',
        bindingId: 'p',
        resourceId: 'resource',
        placement: 'after-persona',
        order: 0,
        resourceRevision: 7,
        nativeState: 'present',
        content: 'full prompt body must not cross wire',
      }],
    }
  }
}

class FakeSkillRuntime extends Service {
  constructor(ctx) {
    super(ctx, 'dshContextSkillRuntime')
  }

  async inspect(agentId) {
    return {
      status: 'resolved',
      agentId,
      profile: {
        status: 'active',
        profileId: 'main',
        presetId: 'standard',
        profile: { secret: 'drop' },
      },
      catalogComplete: true,
      bindings: [{
        state: 'native-pass-through',
        skillName: 'docker',
        mode: 'auto',
        winner: {
          provider: 'filesystem',
          invocation: {
            modelInvocable: true,
            userInvocable: true,
          },
        },
        instructions: 'full skill instructions must not cross wire',
        path: '/host/skill/SKILL.md',
      }],
    }
  }
}

class FakePinnedRuntime extends Service {
  constructor(ctx) {
    super(ctx, 'dshContextPinnedSkillRuntime')
  }

  async inspect(agentId) {
    return {
      status: 'resolved',
      agentId,
      profile: {
        status: 'active',
        profileId: 'main',
        presetId: 'standard',
        profile: { secret: 'drop' },
      },
      catalogComplete: true,
      nativeState: 'present',
      bindings: [{
        state: 'loaded',
        skillName: 'docker',
        nativeProvider: 'filesystem',
        body: 'pinned full instruction body must not cross wire',
        path: '/host/skill/SKILL.md',
      }],
    }
  }
}

class FakeChanges extends Service {
  constructor(ctx) {
    super(ctx, 'dshContextChanges')
  }

  snapshot() {
    return {
      instanceId: 'instance-1',
      generation: 12,
      profiles: 2,
      promptResources: 3,
      presets: 4,
      runtime: 5,
      internal: 'drop',
    }
  }
}

async function boot() {
  const ctx = new Context()
  for (const plugin of [
    FakePresetDirectory,
    FakePresetAuthoring,
    FakeSessionPreset,
    FakePromptPlacement,
    FakePromptRuntime,
    FakeSkillRuntime,
    FakePinnedRuntime,
    FakeChanges,
    ContextManagerRemoteService,
  ]) {
    const fiber = ctx.plugin(plugin)
    await fiber
  }
  return { ctx, remote: ctx.dshContextRemote }
}

test('M6C preset projection is path-free and authoring preserves exact ids/text', async (t) => {
  const { ctx, remote } = await boot()
  t.after(() => ctx.fiber.dispose())

  const presets = await remote.presets()
  assert.deepEqual(presets.directory, {
    status: 'available',
    defaultId: 'standard',
    authorable: true,
    presets: [{
      id: 'standard',
      trust: 'system',
      isDefault: true,
      name: 'Standard',
    }],
  })
  assert.deepEqual(presets.profiles.main.basePreset, {
    status: 'resolved',
    configuredId: 'standard',
  })
  assert.equal(JSON.stringify(presets).includes('/host/secret'), false)

  const read = await remote.readPreset(' standard ')
  assert.deepEqual(read, {
    ok: true,
    value: {
      id: ' standard ',
      content: '  exact\r\ncomposition\n',
    },
  })

  const copied = await remote.copyPreset('standard', 'mine', null)
  assert.deepEqual(copied, { ok: true, value: { id: 'mine' } })
  assert.deepEqual(ctx.dshContextPresetAuthoring.calls.at(-1), [
    'copy',
    'standard',
    'mine',
    undefined,
  ])

  const removed = await remote.removePreset('mine')
  assert.deepEqual(removed, { ok: true, value: { id: 'mine' } })
})

test('M6C maps stable preset-authoring absence but leaves unknown native failures thrown', async (t) => {
  class UnavailableAuthoring extends Service {
    constructor(ctx) { super(ctx, 'dshContextPresetAuthoring') }
    async read() { throw new ContextManagerError('preset-authoring-unavailable', 'missing') }
    async copy() { throw new ContextManagerError('preset-authoring-unavailable', 'missing') }
    async remove() { throw new Error('native refusal') }
  }

  const ctx = new Context()
  t.after(() => ctx.fiber.dispose())
  const directoryFiber = ctx.plugin(FakePresetDirectory)
  await directoryFiber
  const authoringFiber = ctx.plugin(UnavailableAuthoring)
  await authoringFiber
  const remoteFiber = ctx.plugin(ContextManagerRemoteService)
  await remoteFiber

  const read = await ctx.dshContextRemote.readPreset('x')
  assert.equal(read.ok, false)
  assert.equal(read.error.code, 'preset-authoring-unavailable')

  await assert.rejects(
    ctx.dshContextRemote.removePreset('x'),
    /native refusal/,
  )
})

test('M6C runtime diagnostics strip Host profile bodies, prompt content, skill bodies, and paths', async (t) => {
  const { ctx, remote } = await boot()
  t.after(() => ctx.fiber.dispose())

  assert.deepEqual(remote.sessionPreset('s1'), {
    status: 'known',
    sessionId: 's1',
    presetId: 'standard',
  })

  assert.deepEqual(remote.promptPlacement(), {
    status: 'available',
    placements: {
      'before-persona': 'system-prompt',
      'after-persona': 'system-prompt',
      'before-tool-guidance': 'system-prompt',
      'after-tool-guidance': 'system-prompt',
      'runtime-context': 'runtime-context',
    },
  })

  const prompt = await remote.inspectPromptRuntime('agent-1')
  assert.equal(prompt.status, 'resolved')
  assert.deepEqual(prompt.profile, {
    status: 'active',
    profileId: 'main',
    presetId: 'standard',
  })
  assert.equal(Object.hasOwn(prompt.profile, 'profile'), false)
  assert.equal(Object.hasOwn(prompt.bindings[0], 'content'), false)

  const skill = await remote.inspectSkillRuntime('agent-1')
  assert.equal(skill.status, 'resolved')
  assert.equal(Object.hasOwn(skill.profile, 'profile'), false)
  assert.equal(Object.hasOwn(skill.bindings[0], 'instructions'), false)
  assert.equal(Object.hasOwn(skill.bindings[0], 'path'), false)

  const pinned = await remote.inspectPinnedSkillRuntime('agent-1')
  assert.equal(pinned.status, 'resolved')
  assert.equal(Object.hasOwn(pinned.profile, 'profile'), false)
  assert.equal(Object.hasOwn(pinned.bindings[0], 'body'), false)
  assert.equal(Object.hasOwn(pinned.bindings[0], 'path'), false)
})

test('M6C changes endpoint exposes only invalidation cursors', async (t) => {
  const { ctx, remote } = await boot()
  t.after(() => ctx.fiber.dispose())

  assert.deepEqual(remote.changes(), {
    instanceId: 'instance-1',
    generation: 12,
    profiles: 2,
    promptResources: 3,
    presets: 4,
    runtime: 5,
  })
})
