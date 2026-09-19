import assert from 'node:assert/strict'
import { test } from 'node:test'

import { Context, Service } from '@deepseek-ai/cordis'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import { createScope } from '@deepseek-ai/dsh-scope'

import {
  CONTEXT_MANAGER_SKILL_PROVIDER,
} from '../src/adapters/skill-runtime.ts'
import { ContextManagerSkillRuntime } from '../src/service/skill-runtime.ts'

function scopedSkills(ctx) {
  const skills = ctx.get('skills')
  if (skills === undefined) throw new Error('skills service missing')
  return skills
}

function nativeCandidate() {
  return {
    name: 'target',
    description: 'Target skill',
    invocation: {
      modelInvocable: true,
      userInvocable: true,
    },
    source: 'custom',
    provider: 'native-provider',
    rank: 0,
    locator: 'target',
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
  constructor(ctx) {
    super(ctx, 'dshContextManager')
    this.mode = 'off'
  }

  defaultProfileCandidate() {
    return {
      status: 'candidate',
      profileId: 'profile',
      profile: Object.freeze({
        name: 'Profile',
        basePreset: 'standard',
        skills: Object.freeze({
          target: Object.freeze({ mode: this.mode }),
        }),
        prompts: Object.freeze({}),
      }),
    }
  }
}

class FakeSessionPresetIdentity extends Service {
  constructor(ctx) {
    super(ctx, 'dshContextSessionPresetIdentity')
  }

  snapshot(id) {
    return {
      status: 'known',
      sessionId: id,
      presetId: 'standard',
    }
  }
}

function mintAgent(root, id) {
  const agent = {
    id,
    ctx: undefined,
    session: {
      header: {
        cwd: `/workspace/${id}`,
      },
    },
  }
  const scope = createScope(root, agent)
  agent.ctx = scope.ctx
  return { agent, scope }
}

test('Skill runtime coalesces one CM authority change to one registry invalidation across Agents', async () => {
  const root = new Context()
  await root.plugin(SkillRegistry)

  const stopNative = scopedSkills(root).registerProvider(() => ({
    name: 'native-provider',
    async list() {
      return [nativeCandidate()]
    },
    async get(candidate) {
      return {
        name: candidate.name,
        description: candidate.description,
        invocation: candidate.invocation,
        source: candidate.source,
        provider: candidate.provider,
        content: 'native body',
      }
    },
  }))

  const first = mintAgent(root, 'agent-a')
  const second = mintAgent(root, 'agent-b')
  const agents = [first.agent, second.agent]

  await root.plugin(FakeContextManager)
  await root.plugin(FakeSessionPresetIdentity)
  await root.plugin(FakeAgents, agents)

  let skillChanges = 0
  root.on('skills/change', () => {
    skillChanges += 1
  })

  const runtimeFiber = root.plugin(ContextManagerSkillRuntime)
  await runtimeFiber
  const runtime = root.get('dshContextSkillRuntime')
  assert.ok(runtime)

  for (const agent of agents) {
    const winner = (await scopedSkills(root).snapshot({ scope: agent }))
      .skills.find(skill => skill.name === 'target')
    assert.equal(winner?.provider, CONTEXT_MANAGER_SKILL_PROVIDER)
    assert.deepEqual(winner?.invocation, {
      modelInvocable: false,
      userInvocable: false,
    })
  }

  const before = skillChanges
  root.emit('dsh-context-manager/change')
  await Promise.resolve()
  assert.equal(skillChanges, before + 1)

  const inspected = await runtime.inspect('agent-a')
  assert.equal(inspected.status, 'resolved')
  assert.equal(inspected.catalogComplete, true)
  assert.equal(inspected.bindings[0]?.state, 'policy-applied')

  assert.deepEqual(await runtime.inspect('missing-agent'), {
    status: 'agent-not-live',
    agentId: 'missing-agent',
  })

  await runtimeFiber.dispose()

  for (const agent of agents) {
    const restored = (await scopedSkills(root).snapshot({ scope: agent }))
      .skills.find(skill => skill.name === 'target')
    assert.equal(restored?.provider, 'native-provider')
    assert.deepEqual(restored?.invocation, {
      modelInvocable: true,
      userInvocable: true,
    })
  }

  stopNative()
  await second.scope.dispose()
  await first.scope.dispose()
  await root.fiber.dispose()
})
