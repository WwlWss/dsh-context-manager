import assert from 'node:assert/strict'

import { Context, Service } from '@deepseek-ai/cordis'
import LlmRuntime, {
  LlmAdapter,
  createUserMessage,
} from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'

import {
  ContextManagerPromptRuntime,
} from '../lib/index.js'

const generation = process.env.DSH_M4C2_E2E_GENERATION
if (generation !== 'legacy' && generation !== 'current') {
  throw new Error('DSH_M4C2_E2E_GENERATION must be legacy or current')
}

const runtimeState = {
  defaultProfileId: 'alpha',
  presetId: 'preset-a',
  profiles: {
    alpha: {
      name: 'Alpha',
      basePreset: 'preset-a',
      skills: {},
      prompts: {
        first: {
          resourceId: 'first',
          enabled: true,
          placement: 'after-persona',
          order: 10,
        },
        second: {
          resourceId: 'second',
          enabled: true,
          placement: 'after-persona',
          order: 20,
        },
      },
    },
    beta: {
      name: 'Beta',
      basePreset: 'preset-a',
      skills: {},
      prompts: {
        beta: {
          resourceId: 'beta',
          enabled: true,
          placement: 'after-persona',
          order: 0,
        },
      },
    },
  },
  resources: new Map([
    ['first', { name: 'First', content: 'CM_FIRST', revision: 1 }],
    ['second', { name: 'Second', content: 'CM_SECOND', revision: 1 }],
    ['beta', { name: 'Beta', content: 'CM_BETA', revision: 1 }],
    ['runtime', { name: 'Runtime', content: 'CM_RUNTIME', revision: 1 }],
  ]),
}

function managerSnapshot() {
  const configured = runtimeState.defaultProfileId
  const profile = runtimeState.profiles[configured]
  return {
    schemaVersion: 1,
    schemaCompatible: true,
    configuredDefaultProfileId: configured,
    usableDefaultProfileId: profile === undefined ? undefined : configured,
    profiles: profile === undefined ? {} : { [configured]: structuredClone(profile) },
    diagnostics: profile === undefined
      ? [{
          code: 'missing-default-profile',
          profileId: configured,
          message: 'missing',
        }]
      : [],
    persistence: {
      available: true,
      registered: true,
      writable: true,
      revision: 1,
    },
  }
}

class FakeManager extends Service {
  constructor(ctx) {
    super(ctx, 'dshContextManager')
  }
  snapshot() {
    return managerSnapshot()
  }
}

class FakePresetIdentity extends Service {
  constructor(ctx) {
    super(ctx, 'dshContextSessionPresetIdentity')
  }
  snapshot(sessionId) {
    return {
      status: 'known',
      sessionId,
      presetId: runtimeState.presetId,
    }
  }
}

class FakePromptLibrary extends Service {
  constructor(ctx) {
    super(ctx, 'dshContextPromptLibrary')
  }
  get(id) {
    const resource = runtimeState.resources.get(id)
    if (resource === undefined) {
      const error = new Error(`missing resource ${id}`)
      error.name = 'ContextManagerError'
      error.code = 'prompt-resource-not-found'
      throw error
    }
    return {
      id,
      resource: structuredClone(resource),
    }
  }
}

function response(text = 'ok') {
  return [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text },
    { type: 'block-end', index: 0, block: { type: 'text', text } },
    { type: 'usage', usage: { inputTokens: 1, outputTokens: 1 } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
}

class RecordingAdapter extends LlmAdapter {
  requests = []

  resolveModel(provider, model) {
    return Promise.resolve({ provider, id: model, name: model })
  }

  async * stream(options) {
    this.requests.push(options)
    for (const chunk of response()) yield chunk
  }
}

function requestText(request) {
  return JSON.stringify({
    system: request?.system,
    messages: request?.messages ?? [],
  })
}

function latestRuntimeContextText(request) {
  const messages = request?.messages ?? []
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.role !== 'user') continue
    const text = (message.content ?? [])
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('')
    if (text.includes('Current runtime context')) return text
  }
  return undefined
}

function waitForIdle(ctx, agent) {
  return new Promise(resolve => {
    const dispose = ctx.on('agent/status', ({ agent: subject, status }) => {
      if (subject !== agent || status !== 'idle') return
      dispose()
      resolve()
    })
  })
}

async function turn(ctx, agent, label) {
  const idle = waitForIdle(ctx, agent)
  agent.followup(createUserMessage({
    content: [{ type: 'text', text: label }],
    source: { kind: 'user' },
  }))
  await idle
}

async function waitForRuntime(runtime, agentId) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const inspected = await runtime.inspect(agentId)
    if (inspected.status !== 'runtime-unavailable') return inspected
    await Promise.resolve()
  }
  throw new Error('Context Manager runtime did not attach')
}

const ctx = new Context()
const adapter = new RecordingAdapter()

