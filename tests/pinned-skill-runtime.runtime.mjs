import assert from 'node:assert/strict'
import { test } from 'node:test'

import { Context, Service } from '@deepseek-ai/cordis'
import SystemPrompt, { renderPrompt } from '@deepseek-ai/dsh-system-prompt'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import { bindScopeParent, createScope } from '@deepseek-ai/dsh-scope'

import { ContextManagerPinnedSkillRuntime } from '../lib/index.js'

const generation = process.env.DSH_M5C_GENERATION
if (generation !== 'legacy' && generation !== 'named') {
  throw new Error('DSH_M5C_GENERATION must be legacy or named')
}

const SLOT = 'dsh-context-manager:slot:pinned-skills'
const VARIABLE = 'dsh_context_manager_pinned_skill_bundle'

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
        basePreset: 'preset-a',
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

  snapshot(sessionId) {
    return {
      status: 'known',
      sessionId,
      presetId: this.state.presetId,
    }
  }
}

function scopedSkills(ctx) {
  const skills = ctx.get('skills')
  if (skills === undefined) throw new Error('skills service missing')
  return skills
}

function candidate(provider, name, content, extra = {}) {
  return {
    ...extra,
    name,
    description: `${name} description`,
    invocation: {
      modelInvocable: true,
      userInvocable: true,
    },
    source: 'custom',
    provider,
    rank: 0,
    locator: { content },
  }
}

function provider(name, rows, counters = { list: 0, get: 0 }) {
  return {
    name,
    counters,
    async list() {
      counters.list += 1
      return rows
    },
    async get(selected) {
      counters.get += 1
      return {
        name: selected.name,
        description: selected.description,
        invocation: selected.invocation,
        source: selected.source,
        provider: selected.provider,
        ...(selected.resourceBase === undefined ? {} : { resourceBase: selected.resourceBase }),
        content: selected.locator.content,
      }
    },
  }
}

function mintAgent(root, id, parentKey) {
  const agent = {
    id,
    ctx: undefined,
    session: {
      header: {
        cwd: `/workspace/${id}`,
      },
    },
  }
  const binding = parentKey === undefined ? undefined : bindScopeParent(agent, parentKey)
  const scope = createScope(root, agent)
  agent.ctx = scope.ctx
  return { agent, scope, binding }
}

async function installBase(root) {
  await root.plugin(
    SystemPrompt,
    generation === 'legacy'
      ? { persona: 'Native persona' }
      : { personaPrefix: 'Native persona' },
  )
  await root.plugin(SkillRegistry)
}

async function bootRuntime(root, agents, state) {
  await root.plugin(FakeContextManager, state)
  await root.plugin(FakeSessionPresetIdentity, state)
  await root.plugin(FakeAgents, agents)
  const fiber = root.plugin(ContextManagerPinnedSkillRuntime)
  await fiber
  return {
    fiber,
    runtime: root.get('dshContextPinnedSkillRuntime'),
  }
}

async function assemble(root, agent) {
  return await root.systemPrompt.assemble({
    scope: agent,
    agent,
  })
}

