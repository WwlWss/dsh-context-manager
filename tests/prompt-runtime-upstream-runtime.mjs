import assert from 'node:assert/strict'

import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import { createScope } from '@deepseek-ai/dsh-scope'

import {
  installAgentPromptRuntime,
  promptBindingContributionName,
} from '../src/adapters/prompt-runtime.ts'
import {
  observeNativePromptPlacementCompatibility,
} from '../src/adapters/prompt-placement.ts'

const generation = process.env.DSH_M4C2_GENERATION
if (generation !== 'legacy' && generation !== 'named') {
  throw new Error('DSH_M4C2_GENERATION must be legacy or named')
}

const ctx = new Context()

try {
  await ctx.plugin(
    SystemPrompt,
    generation === 'legacy'
      ? { persona: 'Native persona' }
      : { personaPrefix: 'Native persona' },
  )

  const scopeKey = {}
  const scope = createScope(ctx, scopeKey)
  const agent = { id: 'm4c2-smoke', ctx: scope.ctx }
  const systemBinding = Object.freeze({
    state: 'eligible',
    bindingId: 'system',
    resourceId: 'system-resource',
    placement: 'after-persona',
    order: 0,
    content: 'CM system smoke',
    resourceRevision: 1,
  })
  const contextBinding = Object.freeze({
    state: 'eligible',
    bindingId: 'context',
    resourceId: 'context-resource',
    placement: 'runtime-context',
    order: 0,
    content: 'CM context smoke',
    resourceRevision: 1,
  })

  const placement = observeNativePromptPlacementCompatibility(scope.ctx)
  assert.equal(placement.status, 'available')

  let visible
  const dispose = installAgentPromptRuntime(agent, placement.targets, placements => {
    visible = placements
    const eligible = placements.has('runtime-context')
      ? [systemBinding, contextBinding]
      : [systemBinding]
    return {
      profile: {
        status: 'active',
        profileId: 'profile',
        profile: {
          name: 'Profile',
          basePreset: 'preset',
          skills: {},
          prompts: {},
        },
        presetId: 'preset',
      },
      plan: {
        bindings: eligible,
        eligible,
      },
    }
  })

  const rootPrompt = ctx.get('systemPrompt')
  const scopedPrompt = scope.ctx.get('systemPrompt')

  const assembled = await rootPrompt.assemble({ scope: scopeKey })
  assert.ok(visible.has('after-persona'))
  assert.ok(visible.has('runtime-context'))
  assert.equal(
    assembled.sections.find(item => item.name === promptBindingContributionName('system'))?.text,
    'CM system smoke',
  )
  assert.equal(
    assembled.contexts.find(item => item.name === promptBindingContributionName('context'))?.text,
    'CM context smoke',
  )

  const suppress = scopedPrompt.suppressRuntimeContext()
  try {
    const suppressed = await rootPrompt.assemble({ scope: scopeKey })
    assert.equal(visible.has('runtime-context'), false)
    assert.equal(
      suppressed.contexts.some(item => item.name === promptBindingContributionName('context')),
      false,
    )
  } finally {
    suppress()
  }

  dispose()
  const cleaned = await rootPrompt.assemble({ scope: scopeKey })
  assert.equal(
    cleaned.sections.some(item => item.name.startsWith('dsh-context-manager:')),
    false,
  )
  assert.equal(
    cleaned.contexts.some(item => item.name.startsWith('dsh-context-manager:')),
    false,
  )
} finally {
  await ctx.fiber.dispose()
}