try {
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SessionStore)
  if (generation === 'current') {
    const { default: SessionProjectionRegistry } = await import('@deepseek-ai/dsh-session-projection')
    await ctx.plugin(SessionProjectionRegistry)
  }
  await ctx.plugin(
    SystemPrompt,
    generation === 'legacy'
      ? { persona: 'NATIVE_PERSONA' }
      : { personaPrefix: 'NATIVE_PERSONA' },
  )
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(AgentLoop, { agents: [] })
  ctx.llm.registerAdapter(['mock'], adapter)

  await ctx.plugin(FakeManager)
  await ctx.plugin(FakePresetIdentity)
  await ctx.plugin(FakePromptLibrary)
  let runtimeFiber = ctx.plugin(ContextManagerPromptRuntime)
  await runtimeFiber

  const agent = await ctx.agentLoop.create(SessionId('m4c2-e2e'), {
    provider: 'mock',
    model: 'mock',
  })

  let inspection = await waitForRuntime(ctx.dshContextPromptRuntime, agent.id)
  assert.equal(inspection.status, 'resolved')
  assert.equal(inspection.profile.status, 'active')

  await turn(ctx, agent, 'turn-1')
  let text = requestText(adapter.requests.at(-1))
  assert.ok(text.includes('CM_FIRST'))
  assert.ok(text.includes('CM_SECOND'))
  assert.ok(text.indexOf('CM_FIRST') < text.indexOf('CM_SECOND'))

  runtimeState.resources.set('first', {
    name: 'First',
    content: 'CM_FIRST_EDITED',
    revision: 2,
  })
  await turn(ctx, agent, 'turn-2-resource-edit')
  text = requestText(adapter.requests.at(-1))
  assert.ok(text.includes('CM_FIRST_EDITED'))

  runtimeState.profiles.alpha.prompts.first.order = 30
  runtimeState.profiles.alpha.prompts.second.order = 5
  await turn(ctx, agent, 'turn-3-reorder')
  text = requestText(adapter.requests.at(-1))
  assert.ok(text.indexOf('CM_SECOND') < text.indexOf('CM_FIRST_EDITED'))

  runtimeState.presetId = 'preset-b'
  await turn(ctx, agent, 'turn-4-mismatch')
  text = requestText(adapter.requests.at(-1))
  assert.equal(text.includes('CM_FIRST_EDITED'), false)
  assert.equal(text.includes('CM_SECOND'), false)

  inspection = await ctx.dshContextPromptRuntime.inspect(agent.id)
  assert.equal(inspection.status, 'resolved')
  assert.equal(inspection.profile.status, 'base-preset-mismatch')

  runtimeState.presetId = 'preset-a'
  await turn(ctx, agent, 'turn-5-match-again')
  text = requestText(adapter.requests.at(-1))
  assert.ok(text.includes('CM_FIRST_EDITED'))

  runtimeState.profiles.alpha.prompts.first.enabled = false
  await turn(ctx, agent, 'turn-6-disable')
  text = requestText(adapter.requests.at(-1))
  assert.equal(text.includes('CM_FIRST_EDITED'), false)
  assert.ok(text.includes('CM_SECOND'))

  runtimeState.defaultProfileId = 'beta'
  await turn(ctx, agent, 'turn-7-default-change')
  text = requestText(adapter.requests.at(-1))
  assert.ok(text.includes('CM_BETA'))
  assert.equal(text.includes('CM_SECOND'), false)

  runtimeState.defaultProfileId = 'alpha'
  runtimeState.profiles.alpha.prompts.runtime = {
    resourceId: 'runtime',
    enabled: true,
    placement: 'runtime-context',
    order: 0,
  }
  await turn(ctx, agent, 'turn-8-runtime-context')
  text = requestText(adapter.requests.at(-1))
  assert.ok(text.includes('CM_RUNTIME'))
  assert.ok(text.includes('Current runtime context'))

  const suppress = agent.ctx.systemPrompt.suppressRuntimeContext()
  await turn(ctx, agent, 'turn-9-runtime-suppressed')
  text = requestText(adapter.requests.at(-1))
  const clearedRuntime = latestRuntimeContextText(adapter.requests.at(-1))
  assert.ok(clearedRuntime?.includes('Current runtime context: none'))
  assert.equal(clearedRuntime?.includes('CM_RUNTIME'), false)

  inspection = await ctx.dshContextPromptRuntime.inspect(agent.id)
  assert.equal(inspection.status, 'resolved')
  const runtimeBinding = inspection.bindings.find(item => item.bindingId === 'runtime')
  assert.equal(runtimeBinding?.state, 'native-suppressed')
  suppress()

  const completeDispose = agent.ctx.systemPrompt.section({
    name: 'test:complete',
    order: 0,
    text: 'NATIVE_COMPLETE',
    complete: true,
  })
  await turn(ctx, agent, 'turn-10-complete')
  text = requestText(adapter.requests.at(-1))
  assert.ok(text.includes('NATIVE_COMPLETE'))
  assert.equal(text.includes('CM_SECOND'), false)

  inspection = await ctx.dshContextPromptRuntime.inspect(agent.id)
  assert.equal(inspection.status, 'resolved')
  const systemBinding = inspection.bindings.find(item => item.bindingId === 'second')
  assert.equal(systemBinding?.state, 'eligible')
  assert.equal(systemBinding?.nativeState, 'suppressed')
  completeDispose()

  await runtimeFiber.dispose()
  await turn(ctx, agent, 'turn-11-unloaded')
  text = requestText(adapter.requests.at(-1))
  assert.equal(text.includes('CM_SECOND'), false)
  assert.equal(text.includes('CM_RUNTIME'), false)

  runtimeFiber = ctx.plugin(ContextManagerPromptRuntime)
  await runtimeFiber
  await waitForRuntime(ctx.dshContextPromptRuntime, agent.id)
  await turn(ctx, agent, 'turn-12-reloaded')
  text = requestText(adapter.requests.at(-1))
  assert.ok(text.includes('CM_SECOND'))
  assert.ok(text.includes('CM_RUNTIME'))

  await runtimeFiber.dispose()
} finally {
  await ctx.fiber.dispose()
}
