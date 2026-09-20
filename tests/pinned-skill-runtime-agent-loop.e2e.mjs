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
  ContextManagerPinnedSkillRuntime,
  ContextManagerRequestSeries,
  ContextManagerSkillRuntime,
} from '../lib/index.js'

const generation = process.env.DSH_M5C_E2E_GENERATION
if (generation !== 'legacy' && generation !== 'current') {
  throw new Error('DSH_M5C_E2E_GENERATION must be legacy or current')
}

const state = {
  mode: 'pinned',
  presetId: 'preset-a',
  body: 'M5C_E2E_BODY_V1 {{literal_unknown}}',
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
        name: 'M5C E2E',
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
    return Promise.resolve({
      provider,
      id: model,
      name: model,
      ...(generation === 'legacy' ? {} : { systemPromptUpdate: 'in-history' }),
    })
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

function count(text, needle) {
  return text.split(needle).length - 1
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
  throw new Error('Context Manager runtime did not attach')
}

function setMode(ctx, mode) {
  state.mode = mode
  ctx.emit('dsh-context-manager/change')
}

async function executeSkill(ctx, agent, suffix) {
  return await ctx.tools.execute({
    signal: new AbortController().signal,
    callId: toolCallId(`m5c-${suffix}`),
    name: 'skill',
    arguments: { name: 'target' },
    agent,
  })
}

const DESCRIPTION = 'M5C_E2E_TARGET_DESCRIPTION'
const RESOURCE_PATH = '/skills/m5c-target'

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
      ? { persona: 'M5C_NATIVE_PERSONA' }
      : { personaPrefix: 'M5C_NATIVE_PERSONA' },
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
          userInvocable: true,
        },
        source: 'custom',
        provider: 'native-provider',
        resourceBase: {
          kind: 'directory',
          path: RESOURCE_PATH,
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
        content: state.body,
      }
    },
  }))

  await ctx.plugin(FakeManager)
  await ctx.plugin(FakePresetIdentity)
  const seriesFiber = ctx.plugin(ContextManagerRequestSeries)
  await seriesFiber
  let policyFiber = ctx.plugin(ContextManagerSkillRuntime)
  await policyFiber
  let pinnedFiber = ctx.plugin(ContextManagerPinnedSkillRuntime)
  await pinnedFiber

  const agent = await ctx.agentLoop.create(SessionId('m5c-e2e'), {
    provider: 'mock',
    model: 'mock',
  })

  let policyInspection = await waitForRuntime(ctx.dshContextSkillRuntime, agent.id)
  let pinnedInspection = await waitForRuntime(ctx.dshContextPinnedSkillRuntime, agent.id)
  assert.equal(policyInspection.status, 'resolved')
  assert.equal(policyInspection.bindings[0]?.state, 'policy-applied')
  assert.equal(pinnedInspection.status, 'resolved')
  assert.equal(pinnedInspection.nativeState, 'present')
  assert.equal(pinnedInspection.bindings[0]?.state, 'loaded')
  assert.equal(JSON.stringify(pinnedInspection).includes(state.body), false)

  await turn(ctx, agent, 'pinned turn 1')
  let text = requestText(adapter.requests.at(-1))
  assert.equal(count(text, state.body), 1)
  assert.equal(text.includes(DESCRIPTION), false)
  assert.ok(text.includes(`Base directory for this skill: ${RESOURCE_PATH}`))
  assert.ok(text.includes('{{literal_unknown}}'))

  // Native model/user Skill invocation remains disabled by M5B while M5C
  // contributes exactly one full instruction bundle.
  let toolResult = await executeSkill(ctx, agent, 'pinned')
  assert.equal(toolResult.isError, true)

  await turn(ctx, agent, '/target')
  text = requestText(adapter.requests.at(-1))
  assert.equal(count(text, state.body), 1, 'explicit user invocation must not add a second Skill body')

  // Repeated steps must reconcile one current system-prompt bundle rather than
  // accumulate historical pinned messages. The current-generation lane runs
  // with systemPromptUpdate=in-history, so these whole-request counts also
  // prove the M5C request-series restart clears stale system nodes.
  await turn(ctx, agent, 'pinned turn 2')
  text = requestText(adapter.requests.at(-1))
  assert.equal(count(text, state.body), 1)

  setMode(ctx, 'off')
  await turn(ctx, agent, 'off clears pinned bundle')
  text = requestText(adapter.requests.at(-1))
  assert.equal(text.includes('M5C_E2E_BODY_V1'), false)
  assert.equal(text.includes(DESCRIPTION), false)

  setMode(ctx, 'pinned')
  await turn(ctx, agent, 'pinned restored')
  text = requestText(adapter.requests.at(-1))
  assert.equal(count(text, state.body), 1)

  state.body = 'M5C_E2E_BODY_V2 {{still_literal}}'
  await turn(ctx, agent, 'provider body changed')
  text = requestText(adapter.requests.at(-1))
  assert.equal(text.includes('M5C_E2E_BODY_V1'), false)
  assert.equal(count(text, state.body), 1)
  assert.ok(text.includes('{{still_literal}}'))

  // Exact base-preset mismatch disables both the CM policy overlay and Pinned
  // full-instruction path. Native Auto-like discovery becomes visible again.
  state.presetId = 'preset-b'
  ctx.emit('dsh-context-manager/change')
  await turn(ctx, agent, 'preset mismatch')
  text = requestText(adapter.requests.at(-1))
  assert.equal(text.includes(state.body), false)
  assert.ok(text.includes(DESCRIPTION))

  policyInspection = await ctx.dshContextSkillRuntime.inspect(agent.id)
  pinnedInspection = await ctx.dshContextPinnedSkillRuntime.inspect(agent.id)
  assert.equal(policyInspection.profile.status, 'base-preset-mismatch')
  assert.equal(pinnedInspection.profile.status, 'base-preset-mismatch')
  assert.equal(pinnedInspection.nativeState, 'empty')

  state.presetId = 'preset-a'
  ctx.emit('dsh-context-manager/change')
  await turn(ctx, agent, 'preset restored')
  text = requestText(adapter.requests.at(-1))
  assert.equal(count(text, state.body), 1)
  assert.equal(text.includes(DESCRIPTION), false)

  const disposeComplete = agent.ctx.systemPrompt.section({
    name: 'm5c:test-complete',
    order: 0,
    text: 'M5C_COMPLETE_PROMPT',
    complete: true,
  })
  await turn(ctx, agent, 'complete prompt suppression')
  text = requestText(adapter.requests.at(-1))
  assert.ok(text.includes('M5C_COMPLETE_PROMPT'))
  assert.equal(text.includes(state.body), false)

  pinnedInspection = await ctx.dshContextPinnedSkillRuntime.inspect(agent.id)
  assert.equal(pinnedInspection.status, 'resolved')
  assert.equal(pinnedInspection.nativeState, 'native-suppressed')
  disposeComplete()

  // M5C unload clears only the instruction path. M5B still keeps Pinned
  // non-invocable. Reload restores exactly one current bundle.
  await pinnedFiber.dispose()
  await turn(ctx, agent, 'pinned runtime unloaded')
  text = requestText(adapter.requests.at(-1))
  assert.equal(text.includes(state.body), false)
  toolResult = await executeSkill(ctx, agent, 'policy-still-active')
  assert.equal(toolResult.isError, true)

  pinnedFiber = ctx.plugin(ContextManagerPinnedSkillRuntime)
  await pinnedFiber
  await waitForRuntime(ctx.dshContextPinnedSkillRuntime, agent.id)
  await turn(ctx, agent, 'pinned runtime reloaded')
  text = requestText(adapter.requests.at(-1))
  assert.equal(count(text, state.body), 1)

  // M5C depends on M5B policy runtime. Removing policy alone must deactivate
  // the Pinned instruction bridge instead of leaving a half-Pinned state.
  await policyFiber.dispose()
  await turn(ctx, agent, 'policy runtime unloaded')
  text = requestText(adapter.requests.at(-1))
  assert.equal(text.includes(state.body), false)
  pinnedInspection = await ctx.dshContextPinnedSkillRuntime.inspect(agent.id)
  assert.equal(pinnedInspection.status, 'runtime-unavailable')
  toolResult = await executeSkill(ctx, agent, 'stock-without-policy')
  assert.equal(toolResult.isError, false)

  policyFiber = ctx.plugin(ContextManagerSkillRuntime)
  await policyFiber
  await waitForRuntime(ctx.dshContextSkillRuntime, agent.id)
  await waitForRuntime(ctx.dshContextPinnedSkillRuntime, agent.id)
  await turn(ctx, agent, 'policy runtime restored')
  text = requestText(adapter.requests.at(-1))
  assert.equal(count(text, state.body), 1)

  await pinnedFiber.dispose()
  await policyFiber.dispose()

  // With both CM runtimes unloaded, stock native Skill behavior is restored.
  toolResult = await executeSkill(ctx, agent, 'stock-restored')
  assert.equal(toolResult.isError, false)
  assert.ok(JSON.stringify(toolResult.content).includes(state.body))

  await seriesFiber.dispose()
  stopNative()
} finally {
  await ctx.fiber.dispose()
}
