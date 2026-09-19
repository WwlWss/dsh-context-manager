import assert from 'node:assert/strict'
import { test } from 'node:test'

import { Context, Service } from '@deepseek-ai/cordis'

import {
  installAgentPromptRuntime,
  PROMPT_RUNTIME_SLOT_NAMES,
  promptBindingContributionName,
} from '../src/adapters/prompt-runtime.ts'


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
    this.contexts = []
  }

  section(entry) {
    this.sections.push(entry)
    return () => {
      const index = this.sections.indexOf(entry)
      if (index >= 0) this.sections.splice(index, 1)
    }
  }

  context(entry) {
    this.contexts.push(entry)
    return () => {
      const index = this.contexts.indexOf(entry)
      if (index >= 0) this.contexts.splice(index, 1)
    }
  }
}

function fakeAgent(id = 'agent-a') {
  return { id, ctx: new Context() }
}

function assemblyFor(systemPrompt, { includeContext = true } = {}) {
  return {
    sections: systemPrompt.sections
      .slice()
      .sort((a, b) => a.order - b.order)
      .map(({ name, text }) => ({ name, text })),
    contexts: includeContext
      ? systemPrompt.contexts
        .slice()
        .sort((a, b) => a.order - b.order)
        .map(({ name, text }) => ({ name, text }))
      : [],
    tools: [],
    variables: {},
  }
}

async function runAssembly(agent, assembly) {
  return await agent.ctx.waterfall(
    agent.ctx,
    'system-prompt/assemble',
    assembly,
    {},
    () => Promise.resolve(assembly),
  )
}

test('prompt runtime registers exactly five fixed empty placeholders and one expander behavior', async () => {
  const agent = fakeAgent()
  await agent.ctx.plugin(FakeSystemPrompt)
  const systemPrompt = agent.ctx.get('systemPrompt')
  const dispose = installAgentPromptRuntime(agent, TARGETS, () => ({}))

  assert.equal(systemPrompt.sections.length, 4)
  assert.equal(systemPrompt.contexts.length, 1)
  assert.deepEqual(
    systemPrompt.sections.map(item => item.name).sort(),
    Object.values(PROMPT_RUNTIME_SLOT_NAMES)
      .filter(name => name !== PROMPT_RUNTIME_SLOT_NAMES['runtime-context'])
      .sort(),
  )
  assert.equal(systemPrompt.sections.every(item => item.text === ''), true)
  assert.equal(systemPrompt.contexts[0].text, '')

  await dispose()
  assert.equal(systemPrompt.sections.length, 0)
  assert.equal(systemPrompt.contexts.length, 0)
})

test('prompt runtime expands bindings independently at placeholder positions', async () => {
  const agent = fakeAgent()
  await agent.ctx.plugin(FakeSystemPrompt)
  const systemPrompt = agent.ctx.get('systemPrompt')
  const dispose = installAgentPromptRuntime(agent, TARGETS, () => ({
    plan: {
      bindings: [],
      eligible: [
        {
          state: 'eligible',
          bindingId: 'a',
          resourceId: 'one',
          placement: 'after-persona',
          order: 0,
          content: 'first {{',
          resourceRevision: 1,
        },
        {
          state: 'eligible',
          bindingId: 'b',
          resourceId: 'two',
          placement: 'after-persona',
          order: 1,
          content: 'second }}',
          resourceRevision: 1,
        },
        {
          state: 'eligible',
          bindingId: 'ctx',
          resourceId: 'ctx',
          placement: 'runtime-context',
          order: 0,
          content: 'dynamic',
          resourceRevision: 1,
        },
      ],
    },
  }))

  const assembly = assemblyFor(systemPrompt)
  await runAssembly(agent, assembly)

  const names = assembly.sections.map(item => item.name)
  const first = names.indexOf(promptBindingContributionName('a'))
  const second = names.indexOf(promptBindingContributionName('b'))
  assert.ok(first >= 0)
  assert.equal(second, first + 1)
  assert.equal(assembly.sections[first].text, 'first {{')
  assert.equal(assembly.sections[second].text, 'second }}')
  assert.equal(assembly.contexts[0].name, promptBindingContributionName('ctx'))
  assert.equal(assembly.contexts[0].text, 'dynamic')

  await dispose()
})

test('native runtime-context suppression prevents the resolver from seeing that placement', async () => {
  const agent = fakeAgent()
  await agent.ctx.plugin(FakeSystemPrompt)
  const systemPrompt = agent.ctx.get('systemPrompt')
  let visible
  const dispose = installAgentPromptRuntime(agent, TARGETS, placements => {
    visible = [...placements]
    return {}
  })

  const assembly = assemblyFor(systemPrompt, { includeContext: false })
  await runAssembly(agent, assembly)

  assert.equal(visible.includes('runtime-context'), false)
  await dispose()
})

test('binding contribution names safely encode lone UTF-16 surrogates and stay stable', () => {
  const id = 'x\ud800y'
  const first = promptBindingContributionName(id)
  const second = promptBindingContributionName(id)

  assert.equal(first, second)
  assert.match(first, /^dsh-context-manager:binding:[0-9a-f]+$/)
  assert.equal(first.includes(id), false)
})
