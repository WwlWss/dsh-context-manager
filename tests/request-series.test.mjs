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

  let decision = await preStep(agent, { kind: 'enter', messages: [{ role: 'user' }] })
  assert.deepEqual(decision, { kind: 'enter', messages: [{ role: 'user' }] })

  force = true
  decision = await preStep(agent, { kind: 'enter', messages: [{ role: 'user' }] })
  assert.deepEqual(decision, {
    kind: 'enter',
    messages: [{ role: 'user' }],
    startsRequestSeries: true,
  })

  decision = await preStep(agent, {
    kind: 'enter',
    messages: [{ role: 'user' }],
    startsRequestSeries: true,
  })
  assert.deepEqual(decision, {
    kind: 'enter',
    messages: [{ role: 'user' }],
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

  decision = await preStep(agent, { kind: 'enter', messages: [{ role: 'user' }] })
  assert.deepEqual(decision, {
    kind: 'enter',
    messages: [{ role: 'user' }],
    startsRequestSeries: true,
  })

  decision = await preStep(agent, { kind: 'enter', messages: [{ role: 'user' }] })
  assert.deepEqual(decision, { kind: 'enter', messages: [{ role: 'user' }] })

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

  const decision = await preStep(agent, { kind: 'enter', messages: [{ role: 'user' }] })
  assert.deepEqual(decision, { kind: 'enter', messages: [{ role: 'user' }] })

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

  decision = await preStep(agent, { kind: 'enter', messages: [{ role: 'user' }] })
  assert.deepEqual(decision, {
    kind: 'enter',
    messages: [{ role: 'user' }],
    startsRequestSeries: true,
  })

  decision = await preStep(agent, { kind: 'enter', messages: [{ role: 'user' }] })
  assert.deepEqual(decision, { kind: 'enter', messages: [{ role: 'user' }] })

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

    let decision = await preStep(agent, { kind: 'enter', messages: [{ role: 'user' }] })
    assert.deepEqual(decision, {
      kind: 'enter',
      messages: [{ role: 'user' }],
      startsRequestSeries: true,
    })

    decision = await preStep(agent, { kind: 'enter', messages: [{ role: 'user' }] })
    assert.deepEqual(decision, { kind: 'enter', messages: [{ role: 'user' }] })
  }

  stop()
  await agentFiber.dispose()
  await fiber.dispose()
  await root.fiber.dispose()
})


test('empty enter does not consume a pending request-series fence or guard baseline', async () => {
  const root = new Context()
  const fiber = root.plugin(ContextManagerRequestSeries)
  await fiber
  const { agent, fiber: agentFiber } = fakeAgent(root)

  let guardCalls = 0
  const stop = root.dshContextRequestSeries.register(
    agent,
    () => {
      guardCalls += 1
      return false
    },
    () => false,
  )
  root.dshContextRequestSeries.force(agent)

  let decision = await preStep(agent, { kind: 'enter', messages: [] })
  assert.deepEqual(decision, { kind: 'enter', messages: [] })
  assert.equal(guardCalls, 0)

  decision = await preStep(agent, { kind: 'enter', messages: [{ role: 'user' }] })
  assert.deepEqual(decision, {
    kind: 'enter',
    messages: [{ role: 'user' }],
    startsRequestSeries: true,
  })
  assert.equal(guardCalls, 1)

  decision = await preStep(agent, { kind: 'enter', messages: [{ role: 'user' }] })
  assert.deepEqual(decision, {
    kind: 'enter',
    messages: [{ role: 'user' }],
  })
  assert.equal(guardCalls, 2)

  stop()
  await agentFiber.dispose()
  await fiber.dispose()
  await root.fiber.dispose()
})


test('external authority fence acknowledges the request contribution without a redundant second boundary', async () => {
  const root = new Context()
  const fiber = root.plugin(ContextManagerRequestSeries)
  await fiber
  const { agent, fiber: agentFiber } = fakeAgent(root)

  let observed = 'old'
  let admitted = 'old'
  const stop = root.dshContextRequestSeries.register(
    agent,
    () => {
      const changed = observed !== admitted
      admitted = observed
      return changed
    },
    () => admitted !== 'empty',
  )

  root.emit('dsh-context-manager/change')

  let decision = await preStep(agent, { kind: 'enter', messages: [{ role: 'user' }] })
  assert.equal(decision.startsRequestSeries, true)

  // Simulate the request assembly that follows this pre-step observing the
  // authoritative new pinned contribution.
  observed = 'new'

  decision = await preStep(agent, { kind: 'enter', messages: [{ role: 'user' }] })
  assert.equal(decision.startsRequestSeries, undefined)
  assert.equal(admitted, 'new', 'the guard baseline still advances while acknowledged')

  decision = await preStep(agent, { kind: 'enter', messages: [{ role: 'user' }] })
  assert.equal(decision.startsRequestSeries, undefined)

  stop()
  await agentFiber.dispose()
  await fiber.dispose()
  await root.fiber.dispose()
})

test('a newer external authority event during acknowledgement still creates its own boundary', async () => {
  const root = new Context()
  const fiber = root.plugin(ContextManagerRequestSeries)
  await fiber
  const { agent, fiber: agentFiber } = fakeAgent(root)

  let observed = 'old'
  let admitted = 'old'
  const stop = root.dshContextRequestSeries.register(
    agent,
    () => {
      const changed = observed !== admitted
      admitted = observed
      return changed
    },
    () => admitted !== 'empty',
  )

  root.emit('skills/change')
  let decision = await preStep(agent, { kind: 'enter', messages: [{ role: 'user' }] })
  assert.equal(decision.startsRequestSeries, true)

  observed = 'first-new'
  // A second authority change happens before the acknowledgement pre-step.
  root.emit('system-prompt/change')

  decision = await preStep(agent, { kind: 'enter', messages: [{ role: 'user' }] })
  assert.equal(decision.startsRequestSeries, true)
  assert.equal(admitted, 'first-new')

  observed = 'second-new'
  decision = await preStep(agent, { kind: 'enter', messages: [{ role: 'user' }] })
  assert.equal(decision.startsRequestSeries, undefined)
  assert.equal(admitted, 'second-new')

  stop()
  await agentFiber.dispose()
  await fiber.dispose()
  await root.fiber.dispose()
})