test('M5C renders parent-native Pinned bodies in code-unit order and preserves literal braces', async () => {
  const root = new Context()
  await installBase(root)

  const presetKey = {}
  const preset = createScope(root, presetKey)
  const native = provider('native-provider', [
    candidate('native-provider', 'zeta', 'ZETA {{unknown}}', {
      resourceBase: { kind: 'directory', path: '/skills/zeta' },
    }),
    candidate('native-provider', 'alpha', 'ALPHA {{malformed value}}'),
  ])
  const stopNative = scopedSkills(preset.ctx).registerProvider(() => native)
  const current = mintAgent(root, 'agent-a', presetKey)
  const second = mintAgent(root, 'agent-b', presetKey)

  const afterToolOrder = generation === 'legacy'
    ? 199.5
    : root.systemPrompt.getSectionOrder('TOOLS_SDK') - 0.5
  const stopLeft = root.systemPrompt.section({
    name: 'm5c:test-left-anchor',
    order: afterToolOrder,
    text: 'LEFT_ANCHOR',
  })
  const stopRight = root.systemPrompt.section({
    name: 'm5c:test-right-anchor',
    order: afterToolOrder + 0.5,
    text: 'RIGHT_ANCHOR',
  })

  const state = {
    presetId: 'preset-a',
    skills: {
      zeta: 'pinned',
      alpha: 'pinned',
      ignored: 'off',
    },
  }
  const runtime = await bootRuntime(root, [current.agent, second.agent], state)

  let assembly = await assemble(root, current.agent)
  const secondAssembly = await assemble(root, second.agent)
  assert.notEqual(secondAssembly.sections.findIndex(section => section.name === SLOT), -1)
  const slot = assembly.sections.find(section => section.name === SLOT)
  assert.ok(slot)
  assert.equal(slot.text, `{{${VARIABLE}}}`)

  const bundle = assembly.variables[VARIABLE]
  assert.equal(typeof bundle, 'string')
  assert.ok(bundle.includes('<skill_content name="alpha">'))
  assert.ok(bundle.includes('<skill_content name="zeta">'))
  assert.ok(bundle.indexOf('name="alpha"') < bundle.indexOf('name="zeta"'))
  assert.ok(bundle.includes('ALPHA {{malformed value}}'))
  assert.ok(bundle.includes('ZETA {{unknown}}'))
  assert.ok(bundle.includes('Base directory for this skill: /skills/zeta'))

  const names = assembly.sections.map(section => section.name)
  assert.ok(names.indexOf('m5c:test-left-anchor') < names.indexOf(SLOT))
  assert.ok(names.indexOf(SLOT) < names.indexOf('m5c:test-right-anchor'))

  const rendered = renderPrompt(assembly)
  assert.ok(rendered.includes('ALPHA {{malformed value}}'))
  assert.ok(rendered.includes('ZETA {{unknown}}'))
  assert.equal(native.counters.get, 2)

  state.skills = {
    zeta: 'off',
    alpha: 'manual',
  }
  assembly = await assemble(root, current.agent)
  assert.equal(assembly.sections.some(section => section.name === SLOT), false)
  assert.equal(assembly.variables[VARIABLE], '')
  assert.equal(native.counters.get, 2, 'non-Pinned assembly must not load bodies')

  const inspected = await runtime.runtime.inspect('agent-a')
  assert.equal(inspected.status, 'resolved')
  assert.equal(inspected.nativeState, 'empty')
  assert.equal(JSON.stringify(inspected).includes('ALPHA'), false)

  await runtime.fiber.dispose()
  stopRight()
  stopLeft()
  stopNative()
  await second.scope.dispose()
  await current.scope.dispose()
  await preset.dispose()
  await root.fiber.dispose()
})

test('M5C follows dynamic parent rebind and ignores Agent-local same-name Skills', async () => {
  const root = new Context()
  await installBase(root)

  const presetAKey = {}
  const presetBKey = {}
  const presetA = createScope(root, presetAKey)
  const presetB = createScope(root, presetBKey)
  const stopA = scopedSkills(presetA.ctx).registerProvider(() =>
    provider('preset-a-provider', [candidate('preset-a-provider', 'target', 'BODY_A')]),
  )
  const stopB = scopedSkills(presetB.ctx).registerProvider(() =>
    provider('preset-b-provider', [candidate('preset-b-provider', 'target', 'BODY_B')]),
  )

  const current = mintAgent(root, 'agent-reparent', presetAKey)
  const stopLocal = scopedSkills(current.agent.ctx).registerProvider(() =>
    provider('agent-local-provider', [candidate('agent-local-provider', 'target', 'LOCAL_BODY')]),
  )
  const state = {
    presetId: 'preset-a',
    skills: { target: 'pinned' },
  }
  const runtime = await bootRuntime(root, [current.agent], state)

  let text = renderPrompt(await assemble(root, current.agent))
  assert.ok(text.includes('BODY_A'))
  assert.equal(text.includes('LOCAL_BODY'), false)

  current.binding.rebind(presetBKey)
  text = renderPrompt(await assemble(root, current.agent))
  assert.ok(text.includes('BODY_B'))
  assert.equal(text.includes('BODY_A'), false)
  assert.equal(text.includes('LOCAL_BODY'), false)

  await runtime.fiber.dispose()
  stopLocal()
  stopB()
  stopA()
  await current.scope.dispose()
  await presetB.dispose()
  await presetA.dispose()
  await root.fiber.dispose()
})

