import assert from 'node:assert/strict'
import { test } from 'node:test'

import { ContextManagerError } from '../lib/index.js'
import { resolvePromptPlan } from '../src/runtime/prompt-plan.ts'

function profile(prompts) {
  return {
    name: 'Runtime',
    basePreset: 'preset',
    skills: {},
    prompts,
  }
}

function resource(content, revision = 1) {
  return { id: 'unused', resource: { name: 'Prompt', content, revision } }
}

test('prompt plan sorts by order then locale-independent binding id', () => {
  const reads = []
  const resources = {
    get(id) {
      reads.push(id)
      return { id, resource: { name: id, content: id, revision: 1 } }
    },
  }
  const plan = resolvePromptPlan(profile({
    z: { resourceId: 'z', enabled: true, placement: 'after-persona', order: -1 },
    b: { resourceId: 'b', enabled: true, placement: 'after-persona', order: 0 },
    A: { resourceId: 'A', enabled: true, placement: 'after-persona', order: 0 },
    a: { resourceId: 'a', enabled: true, placement: 'after-persona', order: 0 },
  }), new Set(['after-persona']), resources)

  assert.deepEqual(plan.eligible.map(item => item.bindingId), ['z', 'A', 'a', 'b'])
  assert.deepEqual(reads, ['z', 'A', 'a', 'b'])
})

test('disabled and native-suppressed placements avoid resource reads', () => {
  let reads = 0
  const resources = { get() { reads += 1; return resource('unused') } }
  const plan = resolvePromptPlan(profile({
    disabled: { resourceId: 'd', enabled: false, placement: 'after-persona', order: 0 },
    suppressed: { resourceId: 's', enabled: true, placement: 'runtime-context', order: 1 },
  }), new Set(['after-persona']), resources)

  assert.equal(reads, 0)
  assert.deepEqual(plan.bindings.map(item => item.state), ['disabled'])
})

test('duplicate resource references are read once per resolution and remain separate bindings', () => {
  let reads = 0
  const resources = {
    get(id) {
      reads += 1
      return { id, resource: { name: 'Shared', content: 'shared', revision: 7 } }
    },
  }
  const plan = resolvePromptPlan(profile({
    one: { resourceId: 'shared', enabled: true, placement: 'after-persona', order: 0 },
    two: { resourceId: 'shared', enabled: true, placement: 'after-persona', order: 1 },
  }), new Set(['after-persona']), resources)

  assert.equal(reads, 1)
  assert.equal(plan.eligible.length, 2)
  assert.deepEqual(plan.eligible.map(item => item.bindingId), ['one', 'two'])
})

test('missing invalid and empty resources are isolated while whitespace is preserved', () => {
  const resources = {
    get(id) {
      if (id === 'missing') {
        throw new ContextManagerError('prompt-resource-not-found', 'missing')
      }
      if (id === 'invalid') {
        throw new ContextManagerError('invalid-prompt-resource', 'invalid')
      }
      if (id === 'empty') {
        return { id, resource: { name: id, content: '', revision: 1 } }
      }
      return { id, resource: { name: id, content: '   ', revision: 2 } }
    },
  }

  const plan = resolvePromptPlan(profile({
    missing: { resourceId: 'missing', enabled: true, placement: 'after-persona', order: 0 },
    invalid: { resourceId: 'invalid', enabled: true, placement: 'after-persona', order: 1 },
    empty: { resourceId: 'empty', enabled: true, placement: 'after-persona', order: 2 },
    spaces: { resourceId: 'spaces', enabled: true, placement: 'after-persona', order: 3 },
  }), new Set(['after-persona']), resources)

  assert.deepEqual(plan.bindings.map(item => item.state), [
    'missing-resource',
    'invalid-resource',
    'empty-content',
    'eligible',
  ])
  assert.equal(plan.eligible[0].content, '   ')
})

test('unexpected Prompt Library failures propagate instead of degrading to empty content', () => {
  assert.throws(
    () => resolvePromptPlan(profile({
      p: { resourceId: 'p', enabled: true, placement: 'after-persona', order: 0 },
    }), new Set(['after-persona']), {
      get() {
        throw new ContextManagerError('prompt-library-not-ready', 'storage unavailable')
      },
    }),
    error => error instanceof ContextManagerError && error.code === 'prompt-library-not-ready',
  )
})

test('prompt plan has no cross-resolution resource cache', () => {
  let content = 'one'
  let reads = 0
  const resources = {
    get(id) {
      reads += 1
      return { id, resource: { name: id, content, revision: reads } }
    },
  }
  const input = profile({
    p: { resourceId: 'p', enabled: true, placement: 'after-persona', order: 0 },
  })

  assert.equal(resolvePromptPlan(input, new Set(['after-persona']), resources).eligible[0].content, 'one')
  content = 'two'
  assert.equal(resolvePromptPlan(input, new Set(['after-persona']), resources).eligible[0].content, 'two')
  assert.equal(reads, 2)
})
