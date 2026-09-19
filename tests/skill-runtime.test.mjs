import assert from 'node:assert/strict'
import { test } from 'node:test'

import { Context } from '@deepseek-ai/cordis'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import { bindScopeParent, createScope } from '@deepseek-ai/dsh-scope'

import {
  CONTEXT_MANAGER_SKILL_PROVIDER,
  installAgentSkillPolicyProvider,
  inspectAgentSkillPolicy,
} from '../src/adapters/skill-runtime.ts'

function scopedSkills(ctx) {
  const skills = ctx.get('skills')
  if (skills === undefined) throw new Error('skills service missing')
  return skills
}

function candidate(provider, name, invocation, content, rank = 0) {
  return {
    name,
    description: `${name} description`,
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

function profileResolution(skills, basePreset = 'standard') {
  const profile = Object.freeze({
    name: 'Profile',
    basePreset,
    skills: Object.freeze(
      Object.fromEntries(
        Object.entries(skills).map(([name, mode]) => [
          name,
          Object.freeze({ mode }),
        ]),
      ),
    ),
    prompts: Object.freeze({}),
  })

  return Object.freeze({
    status: 'active',
    profileId: 'profile',
    profile,
    presetId: basePreset,
  })
}

function mintAgent(root, id, parentKey) {
  const agent = { id, ctx: undefined }
  if (parentKey !== undefined) bindScopeParent(agent, parentKey)
  const scope = createScope(root, agent)
  agent.ctx = scope.ctx
  return { agent, scope }
}

test('Agent Skill policy provider preserves Auto, shadows managed modes, and loads bodies lazily', async () => {
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

  const { agent, scope } = mintAgent(root, 'agent-a', presetKey)
  let resolution = profileResolution({
    'auto-skill': 'auto',
    'manual-skill': 'manual',
    'off-skill': 'off',
    'pinned-skill': 'pinned',
    'missing-skill': 'off',
  })
  const installed = installAgentSkillPolicyProvider(
    root,
    agent,
    () => resolution,
  )

  const catalog = await scopedSkills(root).snapshot({ scope: agent })
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
  assert.equal(byName.get('manual-skill')?.provider, CONTEXT_MANAGER_SKILL_PROVIDER)

  for (const name of ['off-skill', 'pinned-skill']) {
    assert.deepEqual(byName.get(name)?.invocation, {
      modelInvocable: false,
      userInvocable: false,
    })
    assert.equal(byName.get(name)?.provider, CONTEXT_MANAGER_SKILL_PROVIDER)
  }

  assert.equal(byName.has('missing-skill'), false)
  assert.equal(nativeCounters.get, 0, 'catalog discovery must not load bodies')

  const manual = await scopedSkills(root).get('manual-skill', { scope: agent })
  assert.ok(manual)
  assert.equal(manual.provider, 'native-provider')
  assert.equal(manual.content, 'manual body')
  assert.deepEqual(manual.metadata, { native: 'native-provider' })
  assert.deepEqual(manual.invocation, {
    modelInvocable: false,
    userInvocable: true,
  })
  assert.equal(nativeCounters.get, 1)

  const inspected = await inspectAgentSkillPolicy(root, agent, resolution)
  assert.equal(inspected.complete, true)
  const inspection = new Map(inspected.bindings.map(item => [item.skillName, item]))
  assert.equal(inspection.get('auto-skill')?.state, 'native-pass-through')
  assert.equal(inspection.get('manual-skill')?.state, 'policy-applied')
  assert.equal(inspection.get('off-skill')?.state, 'policy-applied')
  assert.equal(inspection.get('pinned-skill')?.state, 'policy-applied')
  assert.equal(inspection.get('missing-skill')?.state, 'missing-native-skill')
  assert.equal(nativeCounters.get, 1, 'inspection must remain metadata-only')

  installed.dispose()

  const restored = await scopedSkills(root).snapshot({ scope: agent })
  assert.equal(restored.skills.find(skill => skill.name === 'off-skill')?.provider, 'native-provider')
  assert.deepEqual(
    restored.skills.find(skill => skill.name === 'off-skill')?.invocation,
    { modelInvocable: true, userInvocable: true },
  )

  resolution = profileResolution({})
  await scope.dispose()
  await preset.dispose()
  stopNative()
  await root.fiber.dispose()
})

test('proxy get re-reads current mode instead of trusting a cached candidate', async () => {
  const root = new Context()
  await root.plugin(SkillRegistry)

  const native = provider('native-provider', [
    candidate('native-provider', 'target', {
      modelInvocable: true,
      userInvocable: false,
    }, 'native body'),
  ])
  const stopNative = scopedSkills(root).registerProvider(() => native)

  const { agent, scope } = mintAgent(root, 'agent-stale')
  let resolution = profileResolution({ target: 'manual' })
  const installed = installAgentSkillPolicyProvider(root, agent, () => resolution)

  // Populate the outer Agent-view cache with a Manual CM proxy candidate.
  const initial = await scopedSkills(root).snapshot({ scope: agent })
  assert.equal(initial.skills.find(skill => skill.name === 'target')?.provider, CONTEXT_MANAGER_SKILL_PROVIDER)

  // No provider invalidation here: get() must still observe current Domain.
  resolution = profileResolution({ target: 'off' })
  let loaded = await scopedSkills(root).get('target', { scope: agent })
  assert.deepEqual(loaded?.invocation, {
    modelInvocable: false,
    userInvocable: false,
  })

  resolution = profileResolution({ target: 'auto' })
  loaded = await scopedSkills(root).get('target', { scope: agent })
  assert.deepEqual(loaded?.invocation, {
    modelInvocable: true,
    userInvocable: false,
  })
  assert.equal(loaded?.provider, 'native-provider')

  resolution = Object.freeze({
    status: 'base-preset-mismatch',
    profileId: 'profile',
    expectedPresetId: 'standard',
    actualPresetId: 'other',
  })
  loaded = await scopedSkills(root).get('target', { scope: agent })
  assert.deepEqual(loaded?.invocation, {
    modelInvocable: true,
    userInvocable: false,
  })

  installed.dispose()
  await scope.dispose()
  stopNative()
  await root.fiber.dispose()
})

test('provider re-reads live Agent parent on list and get after preset rebind', async () => {
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

  const agent = { id: 'agent-reparent', ctx: undefined }
  const binding = bindScopeParent(agent, presetAKey)
  const scope = createScope(root, agent)
  agent.ctx = scope.ctx

  const resolution = profileResolution({ target: 'off' })
  const installed = installAgentSkillPolicyProvider(root, agent, () => resolution)

  let loaded = await scopedSkills(root).get('target', { scope: agent })
  assert.equal(loaded?.provider, 'preset-a-provider')
  assert.equal(loaded?.content, 'body A')
  assert.deepEqual(loaded?.invocation, {
    modelInvocable: false,
    userInvocable: false,
  })

  binding.rebind(presetBKey)

  loaded = await scopedSkills(root).get('target', { scope: agent })
  assert.equal(loaded?.provider, 'preset-b-provider')
  assert.equal(loaded?.content, 'body B')
  assert.deepEqual(loaded?.invocation, {
    modelInvocable: false,
    userInvocable: false,
  })

  installed.dispose()
  await scope.dispose()
  stopB()
  stopA()
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

  const { agent, scope } = mintAgent(root, 'agent-local')
  const local = provider('agent-local-provider', [
    candidate('agent-local-provider', 'target', {
      modelInvocable: true,
      userInvocable: true,
    }, 'local body', 0),
  ])
  const stopLocal = scopedSkills(agent.ctx).registerProvider(() => local)

  const resolution = profileResolution({ target: 'off' })
  const installed = installAgentSkillPolicyProvider(root, agent, () => resolution)

  const winner = (await scopedSkills(root).snapshot({ scope: agent }))
    .skills.find(skill => skill.name === 'target')
  assert.equal(winner?.provider, 'agent-local-provider')

  const inspected = await inspectAgentSkillPolicy(root, agent, resolution)
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

  installed.dispose()
  stopLocal()
  await scope.dispose()
  stopNative()
  await root.fiber.dispose()
})
