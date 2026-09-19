import assert from 'node:assert/strict'
import { test } from 'node:test'

import { Context, Service } from '@deepseek-ai/cordis'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import { bindScopeParent, createScope } from '@deepseek-ai/dsh-scope'

import { ContextManagerSkillRuntime } from '../lib/index.js'

const CM_PROVIDER = 'dsh-context-manager-policy'

function scopedSkills(ctx) {
  const skills = ctx.get('skills')
  if (skills === undefined) throw new Error('skills service missing')
  return skills
}

function candidate(provider, name, invocation, content, rank = 0) {
  return {
    name,
    description: \`\${name} description\`,
    invocation,
    source: 'custom',
    provider,
    rank,
    locator: { content },
  }
}

function provider(name, candidates, counters = { list: 0, get: 0 }) {
  return {
    name,
    counters,
    async list() {
      counters.list += 1
      return candidates
    },
    async get(selected) {
      counters.get += 1
      return {
        name: selected.name,
        description: selected.description,
        invocation: selected.invocation,
        source: selected.source,
        provider: selected.provider,
        content: selected.locator.content,
        metadata: Object.freeze({ native: name }),
      }
    },
  }
}

class FakeAgents extends Service {
  constructor(ctx, agents) {
    super(ctx, 'agents')
    this.agents = agents
  }

  get(id) {
    return this.agents.find(agent => agent.id === id)
  }

  list() {
    return [...this.agents]
  }
}

class FakeContextManager extends Service {
  constructor(ctx, state) {
    super(ctx, 'dshContextManager')
    this.state = state
  }

  defaultProfileCandidate() {
    return {
      status: 'candidate',
      profileId: 'profile',
      profile: Object.freeze({
        name: 'Profile',
        basePreset: 'standard',
        skills: Object.freeze(
          Object.fromEntries(
            Object.entries(this.state.skills).map(([name, mode]) => [
              name,
              Object.freeze({ mode }),
            ]),
          ),
        ),
        prompts: Object.freeze({}),
      }),
    }
  }
}

class FakeSessionPresetIdentity extends Service {
  constructor(ctx, state) {
    super(ctx, 'dshContextSessionPresetIdentity')
    this.state = state
  }

  snapshot(id) {
    return {
      status: 'known',
      sessionId: id,
      presetId: this.state.presetId,
    }
  }
}

function mintAgent(root, id, parentKey) {
  const agent = {
    id,
    ctx: undefined,
    session: {
      header: {
        cwd: \`/workspace/\${id}\`,
      },
    },
  }
  const binding = parentKey === undefined
    ? undefined
    : bindScopeParent(agent, parentKey)
  const scope = createScope(root, agent)
  agent.ctx = scope.ctx
  return { agent, scope, binding }
}

async function bootRuntime(root, agents, state) {
  await root.plugin(FakeContextManager, state)
  await root.plugin(FakeSessionPresetIdentity, state)
  await root.plugin(FakeAgents, agents)
  const fiber = root.plugin(ContextManagerSkillRuntime)
  await fiber
  return {
    fiber,
    runtime: root.get('dshContextSkillRuntime'),
  }
}

test('M5B runtime preserves Auto, shadows managed modes, and keeps discovery body-free', async () => {
  const root = new Context()
  await root.plugin(SkillRegistry)

  const presetKey = {}
  const preset = createScope(root, presetKey)
  const nativeCounters = { list: 0, get: 0 }
  const native = provider('native-provider', [
    candidate('native-provider', 'auto-skill', {
      modelInvocable: false,
      userInvocable: true,
    }, 'auto body'),
    candidate('native-provider', 'manual-skill', {
      modelInvocable: true,
      userInvocable: false,
    }, 'manual body'),
    candidate('native-provider', 'off-skill', {
      modelInvocable: true,
      userInvocable: true,
    }, 'off body'),
    candidate('native-provider', 'pinned-skill', {
      modelInvocable: true,
      userInvocable: true,
    }, 'pinned body'),
  ], nativeCounters)
  const stopNative = scopedSkills(preset.ctx).registerProvider(() => native)

  const current = mintAgent(root, 'agent-a', presetKey)
  const state = {
    presetId: 'standard',
    skills: {
      'auto-skill': 'auto',
      'manual-skill': 'manual',
      'off-skill': 'off',
      'pinned-skill': 'pinned',
      'missing-skill': 'off',
    },
  }
  const runtime = await bootRuntime(root, [current.agent], state)

  const catalog = await scopedSkills(root).snapshot({ scope: current.agent })
  const byName = new Map(catalog.skills.map(skill => [skill.name, skill]))

  assert.equal(catalog.complete, true)
  assert.deepEqual(byName.get('auto-skill')?.invocation, {
    modelInvocable: false,
    userInvocable: true,
  })
  assert.equal(byName.get('auto-skill')?.provider, 'native-provider')
  assert.deepEqual(byName.get('manual-skill')?.invocation, {
    modelInvocable: false,
    userInvocable: true,
  })
  assert.equal(byName.get('manual-skill')?.provider, CM_PROVIDER)

  for (const name of ['off-skill', 'pinned-skill']) {
    assert.deepEqual(byName.get(name)?.invocation, {
      modelInvocable: false,
      userInvocable: false,
    })
    assert.equal(byName.get(name)?.provider, CM_PROVIDER)
  }

  assert.equal(byName.has('missing-skill'), false)
  assert.equal(nativeCounters.get, 0, 'catalog discovery must not load bodies')

  const manual = await scopedSkills(root).get('manual-skill', { scope: current.agent })
  assert.ok(manual)
  assert.equal(manual.provider, 'native-provider')
  assert.equal(manual.content, 'manual body')
  assert.deepEqual(manual.metadata, { native: 'native-provider' })
  assert.deepEqual(manual.invocation, {
    modelInvocable: false,
    userInvocable: true,
  })
  assert.equal(nativeCounters.get, 1)

  const inspected = await runtime.runtime.inspect('agent-a')
  assert.equal(inspected.status, 'resolved')
  assert.equal(inspected.catalogComplete, true)
  const inspection = new Map(inspected.bindings.map(item => [item.skillName, item]))
  assert.equal(inspection.get('auto-skill')?.state, 'native-pass-through')
  assert.equal(inspection.get('manual-skill')?.state, 'policy-applied')
  assert.equal(inspection.get('off-skill')?.state, 'policy-applied')
  assert.equal(inspection.get('pinned-skill')?.state, 'policy-applied')
  assert.equal(inspection.get('missing-skill')?.state, 'missing-native-skill')
  assert.equal(nativeCounters.get, 1, 'inspection must remain metadata-only')

  await runtime.fiber.dispose()

  const restored = await scopedSkills(root).snapshot({ scope: current.agent })
  assert.equal(restored.skills.find(skill => skill.name === 'off-skill')?.provider, 'native-provider')
  assert.deepEqual(
    restored.skills.find(skill => skill.name === 'off-skill')?.invocation,
    { modelInvocable: true, userInvocable: true },
  )

  stopNative()
  await current.scope.dispose()
  await preset.dispose()
  await root.fiber.dispose()
})

test('M5B proxy get re-reads current mode instead of trusting a cached candidate', async () => {
  const root = new Context()
  await root.plugin(SkillRegistry)

  const native = provider('native-provider', [
    candidate('native-provider', 'target', {
      modelInvocable: true,
      userInvocable: false,
    }, 'native body'),
  ])
  const stopNative = scopedSkills(root).registerProvider(() => native)

  const current = mintAgent(root, 'agent-stale')
  const state = {
    presetId: 'standard',
    skills: { target: 'manual' },
  }
  const runtime = await bootRuntime(root, [current.agent], state)

  const initial = await scopedSkills(root).snapshot({ scope: current.agent })
  assert.equal(initial.skills.find(skill => skill.name === 'target')?.provider, CM_PROVIDER)

  state.skills.target = 'off'
  let loaded = await scopedSkills(root).get('target', { scope: current.agent })
  assert.deepEqual(loaded?.invocation, {
    modelInvocable: false,
    userInvocable: false,
  })

  state.skills.target = 'auto'
  loaded = await scopedSkills(root).get('target', { scope: current.agent })
  assert.deepEqual(loaded?.invocation, {
    modelInvocable: true,
    userInvocable: false,
  })
  assert.equal(loaded?.provider, 'native-provider')

  state.presetId = 'other-preset'
  loaded = await scopedSkills(root).get('target', { scope: current.agent })
  assert.deepEqual(loaded?.invocation, {
    modelInvocable: true,
    userInvocable: false,
  })

  await runtime.fiber.dispose()
  stopNative()
  await current.scope.dispose()
  await root.fiber.dispose()
})

test('M5B re-reads live Agent parent on get after preset rebind', async () => {
  const root = new Context()
  await root.plugin(SkillRegistry)

  const presetAKey = {}
  const presetBKey = {}
  const presetA = createScope(root, presetAKey)
  const presetB = createScope(root, presetBKey)

  const stopA = scopedSkills(presetA.ctx).registerProvider(() =>
    provider('preset-a-provider', [
      candidate('preset-a-provider', 'target', {
        modelInvocable: true,
        userInvocable: true,
      }, 'body A'),
    ]),
  )
  const stopB = scopedSkills(presetB.ctx).registerProvider(() =>
    provider('preset-b-provider', [
      candidate('preset-b-provider', 'target', {
        modelInvocable: true,
        userInvocable: true,
      }, 'body B'),
    ]),
  )

  const current = mintAgent(root, 'agent-reparent', presetAKey)
  const state = {
    presetId: 'standard',
    skills: { target: 'off' },
  }
  const runtime = await bootRuntime(root, [current.agent], state)

  let loaded = await scopedSkills(root).get('target', { scope: current.agent })
  assert.equal(loaded?.provider, 'preset-a-provider')
  assert.equal(loaded?.content, 'body A')

  current.binding.rebind(presetBKey)

  loaded = await scopedSkills(root).get('target', { scope: current.agent })
  assert.equal(loaded?.provider, 'preset-b-provider')
  assert.equal(loaded?.content, 'body B')
  assert.deepEqual(loaded?.invocation, {
    modelInvocable: false,
    userInvocable: false,
  })

  await runtime.fiber.dispose()
  stopB()
  stopA()
  await current.scope.dispose()
  await presetB.dispose()
  await presetA.dispose()
  await root.fiber.dispose()
})

test('lower-rank Agent-local provider wins and inspection reports policy not effective', async () => {
  const root = new Context()
  await root.plugin(SkillRegistry)

  const stopNative = scopedSkills(root).registerProvider(() =>
    provider('native-provider', [
      candidate('native-provider', 'target', {
        modelInvocable: true,
        userInvocable: true,
      }, 'native body'),
    ]),
  )

  const current = mintAgent(root, 'agent-local')
  const local = provider('agent-local-provider', [
    candidate('agent-local-provider', 'target', {
      modelInvocable: true,
      userInvocable: true,
    }, 'local body', 0),
  ])
  const stopLocal = scopedSkills(current.agent.ctx).registerProvider(() => local)

  const state = {
    presetId: 'standard',
    skills: { target: 'off' },
  }
  const runtime = await bootRuntime(root, [current.agent], state)

  const winner = (await scopedSkills(root).snapshot({ scope: current.agent }))
    .skills.find(skill => skill.name === 'target')
  assert.equal(winner?.provider, 'agent-local-provider')

  const inspected = await runtime.runtime.inspect('agent-local')
  assert.equal(inspected.status, 'resolved')
  assert.deepEqual(inspected.bindings, [{
    state: 'policy-not-effective',
    skillName: 'target',
    mode: 'off',
    nativeProvider: 'native-provider',
    expectedInvocation: {
      modelInvocable: false,
      userInvocable: false,
    },
    winner: {
      provider: 'agent-local-provider',
      invocation: {
        modelInvocable: true,
        userInvocable: true,
      },
    },
  }])

  await runtime.fiber.dispose()
  stopLocal()
  stopNative()
  await current.scope.dispose()
  await root.fiber.dispose()
})
