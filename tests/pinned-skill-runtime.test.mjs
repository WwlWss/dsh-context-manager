import assert from 'node:assert/strict'
import { test } from 'node:test'

import { Context, Service } from '@deepseek-ai/cordis'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import { bindScopeParent, createScope } from '@deepseek-ai/dsh-scope'

import {
  inspectAgentPinnedSkillRuntime,
  installAgentPinnedSkillRuntime,
  PINNED_SKILL_BUNDLE_VARIABLE,
  PINNED_SKILL_SLOT_NAME,
  PINNED_SKILL_SLOT_TEXT,
  resolvePinnedSkillBundle,
} from '../src/adapters/pinned-skill-runtime.ts'

const TARGETS = Object.freeze({
  'before-persona': Object.freeze({ channel: 'section', order: -0.5 }),
  'after-persona': Object.freeze({ channel: 'section', order: 0.5 }),
  'before-tool-guidance': Object.freeze({ channel: 'section', order: 99.5 }),
  'after-tool-guidance': Object.freeze({ channel: 'section', order: 199.5 }),
  'runtime-context': Object.freeze({ channel: 'runtime-context', order: 120.5 }),
})

class FakeSystemPrompt extends Service {
  constructor(ctx) {
    super(ctx, 'systemPrompt')
    this.sections = []
    this.variables = new Map()
  }

  section(entry) {
    this.sections.push(entry)
    return () => {
      const index = this.sections.indexOf(entry)
      if (index >= 0) this.sections.splice(index, 1)
    }
  }

  variable(name, provider) {
    if (this.variables.has(name)) throw new Error(`duplicate variable ${name}`)
    this.variables.set(name, provider)
    return () => this.variables.delete(name)
  }

  async assemble(context = {}) {
    const assembly = {
      sections: this.sections
        .slice()
        .sort((a, b) => a.order - b.order || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
        .map(({ name, text }) => ({
          name,
          text: typeof text === 'function' ? text(context) : text,
        })),
      contexts: [],
      tools: [],
      variables: Object.fromEntries(
        [...this.variables].map(([name, provider]) => [name, provider(context)]),
      ),
    }
    return await this.ctx.waterfall(
      this.ctx,
      'system-prompt/assemble',
      assembly,
      context,
      () => Promise.resolve(assembly),
    )
  }
}

function renderLegacyPrompt(assembly) {
  return assembly.sections
    .map(section => section.text.replace(
      /\{\{([a-z][a-z0-9_]*)\}\}/g,
      (_match, name) => {
        if (!Object.hasOwn(assembly.variables, name)) throw new Error(`unknown variable ${name}`)
        return assembly.variables[name] ?? ''
      },
    ))
    .filter(Boolean)
    .join('\n\n')
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

function activeProfile(skills, presetId = 'standard') {
  return {
    status: 'active',
    profileId: 'profile',
    presetId,
    profile: Object.freeze({
      name: 'Profile',
      basePreset: presetId,
      skills: Object.freeze(
        Object.fromEntries(
          Object.entries(skills).map(([name, mode]) => [name, Object.freeze({ mode })]),
        ),
      ),
      prompts: Object.freeze({}),
    }),
  }
}

test('M5C resolves parent-native Pinned bodies in deterministic code-unit order and preserves literal braces', async () => {
  const root = new Context()
  await root.plugin(SkillRegistry)

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
  await current.agent.ctx.plugin(FakeSystemPrompt)

  let profile = activeProfile({
    zeta: 'pinned',
    alpha: 'pinned',
    ignored: 'off',
  })
  const dispose = installAgentPinnedSkillRuntime(
    root,
    current.agent,
    TARGETS,
    () => profile,
  )

  const assembly = await current.agent.ctx.systemPrompt.assemble({
    scope: current.agent,
    agent: current.agent,
  })
  const section = assembly.sections.find(item => item.name === PINNED_SKILL_SLOT_NAME)
  assert.equal(section?.text, PINNED_SKILL_SLOT_TEXT)

  const bundle = assembly.variables[PINNED_SKILL_BUNDLE_VARIABLE]
  assert.equal(typeof bundle, 'string')
  assert.ok(bundle.includes('<skill_content name="alpha">'))
  assert.ok(bundle.includes('<skill_content name="zeta">'))
  assert.ok(bundle.indexOf('name="alpha"') < bundle.indexOf('name="zeta"'))
  assert.ok(bundle.includes('ALPHA {{malformed value}}'))
  assert.ok(bundle.includes('ZETA {{unknown}}'))
  assert.ok(bundle.includes('Base directory for this skill: /skills/zeta'))

  const rendered = renderLegacyPrompt(assembly)
  assert.ok(rendered.includes('ALPHA {{malformed value}}'))
  assert.ok(rendered.includes('ZETA {{unknown}}'))
  assert.equal(native.counters.get, 2)

  profile = activeProfile({ zeta: 'off', alpha: 'manual' })
  const cleared = await current.agent.ctx.systemPrompt.assemble({
    scope: current.agent,
    agent: current.agent,
  })
  assert.equal(cleared.sections.some(item => item.name === PINNED_SKILL_SLOT_NAME), false)
  assert.equal(cleared.variables[PINNED_SKILL_BUNDLE_VARIABLE], '')
  assert.equal(native.counters.get, 2, 'non-Pinned assembly must not load bodies')

  dispose()
  stopNative()
  await current.scope.dispose()
  await preset.dispose()
  await root.fiber.dispose()
})

test('M5C uses the dynamic parent view and never an Agent-local same-name Skill', async () => {
  const root = new Context()
  await root.plugin(SkillRegistry)

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
  await current.agent.ctx.plugin(FakeSystemPrompt)
  const stopLocal = scopedSkills(current.agent.ctx).registerProvider(() =>
    provider('agent-local-provider', [candidate('agent-local-provider', 'target', 'LOCAL_BODY')]),
  )

  const dispose = installAgentPinnedSkillRuntime(
    root,
    current.agent,
    TARGETS,
    () => activeProfile({ target: 'pinned' }),
  )

  let assembly = await current.agent.ctx.systemPrompt.assemble({ scope: current.agent })
  assert.ok(assembly.variables[PINNED_SKILL_BUNDLE_VARIABLE].includes('BODY_A'))
  assert.equal(assembly.variables[PINNED_SKILL_BUNDLE_VARIABLE].includes('LOCAL_BODY'), false)

  current.binding.rebind(presetBKey)
  assembly = await current.agent.ctx.systemPrompt.assemble({ scope: current.agent })
  assert.ok(assembly.variables[PINNED_SKILL_BUNDLE_VARIABLE].includes('BODY_B'))
  assert.equal(assembly.variables[PINNED_SKILL_BUNDLE_VARIABLE].includes('BODY_A'), false)

  dispose()
  stopLocal()
  stopB()
  stopA()
  await current.scope.dispose()
  await presetB.dispose()
  await presetA.dispose()
  await root.fiber.dispose()
})

test('M5C incomplete parent catalog injects no partial bundle and loads no bodies', async () => {
  const root = new Context()
  await root.plugin(SkillRegistry)

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
      throw new Error('body should not load from incomplete catalog')
    },
  }))

  const current = mintAgent(root, 'agent-incomplete')
  const resolution = await resolvePinnedSkillBundle(
    root,
    current.agent,
    activeProfile({ target: 'pinned', missing: 'pinned' }),
  )

  assert.equal(resolution.catalogComplete, false)
  assert.equal(resolution.text, '')
  assert.deepEqual(
    resolution.bindings.map(item => [item.skillName, item.state]),
    [
      ['missing', 'catalog-incomplete'],
      ['target', 'catalog-incomplete'],
    ],
  )
  assert.equal(gets, 0)

  stopNative()
  await current.scope.dispose()
  await root.fiber.dispose()
})