test('M5C incomplete catalog injects no partial body and does no native get()', async () => {
  const root = new Context()
  await installBase(root)

  let gets = 0
  const stopNative = scopedSkills(root).registerProvider(() => ({
    name: 'incomplete-provider',
    async list() {
      return {
        candidates: [candidate('incomplete-provider', 'target', 'SHOULD_NOT_LOAD')],
        complete: false,
      }
    },
    async get() {
      gets += 1
      throw new Error('incomplete catalog body must not load')
    },
  }))

  const current = mintAgent(root, 'agent-incomplete')
  const state = {
    presetId: 'preset-a',
    skills: {
      target: 'pinned',
      missing: 'pinned',
    },
  }
  const runtime = await bootRuntime(root, [current.agent], state)

  const assembly = await assemble(root, current.agent)
  assert.equal(assembly.sections.some(section => section.name === SLOT), false)
  assert.equal(gets, 0)

  const inspected = await runtime.runtime.inspect('agent-incomplete')
  assert.equal(inspected.status, 'resolved')
  assert.equal(inspected.catalogComplete, false)
  assert.equal(inspected.nativeState, 'empty')
  assert.deepEqual(
    inspected.bindings.map(item => [item.skillName, item.state]),
    [
      ['missing', 'catalog-incomplete'],
      ['target', 'catalog-incomplete'],
    ],
  )
  assert.equal(gets, 0)

  await runtime.fiber.dispose()
  stopNative()
  await current.scope.dispose()
  await root.fiber.dispose()
})

test('M5C inspection reports missing/get-race states and native complete suppression without exposing bodies', async () => {
  const root = new Context()
  await installBase(root)

  const stopNative = scopedSkills(root).registerProvider(() => ({
    name: 'native-provider',
    async list() {
      return [
        candidate('native-provider', 'present', 'SECRET_PINNED_BODY'),
        candidate('native-provider', 'vanishes', 'never returned'),
      ]
    },
    async get(selected) {
      if (selected.name === 'vanishes') return undefined
      return {
        name: selected.name,
        description: selected.description,
        invocation: selected.invocation,
        source: selected.source,
        provider: selected.provider,
        content: selected.locator.content,
      }
    },
  }))

  const current = mintAgent(root, 'agent-inspect')
  const state = {
    presetId: 'preset-a',
    skills: {
      missing: 'pinned',
      present: 'pinned',
      vanishes: 'pinned',
    },
  }
  const runtime = await bootRuntime(root, [current.agent], state)

  let inspected = await runtime.runtime.inspect('agent-inspect')
  assert.equal(inspected.status, 'resolved')
  assert.equal(inspected.nativeState, 'present')
  assert.deepEqual(
    inspected.bindings.map(item => [item.skillName, item.state]),
    [
      ['missing', 'missing-native-skill'],
      ['present', 'loaded'],
      ['vanishes', 'definition-unavailable'],
    ],
  )
  assert.equal(JSON.stringify(inspected).includes('SECRET_PINNED_BODY'), false)

  const disposeComplete = current.agent.ctx.systemPrompt.section({
    name: 'm5c:test-complete',
    order: 0,
    text: 'COMPLETE',
    complete: true,
  })
  inspected = await runtime.runtime.inspect('agent-inspect')
  assert.equal(inspected.status, 'resolved')
  assert.equal(inspected.nativeState, 'native-suppressed')
  disposeComplete()

  await runtime.fiber.dispose()
  stopNative()
  await current.scope.dispose()
  await root.fiber.dispose()
})

test('M5C runtime disposal aborts an in-flight native body load', async () => {
  const root = new Context()
  await installBase(root)

  const started = Promise.withResolvers()
  const stopNative = scopedSkills(root).registerProvider(() => ({
    name: 'abort-provider',
    async list() {
      return [candidate('abort-provider', 'target', 'unused')]
    },
    async get(_candidate, options) {
      started.resolve(options.signal)
      return await new Promise((resolve, reject) => {
        if (options.signal?.aborted) {
          reject(options.signal.reason)
          return
        }
        options.signal?.addEventListener('abort', () => reject(options.signal.reason), { once: true })
      })
    },
  }))

  const current = mintAgent(root, 'agent-abort')
  const state = {
    presetId: 'preset-a',
    skills: { target: 'pinned' },
  }
  const runtime = await bootRuntime(root, [current.agent], state)

  const pending = assemble(root, current.agent)
  const rejected = assert.rejects(pending)
  const signal = await started.promise
  assert.equal(signal.aborted, false)

  await runtime.fiber.dispose()
  assert.equal(signal.aborted, true)
  await rejected

  stopNative()
  await current.scope.dispose()
  await root.fiber.dispose()
})
