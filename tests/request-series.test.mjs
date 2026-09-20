import assert from 'node:assert/strict'
import { test } from 'node:test'

import { Context } from '@deepseek-ai/cordis'

import { ContextManagerRequestSeries } from '../src/service/request-series.ts'

function fakeAgent(root, id = 'agent-a') {
  const fiber = root.plugin(() => {})
  return {
    agent: {
      id,
      ctx: fiber.ctx,
    },
    fiber,
  }
}

async function preStep(agent, decision) {
  return await agent.ctx.waterfall(
    agent.ctx,
    'agent/pre-step',
    {},
    () => Promise.resolve(decision),
  )
}

test('request-series guard starts a series only when it asks and preserves downstream series', async () => {
  const root = new Context()
  const fiber = root.plugin(ContextManagerRequestSeries)
  await fiber
  const { agent, fiber: agentFiber } = fakeAgent(root)

  let force = false
  const stop = root.dshContextRequestSeries.register(
    agent,
    () => force,
    () => false,
  )

  let decision = await preStep(agent, { kind: 'enter', messages: [] })
  assert.deepEqual(decision, { kind: 'enter', messages: [] })

  force = true
  decision = await preStep(agent, { kind: 'enter', messages: [] })
  assert.deepEqual(decision, {
    kind: 'enter',
    messages: [],
    startsRequestSeries: true,
  })

  decision = await preStep(agent, {
    kind: 'enter',
    messages: [],
    startsRequestSeries: true,
  })
  assert.deepEqual(decision, {
    kind: 'enter',
    messages: [],
    startsRequestSeries: true,
  })

  stop()
  await agentFiber.dispose()
  await fiber.dispose()
  await root.fiber.dispose()
})

test('retired contributor leaves one fence and reject does not consume it', async () => {
  const root = new Context()
  const fiber = root.plugin(ContextManagerRequestSeries)
  await fiber
  const { agent, fiber: agentFiber } = fakeAgent(root)

  const stop = root.dshContextRequestSeries.register(
    agent,
    () => false,
    () => true,
  )
  stop()

  let decision = await preStep(agent, { kind: 'reject' })
  assert.deepEqual(decision, { kind: 'reject' })

  decision = await preStep(agent, { kind: 'enter', messages: [] })
  assert.deepEqual(decision, {
    kind: 'enter',
    messages: [],
    startsRequestSeries: true,
  })

  decision = await preStep(agent, { kind: 'enter', messages: [] })
  assert.deepEqual(decision, { kind: 'enter', messages: [] })

  await agentFiber.dispose()
  await fiber.dispose()
  await root.fiber.dispose()
})

test('retire without admitted state removes the guard without leaving a fence', async () => {
  const root = new Context()
  const fiber = root.plugin(ContextManagerRequestSeries)
  await fiber
  const { agent, fiber: agentFiber } = fakeAgent(root)

  const stop = root.dshContextRequestSeries.register(
    agent,
    () => false,
    () => false,
  )
  stop()

  const decision = await preStep(agent, { kind: 'enter', messages: [] })
  assert.deepEqual(decision, { kind: 'enter', messages: [] })

  await agentFiber.dispose()
  await fiber.dispose()
  await root.fiber.dispose()
})


test('force() fences the next accepted enter and survives a reject', async () => {
  const root = new Context()
  const fiber = root.plugin(ContextManagerRequestSeries)
  await fiber
  const { agent, fiber: agentFiber } = fakeAgent(root)

  const stop = root.dshContextRequestSeries.register(
    agent,
    () => false,
    () => false,
  )
  root.dshContextRequestSeries.force(agent)

  let decision = await preStep(agent, { kind: 'reject' })
  assert.deepEqual(decision, { kind: 'reject' })

  decision = await preStep(agent, { kind: 'enter', messages: [] })
  assert.deepEqual(decision, {
    kind: 'enter',
    messages: [],
    startsRequestSeries: true,
  })

  decision = await preStep(agent, { kind: 'enter', messages: [] })
  assert.deepEqual(decision, { kind: 'enter', messages: [] })

  stop()
  await agentFiber.dispose()
  await fiber.dispose()
  await root.fiber.dispose()
})

test('authoritative Context Manager, Skill, and SystemPrompt changes fence the next request once', async () => {
  const root = new Context()
  const fiber = root.plugin(ContextManagerRequestSeries)
  await fiber
  const { agent, fiber: agentFiber } = fakeAgent(root)

  const stop = root.dshContextRequestSeries.register(
    agent,
    () => false,
    () => false,
  )

  for (const event of [
    'dsh-context-manager/change',
    'skills/change',
    'system-prompt/change',
  ]) {
    root.emit(event)

    let decision = await preStep(agent, { kind: 'enter', messages: [] })
    assert.deepEqual(decision, {
      kind: 'enter',
      messages: [],
      startsRequestSeries: true,
    })

    decision = await preStep(agent, { kind: 'enter', messages: [] })
    assert.deepEqual(decision, { kind: 'enter', messages: [] })
  }

  stop()
  await agentFiber.dispose()
  await fiber.dispose()
  await root.fiber.dispose()
})
