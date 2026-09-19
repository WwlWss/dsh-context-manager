import assert from 'node:assert/strict'

import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'

import {
  observeNativePromptPlacementCompatibility,
} from '../src/adapters/prompt-placement.ts'

const generation = process.env.DSH_PROMPT_GENERATION
if (generation !== 'legacy' && generation !== 'named') {
  throw new Error('DSH_PROMPT_GENERATION must be legacy or named')
}

const ctx = new Context()

try {
  await ctx.plugin(SystemPrompt, {})
  const compatibility = observeNativePromptPlacementCompatibility(ctx)
  assert.equal(compatibility.status, 'available')

  const targets = compatibility.targets
  assert.equal(targets['before-persona'].channel, 'section')
  assert.equal(targets['after-persona'].channel, 'section')
  assert.equal(targets['before-tool-guidance'].channel, 'section')
  assert.equal(targets['after-tool-guidance'].channel, 'section')
  assert.equal(targets['runtime-context'].channel, 'runtime-context')

  let firstToolOrder
  let toolTailOrder
  let nativeContextTail

  if (generation === 'legacy') {
    assert.deepEqual(targets, {
      'before-persona': { channel: 'section', order: -0.5 },
      'after-persona': { channel: 'section', order: 0.5 },
      'before-tool-guidance': { channel: 'section', order: 99.5 },
      'after-tool-guidance': { channel: 'section', order: 199.5 },
      'runtime-context': { channel: 'runtime-context', order: 0.530 },
    })
    firstToolOrder = 100
    toolTailOrder = 199
    nativeContextTail = 120
  } else {
    const systemPrompt = ctx.systemPrompt
    firstToolOrder = systemPrompt.getSectionOrder('TOOL_BASH')
    toolTailOrder = systemPrompt.getSectionOrder('TOOLS_SDK')
    nativeContextTail = systemPrompt.getContextOrder('SUBAGENT_DELEGATION')

    assert.equal(targets['before-persona'].order, -0.5)
    assert.equal(targets['after-persona'].order, 0.5)
    assert.equal(targets['before-tool-guidance'].order, firstToolOrder - 0.5)
    assert.equal(targets['after-tool-guidance'].order, toolTailOrder - 0.5)
    assert.equal(targets['runtime-context'].order, nativeContextTail + 0.5)
  }

  ctx.systemPrompt.section({
    name: 'm4c1:before-persona',
    order: targets['before-persona'].order,
    text: 'before persona',
  })
  ctx.systemPrompt.section({
    name: 'm4c1:persona-boundary',
    order: 0,
    text: 'persona boundary',
  })
  ctx.systemPrompt.section({
    name: 'm4c1:after-persona',
    order: targets['after-persona'].order,
    text: 'after persona',
  })
  ctx.systemPrompt.section({
    name: 'm4c1:before-tool',
    order: targets['before-tool-guidance'].order,
    text: 'before tool',
  })
  ctx.systemPrompt.section({
    name: 'm4c1:first-tool',
    order: firstToolOrder,
    text: 'first tool',
  })

  if (generation === 'legacy') {
    ctx.systemPrompt.section({
      name: 'm4c1:last-legacy-tool',
      order: toolTailOrder,
      text: 'last legacy tool',
    })
    ctx.systemPrompt.section({
      name: 'm4c1:after-tool',
      order: targets['after-tool-guidance'].order,
      text: 'after tool',
    })
  } else {
    ctx.systemPrompt.section({
      name: 'm4c1:after-tool',
      order: targets['after-tool-guidance'].order,
      text: 'after tool',
    })
    ctx.systemPrompt.section({
      name: 'm4c1:generated-protocol',
      order: toolTailOrder,
      text: 'generated protocol',
    })
  }

  const assembly = await ctx.systemPrompt.assemble()
  const names = assembly.sections.map(section => section.name)
  const indexOf = name => {
    const index = names.indexOf(name)
    assert.notEqual(index, -1, `missing section ${name}`)
    return index
  }

  assert.ok(indexOf('m4c1:before-persona') < indexOf('m4c1:persona-boundary'))
  assert.ok(indexOf('m4c1:persona-boundary') < indexOf('m4c1:after-persona'))
  assert.ok(indexOf('m4c1:before-tool') < indexOf('m4c1:first-tool'))

  if (generation === 'legacy') {
    assert.ok(indexOf('m4c1:last-legacy-tool') < indexOf('m4c1:after-tool'))
  } else {
    assert.ok(indexOf('m4c1:first-tool') < indexOf('m4c1:after-tool'))
    assert.ok(indexOf('m4c1:after-tool') < indexOf('m4c1:generated-protocol'))
  }

  ctx.systemPrompt.context({
    name: 'm4c1:native-context-tail',
    order: nativeContextTail,
    text: 'native tail',
  })
  ctx.systemPrompt.context({
    name: 'm4c1:runtime-context',
    order: targets['runtime-context'].order,
    text: 'context manager',
  })

  const contextAssembly = await ctx.systemPrompt.assemble()
  const contextNames = contextAssembly.contexts.map(context => context.name)
  assert.ok(
    contextNames.indexOf('m4c1:native-context-tail')
      < contextNames.indexOf('m4c1:runtime-context'),
  )

  const suppress = ctx.systemPrompt.suppressRuntimeContext()
  try {
    assert.deepEqual((await ctx.systemPrompt.assemble()).contexts, [])
  } finally {
    suppress()
  }

  ctx.systemPrompt.section({
    name: 'm4c1:complete',
    order: 0,
    text: 'complete',
    complete: true,
  })
  const completeAssembly = await ctx.systemPrompt.assemble()
  assert.deepEqual(
    completeAssembly.sections.map(section => section.name),
    ['m4c1:complete'],
  )
} finally {
  await ctx.fiber.dispose()
}
