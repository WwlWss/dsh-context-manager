import assert from 'node:assert/strict'

import { Context } from '@deepseek-ai/cordis'
import SystemPrompt, { renderPrompt } from '@deepseek-ai/dsh-system-prompt'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import { bindScopeParent, createScope } from '@deepseek-ai/dsh-scope'

import {
  installAgentPinnedSkillRuntime,
  PINNED_SKILL_BUNDLE_VARIABLE,
  PINNED_SKILL_SLOT_NAME,
  PINNED_SKILL_SLOT_TEXT,
} from '../src/adapters/pinned-skill-runtime.ts'
import {
  observeNativePromptPlacementCompatibility,
} from '../src/adapters/prompt-placement.ts'

const generation = process.env.DSH_M5C_GENERATION
if (generation !== 'legacy' && generation !== 'named') {
  throw new Error('DSH_M5C_GENERATION must be legacy or named')
}

const ctx = new Context()

try {
  await ctx.plugin(
    SystemPrompt,
    generation === 'legacy'
      ? { persona: 'Native persona' }
      : { personaPrefix: 'Native persona' },
  )
  await ctx.plugin(SkillRegistry)

  const presetKey = {}
  const preset = createScope(ctx, presetKey)
  const stopNative = preset.ctx.skills.registerProvider(() => ({
    name: 'native-provider',
    async list() {
      return [{
        name: 'target',
        description: 'target description',
        invocation: {
          modelInvocable: true,
          userInvocable: true,
        },
        source: 'custom',
        provider: 'native-provider',
        resourceBase: {
          kind: 'opaque',
          description: 'M5C resource {{literal_resource}}',
        },
        rank: 0,
        locator: 'target',
      }]
    },
    async get(candidate) {
      return {
        name: candidate.name,
        description: candidate.description,
        invocation: candidate.invocation,
        source: candidate.source,
        provider: candidate.provider,
        resourceBase: candidate.resourceBase,
        content: 'M5C literal {{unknown_variable}} and {{not valid}}',
      }
    },
  }))

  const agentKey = {
    id: 'm5c-five-gen',
    session: {
      header: {
        cwd: '/workspace/m5c',
      },
    },
  }
  const binding = bindScopeParent(agentKey, presetKey)
  const agentScope = createScope(ctx, agentKey)
  const agent = {
    ...agentKey,
    ctx: agentScope.ctx,
  }

  // scopeParentOf() keys by object identity, so bind the actual Agent object as
  // well; the small fixture keeps the parent explicit rather than relying on
  // AgentLoop construction.
  binding.dispose?.()
  const agentBinding = bindScopeParent(agent, presetKey)

  const placement = observeNativePromptPlacementCompatibility(agent.ctx)
  assert.equal(placement.status, 'available')

  const dispose = installAgentPinnedSkillRuntime(
    ctx,
    agent,
    placement.targets,
    () => ({
      status: 'active',
      profileId: 'profile',
      presetId: 'preset-a',
      profile: {
        name: 'Profile',
        basePreset: 'preset-a',
        prompts: {},
        skills: {
          target: { mode: 'pinned' },
        },
      },
    }),
  )

  const assembled = await ctx.systemPrompt.assemble({
    scope: agent,
    agent,
  })

  const pinnedIndex = assembled.sections.findIndex(section => section.name === PINNED_SKILL_SLOT_NAME)
  assert.notEqual(pinnedIndex, -1)
  assert.equal(assembled.sections[pinnedIndex].text, PINNED_SKILL_SLOT_TEXT)

  const bundle = assembled.variables[PINNED_SKILL_BUNDLE_VARIABLE]
  assert.equal(typeof bundle, 'string')
  assert.ok(bundle.includes('M5C literal {{unknown_variable}} and {{not valid}}'))
  assert.ok(bundle.includes('M5C resource {{literal_resource}}'))

  // This is the compatibility invariant that matters on 0.1.1-0.1.5:
  // substituted variable values are not scanned a second time.
  const rendered = renderPrompt(assembled)
  assert.ok(rendered.includes('M5C literal {{unknown_variable}} and {{not valid}}'))
  assert.ok(rendered.includes('M5C resource {{literal_resource}}'))

  const afterOrder = placement.targets['after-tool-guidance'].order
  if (generation === 'legacy') {
    assert.equal(afterOrder, 199.5)
  } else {
    assert.equal(afterOrder, ctx.systemPrompt.getSectionOrder('TOOLS_SDK') - 0.5)
  }

  dispose()
  const cleaned = await ctx.systemPrompt.assemble({
    scope: agent,
    agent,
  })
  assert.equal(
    cleaned.sections.some(section => section.name === PINNED_SKILL_SLOT_NAME),
    false,
  )
  assert.equal(
    Object.hasOwn(cleaned.variables, PINNED_SKILL_BUNDLE_VARIABLE),
    false,
  )

  agentBinding.dispose?.()
  stopNative()
  await agentScope.dispose()
  await preset.dispose()
} finally {
  await ctx.fiber.dispose()
}