test('M5C inspection distinguishes missing definitions and native complete suppression without exposing bodies', async () => {
  const root = new Context()
  await root.plugin(SkillRegistry)

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
  await current.agent.ctx.plugin(FakeSystemPrompt)
  const dispose = installAgentPinnedSkillRuntime(
    root,
    current.agent,
    TARGETS,
    () => activeProfile({
      missing: 'pinned',
      present: 'pinned',
      vanishes: 'pinned',
    }),
  )

  let inspected = await inspectAgentPinnedSkillRuntime(current.agent)
  assert.equal(inspected.nativeState, 'present')
  assert.equal(inspected.resolution.catalogComplete, true)
  assert.deepEqual(
    inspected.resolution.bindings.map(item => [item.skillName, item.state]),
    [
      ['missing', 'missing-native-skill'],
      ['present', 'loaded'],
      ['vanishes', 'definition-unavailable'],
    ],
  )
  assert.equal(JSON.stringify(inspected.resolution.bindings).includes('SECRET_PINNED_BODY'), false)

  const stopComplete = current.agent.ctx.systemPrompt.section({
    name: 'test:complete',
    order: 0,
    text: 'COMPLETE',
    complete: true,
  })

  // FakeSystemPrompt does not enforce complete after the waterfall, so simulate
  // the native post-waterfall rule with one downstream listener.
  const stopCompleteRule = current.agent.ctx.on(
    'system-prompt/assemble',
    async (assembly, _context, next) => {
      const result = await next()
      result.sections = result.sections.filter(section => section.name === 'test:complete')
      return result
    },
  )

  inspected = await inspectAgentPinnedSkillRuntime(current.agent)
  assert.equal(inspected.nativeState, 'native-suppressed')

  stopCompleteRule()
  stopComplete()
  dispose()
  stopNative()
  await current.scope.dispose()
  await root.fiber.dispose()
})

test('M5C disposal aborts an in-flight native body load', async () => {
  const root = new Context()
  await root.plugin(SkillRegistry)

  const started = Promise.withResolvers()
  const stopNative = scopedSkills(root).registerProvider(() => ({
    name: 'abort-provider',
    async list() {
      return [candidate('abort-provider', 'target', 'unused')]
    },
    async get(_selected, options) {
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
  await current.agent.ctx.plugin(FakeSystemPrompt)
  const dispose = installAgentPinnedSkillRuntime(
    root,
    current.agent,
    TARGETS,
    () => activeProfile({ target: 'pinned' }),
  )

  const pending = current.agent.ctx.systemPrompt.assemble({ scope: current.agent })
  const rejected = assert.rejects(pending)
  const signal = await started.promise
  assert.equal(signal.aborted, false)

  dispose()
  assert.equal(signal.aborted, true)
  await rejected

  stopNative()
  await current.scope.dispose()
  await root.fiber.dispose()
})
