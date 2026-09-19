import assert from 'node:assert/strict'
import { test } from 'node:test'

import { Context, Service } from '@deepseek-ai/cordis'

import {
  ContextManagerPromptPlacementCapability,
} from '../lib/index.js'
import {
  observeNativePromptPlacementCompatibility,
} from '../src/adapters/prompt-placement.ts'

function contextWith(systemPrompt) {
  return {
    get(name) {
      return name === 'systemPrompt' ? systemPrompt : undefined
    },
  }
}

test('prompt placement compatibility reports absent systemPrompt separately', () => {
  assert.deepEqual(
    observeNativePromptPlacementCompatibility(contextWith(undefined)),
    { status: 'unavailable' },
  )
})

test('legacy systemPrompt convention maps semantic anchors without registration side effects', () => {
  let sectionCalls = 0
  let contextCalls = 0
  const compatibility = observeNativePromptPlacementCompatibility(contextWith({
    section() { sectionCalls += 1 },
    context() { contextCalls += 1 },
  }))

  assert.deepEqual(compatibility, {
    status: 'available',
    targets: {
      'before-persona': { channel: 'section', order: -0.5 },
      'after-persona': { channel: 'section', order: 0.5 },
      'before-tool-guidance': { channel: 'section', order: 99.5 },
      'after-tool-guidance': { channel: 'section', order: 199.5 },
      'runtime-context': { channel: 'runtime-context', order: 0.530 },
    },
  })
  assert.equal(sectionCalls, 0)
  assert.equal(contextCalls, 0)
})

test('named sparse systemPrompt mapping derives only common public boundaries', () => {
  const sectionLookups = []
  const contextLookups = []
  const compatibility = observeNativePromptPlacementCompatibility(contextWith({
    section() {},
    context() {},
    getSectionOrder(name) {
      sectionLookups.push(name)
      return {
        TOOL_BASH: 1000,
        TOOLS_SDK: 5000,
      }[name]
    },
    getContextOrder(name) {
      contextLookups.push(name)
      return {
        SUBAGENT_DELEGATION: 120,
      }[name]
    },
  }))

  assert.deepEqual(compatibility, {
    status: 'available',
    targets: {
      'before-persona': { channel: 'section', order: -0.5 },
      'after-persona': { channel: 'section', order: 0.5 },
      'before-tool-guidance': { channel: 'section', order: 99.59 },
      'after-tool-guidance': { channel: 'section', order: 4999.5 },
      'runtime-context': { channel: 'runtime-context', order: 0.530 },
    },
  })
  assert.deepEqual(sectionLookups, ['TOOL_BASH', 'TOOLS_SDK'])
  assert.deepEqual(contextLookups, ['SUBAGENT_DELEGATION'])
})

test('present partial or malformed systemPrompt capabilities fail loud', () => {
  assert.throws(
    () => observeNativePromptPlacementCompatibility(contextWith({ context() {} })),
    /expected section\(\)/,
  )
  assert.throws(
    () => observeNativePromptPlacementCompatibility(contextWith({
      section() {},
      context() {},
      getSectionOrder() { return 1000 },
    })),
    /must either both be present or both be absent/,
  )
  assert.throws(
    () => observeNativePromptPlacementCompatibility(contextWith({
      section() {},
      context() {},
      getSectionOrder() { return Number.NaN },
      getContextOrder() { return 120 },
    })),
    /must return a safe integer/,
  )
  assert.throws(
    () => observeNativePromptPlacementCompatibility(contextWith({
      section() {},
      context() {},
      getSectionOrder(name) {
        return name === 'TOOL_BASH' ? 2 : 3
      },
      getContextOrder() { return 120 },
    })),
    /leaves no extension slot/,
  )
})

test('native placement observations are immutable', () => {
  const compatibility = observeNativePromptPlacementCompatibility(contextWith({
    section() {},
    context() {},
  }))

  assert.equal(compatibility.status, 'available')
  assert.throws(() => {
    compatibility.targets['after-persona'].order = 99
  }, TypeError)
  assert.throws(() => {
    compatibility.targets['after-persona'] = compatibility.targets['before-persona']
  }, TypeError)
})

class NamedSystemPromptFixture extends Service {
  constructor(ctx) {
    super(ctx, 'systemPrompt')
  }

  section() {}
  context() {}

  getSectionOrder(name) {
    return name === 'TOOL_BASH' ? 1000 : 5000
  }

  getContextOrder() {
    return 120
  }
}

test('M4C1 Host service exposes semantic capability without native numeric ranks', async () => {
  const ctx = new Context()
  try {
    await ctx.plugin(NamedSystemPromptFixture)
    await ctx.plugin(ContextManagerPromptPlacementCapability)

    assert.deepEqual(ctx.get('dshContextPromptPlacement').snapshot(), {
      status: 'available',
      placements: {
        'before-persona': 'system-prompt',
        'after-persona': 'system-prompt',
        'before-tool-guidance': 'system-prompt',
        'after-tool-guidance': 'system-prompt',
        'runtime-context': 'runtime-context',
      },
    })
  } finally {
    await ctx.fiber.dispose()
  }
})
