import assert from 'node:assert/strict'

import { Context, Service } from '@deepseek-ai/cordis'
import LlmRuntime, * as Llm from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import * as ToolSkill from '@deepseek-ai/dsh-tool-skill'

import {
  ContextManagerSkillRuntime,
} from '../lib/index.js'

const generation = process.env.DSH_M5B_E2E_GENERATION
if (generation !== 'legacy' && generation !== 'current') {
  throw new Error('DSH_M5B_E2E_GENERATION must be legacy or current')
}

const state = {
  mode: 'auto',
  presetId: 'preset-a',
}

class FakeManager extends Service {
  constructor(ctx) {
    super(ctx, 'dshContextManager')
  }

  defaultProfileCandidate() {
    return {
      status: 'candidate',
      profileId: 'profile',
      profile: Object.freeze({
        name: 'M5B E2E',
        basePreset: 'preset-a',
        skills: Object.freeze({
          target: Object.freeze({ mode: state.mode }),
        }),
        prompts: Object.freeze({}),
      }),
    }
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
      presetId: state.presetId,
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

const createUserMessage = Llm.createUserMessage
const toolCallId = 'ToolCallId' in Llm ? Llm.ToolCallId : Llm.CallId

class RecordingAdapter extends Llm.LlmAdapter {
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

function waitForIdle(ctx, agent) {
  return new Promise(resolve => {
    const dispose = ctx.on('agent/status', ({ agent: subject, status }) => {
      if (subject !== agent || status !== 'idle') return
      dispose()
      resolve()
    })
  })
}

async function turn(ctx, agent, text) {
  const idle = waitForIdle(ctx, agent)
  agent.followup(createUserMessage({
    content: [{ type: 'text', text }],
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
  throw new Error('Context Manager Skill runtime did not attach')
}

function setMode(ctx, mode) {
  state.mode = mode
  ctx.emit('dsh-context-manager/change')
}

async function executeSkill(ctx, agent, suffix) {
  return await ctx.tools.execute({
    signal: new AbortController().signal,
    callId: toolCallId(`m5b-${suffix}`),
    name: 'skill',
    arguments: { name: 'target' },
    agent,
  })
}

const DESCRIPTION = 'M5B_E2E_TARGET_DESCRIPTION'
const BODY = 'M5B_E2E_TARGET_BODY'

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
      ? { persona: 'M5B_NATIVE_PERSONA' }
      : { personaPrefix: 'M5B_NATIVE_PERSONA' },
  )
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(SkillRegistry)
  await ctx.plugin(ToolSkill)
  await ctx.plugin(AgentLoop, { agents: [] })

  ctx.llm.registerAdapter(['mock'], adapter)

  const stopNative = ctx.skills.registerProvider(() => ({
    name: 'native-provider',
    async list() {
      return [{
        name: 'target',
        description: DESCRIPTION,
        invocation: {
          modelInvocable: true,
          userInvocable: false,
        },
        source: 'custom',
        provider: 'native-provider',
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
        content: BODY,
      }
    },
  }))

  await ctx.plugin(FakeManager)
  await ctx.plugin(FakePresetIdentity)
  let runtimeFiber = ctx.plugin(ContextManagerSkillRuntime)
  await runtimeFiber

  const autoAgent = await ctx.agentLoop.create(SessionId('m5b-e2e-auto'), {
    provider: 'mock',
    model: 'mock',
  })

  let inspection = await waitForRuntime(ctx.dshContextSkillRuntime, autoAgent.id)
  assert.equal(inspection.status, 'resolved')
  assert.equal(inspection.profile.status, 'active')
  assert.equal(inspection.bindings[0]?.state, 'native-pass-through')

  // Auto preserves native true/false exactly: model sees/loads it, user gesture
  // remains disabled.
  await turn(ctx, autoAgent, 'auto catalog')
  let text = requestText(adapter.requests.at(-1))
  assert.ok(text.includes(DESCRIPTION))
  assert.equal(text.includes(BODY), false)

  let toolResult = await executeSkill(ctx, autoAgent, 'auto')
  assert.equal(toolResult.isError, false)
  assert.ok(JSON.stringify(toolResult.content).includes(BODY))

  await turn(ctx, autoAgent, '/target')
  text = requestText(adapter.requests.at(-1))
  assert.equal(text.includes(BODY), false)

  // Each following mode uses a fresh Session so durable catalog history from
  // Auto cannot be mistaken for the current mode's visible catalog.
  setMode(ctx, 'manual')
  const manualAgent = await ctx.agentLoop.create(SessionId('m5b-e2e-manual'), {
    provider: 'mock',
    model: 'mock',
  })
  await waitForRuntime(ctx.dshContextSkillRuntime, manualAgent.id)

  await turn(ctx, manualAgent, 'manual catalog')
  text = requestText(adapter.requests.at(-1))
  assert.equal(text.includes(DESCRIPTION), false)

  toolResult = await executeSkill(ctx, manualAgent, 'manual')
  assert.equal(toolResult.isError, true)

  await turn(ctx, manualAgent, '/target')
  text = requestText(adapter.requests.at(-1))
  assert.ok(text.includes(BODY))

  inspection = await ctx.dshContextSkillRuntime.inspect(manualAgent.id)
  assert.equal(inspection.status, 'resolved')
  assert.equal(inspection.bindings[0]?.state, 'policy-applied')

  setMode(ctx, 'off')
  const offAgent = await ctx.agentLoop.create(SessionId('m5b-e2e-off'), {
    provider: 'mock',
    model: 'mock',
  })
  await waitForRuntime(ctx.dshContextSkillRuntime, offAgent.id)

  await turn(ctx, offAgent, 'off catalog')
  text = requestText(adapter.requests.at(-1))
  assert.equal(text.includes(DESCRIPTION), false)

  toolResult = await executeSkill(ctx, offAgent, 'off')
  assert.equal(toolResult.isError, true)

  await turn(ctx, offAgent, '/target')
  text = requestText(adapter.requests.at(-1))
  assert.equal(text.includes(BODY), false)

  // Pinned is intentionally identical to Off in M5B. M5C will provide the
  // separate durable full-instruction path.
  setMode(ctx, 'pinned')
  const pinnedAgent = await ctx.agentLoop.create(SessionId('m5b-e2e-pinned'), {
    provider: 'mock',
    model: 'mock',
  })
  await waitForRuntime(ctx.dshContextSkillRuntime, pinnedAgent.id)

  await turn(ctx, pinnedAgent, 'pinned catalog')
  text = requestText(adapter.requests.at(-1))
  assert.equal(text.includes(DESCRIPTION), false)

  toolResult = await executeSkill(ctx, pinnedAgent, 'pinned')
  assert.equal(toolResult.isError, true)

  await turn(ctx, pinnedAgent, '/target')
  text = requestText(adapter.requests.at(-1))
  assert.equal(text.includes(BODY), false)

  // Exact base-preset mismatch bypasses the overlay and restores stock native
  // behavior even while the stored binding remains Pinned.
  state.presetId = 'preset-b'
  ctx.emit('dsh-context-manager/change')
  toolResult = await executeSkill(ctx, pinnedAgent, 'preset-mismatch')
  assert.equal(toolResult.isError, false)
  assert.ok(JSON.stringify(toolResult.content).includes(BODY))

  state.presetId = 'preset-a'
  ctx.emit('dsh-context-manager/change')

  // Runtime unload must restore stock Skill behavior and reload must not leave
  // duplicate providers behind.
  await runtimeFiber.dispose()
  toolResult = await executeSkill(ctx, pinnedAgent, 'unloaded')
  assert.equal(toolResult.isError, false)

  runtimeFiber = ctx.plugin(ContextManagerSkillRuntime)
  await runtimeFiber
  await waitForRuntime(ctx.dshContextSkillRuntime, pinnedAgent.id)

  toolResult = await executeSkill(ctx, pinnedAgent, 'reloaded-pinned')
  assert.equal(toolResult.isError, true)

  await runtimeFiber.dispose()
  stopNative()
} finally {
  await ctx.fiber.dispose()
}
