import assert from 'node:assert/strict'
import { test } from 'node:test'

import { Context } from '@deepseek-ai/cordis'
import { SettingsProvider } from '@deepseek-ai/dsh-settings'

import {
  ContextManagerError,
  ContextManagerPromptBindings,
  ContextManagerService,
} from '../lib/index.js'

class MemorySettings extends SettingsProvider {
  constructor(ctx, doc = {}) {
    super(ctx)
    this.doc = structuredClone(doc)
  }
  get writable() { return true }
  async load() { return structuredClone(this.doc) }
  async persist(ns, section) { this.doc[ns] = structuredClone(section) }
}

async function boot() {
  const ctx = new Context()
  await ctx.plugin(MemorySettings)
  await ctx.plugin(ContextManagerService)
  await ctx.plugin(ContextManagerPromptBindings)
  return {
    ctx,
    manager: ctx.get('dshContextManager'),
    bindings: ctx.get('dshContextPromptBindings'),
  }
}

const baseProfile = {
  name: 'Prompt profile',
  basePreset: 'standard',
  skills: {},
}

const binding = {
  enabled: true,
  placement: 'after-persona',
  order: 100,
}

test('legacy profiles without prompts parse as an empty prompt binding map', async () => {
  const { manager } = await boot()
  await manager.createProfile('legacy', baseProfile)
  assert.deepEqual(manager.snapshot().profiles.legacy.prompts, {})
  assert.equal(manager.getStoredProfile('legacy').prompts, undefined)
})

test('structured profile writes accept prompt bindings and expose only understood fields', async () => {
  const { manager } = await boot()
  await manager.createProfile('profile', {
    ...baseProfile,
    prompts: {
      persona: {
        ...binding,
        futureRule: { keep: true },
      },
    },
  })
  assert.deepEqual(manager.snapshot().profiles.profile.prompts.persona, binding)
  assert.deepEqual(manager.getStoredProfile('profile').prompts.persona.futureRule, { keep: true })
})

test('add requires a complete binding, preserves extension fields, and never resolves the resource', async () => {
  const { manager, bindings } = await boot()
  await manager.createProfile('profile', baseProfile)
  const revision = manager.snapshot().persistence.revision
  await bindings.add('profile', 'missing/resource 日本語', {
    ...binding,
    futureRule: { keep: true },
  }, revision)

  assert.deepEqual(manager.getStoredProfile('profile').prompts['missing/resource 日本語'], {
    ...binding,
    futureRule: { keep: true },
  })
  assert.deepEqual(manager.snapshot().profiles.profile.prompts['missing/resource 日本語'], binding)

  await assert.rejects(
    bindings.add('profile', 'incomplete', { enabled: true, placement: 'after-persona' }),
    error => error instanceof ContextManagerError && error.code === 'invalid-prompt-binding',
  )
})

test('narrow edits change one known leaf and preserve all unknown siblings', async () => {
  const { manager, bindings } = await boot()
  await manager.createProfile('profile', {
    ...baseProfile,
    prompts: {
      persona: {
        ...binding,
        futureRule: { keep: true },
      },
    },
  })

  await bindings.setEnabled('profile', 'persona', false, manager.snapshot().persistence.revision)
  await bindings.setPlacement('profile', 'persona', 'before-tool-guidance', manager.snapshot().persistence.revision)
  await bindings.setOrder('profile', 'persona', -12.5, manager.snapshot().persistence.revision)

  assert.deepEqual(manager.getStoredProfile('profile').prompts.persona, {
    enabled: false,
    placement: 'before-tool-guidance',
    order: -12.5,
    futureRule: { keep: true },
  })
})

test('leaf edits are path-local and can repair one malformed binding without touching siblings', async () => {
  const { manager, bindings } = await boot()
  await manager.setRawProfile('repairable', {
    name: 42,
    basePreset: [],
    futureField: { untouched: true },
    prompts: {
      target: {
        enabled: 'broken',
        placement: 'future-anchor',
        order: 'broken',
        future: 'keep',
      },
      sibling: 'legacy malformed binding',
    },
  })

  await bindings.setEnabled('repairable', 'target', true, manager.snapshot().persistence.revision)
  await bindings.setPlacement('repairable', 'target', 'runtime-context', manager.snapshot().persistence.revision)
  await bindings.setOrder('repairable', 'target', 9, manager.snapshot().persistence.revision)

  const stored = manager.getStoredProfile('repairable')
  assert.deepEqual(stored.prompts.target, {
    enabled: true,
    placement: 'runtime-context',
    order: 9,
    future: 'keep',
  })
  assert.equal(stored.prompts.sibling, 'legacy malformed binding')
  assert.deepEqual(stored.futureField, { untouched: true })
})

test('non-object path segments are never silently replaced', async () => {
  const { manager, bindings } = await boot()
  await manager.setRawProfile('bad-prompts', {
    name: 'Bad',
    basePreset: 'standard',
    prompts: 'DO NOT REPLACE',
  })
  await assert.rejects(
    bindings.add('bad-prompts', 'x', binding, manager.snapshot().persistence.revision),
    error => error instanceof ContextManagerError && error.code === 'profile-path-not-editable',
  )
  assert.equal(manager.getStoredProfile('bad-prompts').prompts, 'DO NOT REPLACE')

  await manager.setRawProfile('bad-binding', {
    name: 'Bad binding',
    basePreset: 'standard',
    prompts: { x: 'DO NOT REPLACE' },
  }, manager.snapshot().persistence.revision)
  await assert.rejects(
    bindings.setOrder('bad-binding', 'x', 5, manager.snapshot().persistence.revision),
    error => error instanceof ContextManagerError && error.code === 'profile-path-not-editable',
  )
  assert.equal(manager.getStoredProfile('bad-binding').prompts.x, 'DO NOT REPLACE')
})

test('remove is explicit and leaves the PromptResource lifecycle untouched', async () => {
  const { manager, bindings } = await boot()
  await manager.createProfile('profile', {
    ...baseProfile,
    prompts: { persona: { ...binding, future: true } },
  })
  await bindings.remove('profile', 'persona', manager.snapshot().persistence.revision)
  assert.equal(manager.getStoredProfile('profile').prompts.persona, undefined)
  await assert.rejects(
    bindings.remove('profile', 'persona', manager.snapshot().persistence.revision),
    error => error instanceof ContextManagerError && error.code === 'prompt-binding-not-found',
  )
})

test('invalid placement/order and the current Settings unsafe path key fail explicitly', async () => {
  const { manager, bindings } = await boot()
  await manager.createProfile('profile', { ...baseProfile, prompts: { persona: binding } })

  await assert.rejects(
    bindings.setPlacement('profile', 'persona', 'before-tools', manager.snapshot().persistence.revision),
    error => error instanceof ContextManagerError && error.code === 'invalid-prompt-placement',
  )
  await assert.rejects(
    bindings.setOrder('profile', 'persona', Number.POSITIVE_INFINITY, manager.snapshot().persistence.revision),
    error => error instanceof ContextManagerError && error.code === 'invalid-prompt-order',
  )

  const unsafe = ['__', 'proto', '__'].join('')
  await assert.rejects(
    bindings.add('profile', unsafe, binding, manager.snapshot().persistence.revision),
    error => error instanceof ContextManagerError && error.code === 'unsafe-path-key',
  )
})
