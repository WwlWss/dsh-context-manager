import assert from 'node:assert/strict'
import { test } from 'node:test'

import { Context, Service } from '@deepseek-ai/cordis'

import {
  inspectAgentPromptRuntime,
  installAgentPromptRuntime,
  promptBindingContributionName,
} from '../src/adapters/prompt-runtime.ts'

class NativeSystemPromptFixture extends Service {
  constructor(ctx, { suppressContext = false, complete = false } = {}) {
    super(ctx, 'systemPrompt')
    this.sectionRows = []
    this.contextRows = []
    this.suppressContext = suppressContext
    this.complete = complete
  }

  section(row) {
    this.sectionRows.push(row)
    return () => {
      const index = this.sectionRows.indexOf(row)
      if (index >= 0) this.sectionRows.splice(index, 1)
    }
  }

  context(row) {
    this.contextRows.push(row)
    return () => {
      const index = this.contextRows.indexOf(row)
      if (index >= 0) this.contextRows.splice(index, 1)
    }
  }

  async assemble(context = {}) {
    const assembly = {
      sections: this.sectionRows
        .slice()
        .sort((a, b) => a.order - b.order)
        .map(({ name, text }) => ({ name, text })),
      contexts: this.suppressContext
        ? []
        : this.contextRows
          .slice()
          .sort((a, b) => a.order - b.order)
          .map(({ name, text }) => ({ name, text })),
      variables: {},
      tools: [],
    }
    const transformed = await this.ctx.waterfall(
      this,
      'system-prompt/assemble',
      assembly,
      context,
      () => Promise.resolve(assembly),
    )
    if (!this.complete) return transformed
    return { ...transformed, sections: [{ name: 'native:complete', text: 'complete' }] }
  }
}

function eligible(bindingId, placement, content) {
  return {
    state: 'eligible',
    bindingId,
    resourceId: bindingId,
    placement,
    order: 0,
    content,
    resourceRevision: 1,
  }
}

test('fresh inspection captures the exact resolution used by native assembly', async () => {
  const ctx = new Context()
  await ctx.plugin(NativeSystemPromptFixture)
  const agent = { id: 'a', ctx }
  const profile = {
    status: 'active',
    profileId: 'p',
    profile: { name: 'P', basePreset: 'preset', skills: {}, prompts: {} },
    presetId: 'preset',
  }
  const binding = eligible('x', 'after-persona', 'hello')
  const resolution = { profile, plan: { bindings: [binding], eligible: [binding] } }

  const dispose = installAgentPromptRuntime(agent, () => resolution)
  const inspected = await inspectAgentPromptRuntime(agent)

  assert.equal(inspected.resolution, resolution)
  assert.ok(inspected.visiblePlacements.includes('after-persona'))
  assert.equal(
    inspected.assembly.sections.find(item => item.name === promptBindingContributionName('x')).text,
    'hello',
  )
  dispose()
})

test('fresh inspection observes native complete and runtime-context suppression after CM expansion', async () => {
  const ctx = new Context()
  await ctx.plugin(NativeSystemPromptFixture, { suppressContext: true, complete: true })
  const agent = { id: 'a', ctx }
  const profile = {
    status: 'active',
    profileId: 'p',
    profile: { name: 'P', basePreset: 'preset', skills: {}, prompts: {} },
    presetId: 'preset',
  }
  let seenVisible
  const section = eligible('system', 'after-persona', 'system')
  const context = eligible('context', 'runtime-context', 'context')

  const dispose = installAgentPromptRuntime(agent, visible => {
    seenVisible = visible
    const eligibleRows = visible.has('runtime-context') ? [section, context] : [section]
    return {
      profile,
      plan: { bindings: eligibleRows, eligible: eligibleRows },
    }
  })
  const inspected = await inspectAgentPromptRuntime(agent)

  assert.equal(seenVisible.has('runtime-context'), false)
  assert.deepEqual(
    inspected.assembly.sections.map(item => item.name),
    ['native:complete'],
  )
  assert.deepEqual(inspected.assembly.contexts, [])
  dispose()
})
