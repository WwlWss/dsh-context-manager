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

function admitRequest(agent) {
  agent.ctx.emit('session/event', {}, {
    type: 'request/header',
    data: {},
  })
}

test('request-series guard starts a series only when it asks and preserves downstream series', async () => {
  const root = new Context()
  const fiber = root.plugin(ContextManagerRequestSeries)
  await fiber
  const { agent, fiber: agentFiber } = fakeAgent(root)

  let wantsFence = false
  let commits = 0
  const stop = root.dshContextRequestSeries.register(
    agent,
    () => wantsFence,
    () => {
      commits += 1
    },
    () => false,
  )

  let decision = await preStep(agent, { kind: 'enter', messages: [{ role: 'user' }] })
  assert.deepEqual(decision, { kind: 'enter', messages: [{ role: 'user' }] })

  wantsFence = true
  decision = await preStep(agent, { kind: 'enter', messages: [{ role: 'user' }] })
  assert.equal(decision.startsRequestSeries, true)
  assert.equal(commits, 0, 'pre-step acceptance is not durable admission')
  admitRequest(agent)
  assert.equal(commits, 1)

  wantsFence = false
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
    () => {},
    () => true,
  )
  stop()

  let decision = await preStep(agent, { kind: 'reject' })
  assert.deepEqual(decision, { kind: 'reject' })

  decision = await preStep(agent, { kind: 'enter', messages: [{ role: 'user' }] })
  assert.equal(decision.startsRequestSeries, true)
  admitRequest(agent)

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
    () => {},
    () => false,
  )
  stop()

  const decision = await preStep(agent, { kind: 'enter', messages: [{ role: 'user' }] })
  assert.deepEqual(decision, { kind: 'enter', messages: [{ role: 'user' }] })

  await agentFiber.dispose()
  await fiber.dispose()
  await root.fiber.dispose()
})

test('force() survives reject and a failed proposal until request/header admits it', async () => {
  const root = new Context()
  const fiber = root.plugin(ContextManagerRequestSeries)
  await fiber
  const { agent, fiber: agentFiber } = fakeAgent(root)

  const stop = root.dshContextRequestSeries.register(
    agent,
    () => false,
    () => {},
    () => false,
  )
  root.dshContextRequestSeries.force(agent)

  let decision = await preStep(agent, { kind: 'reject' })
  assert.deepEqual(decision, { kind: 'reject' })

  decision = await preStep(agent, { kind: 'enter', messages: [{ role: 'user' }] })
  assert.equal(decision.startsRequestSeries, true)

  // Simulate agent/request or prepareCall failing after pre-step: no
  // request/header was committed, so the next proposal must still be fenced.
  decision = await preStep(agent, { kind: 'enter', messages: [{ role: 'user' }] })
  assert.equal(decision.startsRequestSeries, true)

  admitRequest(agent)
  decision = await preStep(agent, { kind: 'enter', messages: [{ role: 'user' }] })
  assert.deepEqual(decision, { kind: 'enter', messages: [{ role: 'user' }] })

  stop()
  await agentFiber.dispose()
  await fiber.dispose()
  await root.fiber.dispose()
})

test('authoritative Context Manager, Skill, and SystemPrompt changes fence the next admitted request once', async () => {
  const root = new Context()
  const fiber = root.plugin(ContextManagerRequestSeries)
  await fiber
  const { agent, fiber: agentFiber } = fakeAgent(root)

  const stop = root.dshContextRequestSeries.register(
    agent,
    () => false,
    () => {},
    () => false,
  )

  for (const event of [
    'dsh-context-manager/change',
    'skills/change',
    'system-prompt/change',
  ]) {
    root.emit(event)

    let decision = await preStep(agent, { kind: 'enter', messages: [{ role: 'user' }] })
    assert.equal(decision.startsRequestSeries, true)
    admitRequest(agent)

    decision = await preStep(agent, { kind: 'enter', messages: [{ role: 'user' }] })
    assert.deepEqual(decision, { kind: 'enter', messages: [{ role: 'user' }] })
  }

  stop()
  await agentFiber.dispose()
  await fiber.dispose()
  await root.fiber.dispose()
})

test('empty enter does not prepare or consume a pending request-series fence', async () => {
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
    () => {},
    () => false,
  )
  root.dshContextRequestSeries.force(agent)

  let decision = await preStep(agent, { kind: 'enter', messages: [] })
  assert.deepEqual(decision, { kind: 'enter', messages: [] })
  assert.equal(guardCalls, 0)

  decision = await preStep(agent, { kind: 'enter', messages: [{ role: 'user' }] })
  assert.equal(decision.startsRequestSeries, true)
  assert.equal(guardCalls, 1)
  admitRequest(agent)

  decision = await preStep(agent, { kind: 'enter', messages: [{ role: 'user' }] })
  assert.equal(decision.startsRequestSeries, undefined)
  assert.equal(guardCalls, 2)

  stop()
  await agentFiber.dispose()
  await fiber.dispose()
  await root.fiber.dispose()
})

test('signature baseline advances only after durable request/header admission', async () => {
  const root = new Context()
  const fiber = root.plugin(ContextManagerRequestSeries)
  await fiber
  const { agent, fiber: agentFiber } = fakeAgent(root)

  let observed = 'old'
  let admitted = 'old'
  const stop = root.dshContextRequestSeries.register(
    agent,
    () => observed !== admitted,
    () => {
      admitted = observed
    },
    () => admitted !== 'empty',
  )

  observed = 'new'
  let decision = await preStep(agent, { kind: 'enter', messages: [{ role: 'user' }] })
  assert.equal(decision.startsRequestSeries, true)
  assert.equal(admitted, 'old')

  // No header: this models a failure in agent/request or prepareCall.
  decision = await preStep(agent, { kind: 'enter', messages: [{ role: 'user' }] })
  assert.equal(decision.startsRequestSeries, true)
  assert.equal(admitted, 'old')

  admitRequest(agent)
  assert.equal(admitted, 'new')

  decision = await preStep(agent, { kind: 'enter', messages: [{ role: 'user' }] })
  assert.equal(decision.startsRequestSeries, undefined)

  stop()
  await agentFiber.dispose()
  await fiber.dispose()
  await root.fiber.dispose()
})

test('external force and same-request signature change coalesce into one admitted boundary', async () => {
  const root = new Context()
  const fiber = root.plugin(ContextManagerRequestSeries)
  await fiber
  const { agent, fiber: agentFiber } = fakeAgent(root)

  let observed = 'old'
  let admitted = 'old'
  const stop = root.dshContextRequestSeries.register(
    agent,
    () => observed !== admitted,
    () => {
      admitted = observed
    },
    () => admitted !== 'empty',
  )

  root.emit('skills/change')
  observed = 'new'

  let decision = await preStep(agent, { kind: 'enter', messages: [{ role: 'user' }] })
  assert.equal(decision.startsRequestSeries, true)
  assert.equal(admitted, 'old')
  admitRequest(agent)
  assert.equal(admitted, 'new')

  decision = await preStep(agent, { kind: 'enter', messages: [{ role: 'user' }] })
  assert.equal(decision.startsRequestSeries, undefined)

  stop()
  await agentFiber.dispose()
  await fiber.dispose()
  await root.fiber.dispose()
})

test('prepended coordinator observes a downstream rejection without consuming admission state', async () => {
  const root = new Context()
  const fiber = root.plugin(ContextManagerRequestSeries)
  await fiber
  const { agent, fiber: agentFiber } = fakeAgent(root)

  let guardCalls = 0
  let commits = 0
  const stop = root.dshContextRequestSeries.register(
    agent,
    () => {
      guardCalls += 1
      return true
    },
    () => {
      commits += 1
    },
    () => false,
  )

  const stopReject = agent.ctx.on('agent/pre-step', async (_request, next) => {
    await next()
    return { kind: 'reject' }
  })

  let decision = await preStep(agent, { kind: 'enter', messages: [{ role: 'user' }] })
  assert.deepEqual(decision, { kind: 'reject' })
  assert.equal(guardCalls, 0)
  assert.equal(commits, 0)

  stopReject()
  decision = await preStep(agent, { kind: 'enter', messages: [{ role: 'user' }] })
  assert.equal(decision.startsRequestSeries, true)
  admitRequest(agent)
  assert.equal(commits, 1)

  stop()
  await agentFiber.dispose()
  await fiber.dispose()
  await root.fiber.dispose()
})

test('retirement force created after pre-step survives that request header', async () => {
  const root = new Context()
  const fiber = root.plugin(ContextManagerRequestSeries)
  await fiber
  const { agent, fiber: agentFiber } = fakeAgent(root)

  let commits = 0
  const stop = root.dshContextRequestSeries.register(
    agent,
    () => true,
    () => {
      commits += 1
    },
    () => true,
  )

  let decision = await preStep(agent, { kind: 'enter', messages: [{ role: 'user' }] })
  assert.equal(decision.startsRequestSeries, true)

  // Teardown happens after pre-step but before the current request commits.
  // Its cleanup fence is newer than this proposal and must survive the header.
  stop()
  admitRequest(agent)
  assert.equal(commits, 1)

  decision = await preStep(agent, { kind: 'enter', messages: [{ role: 'user' }] })
  assert.equal(decision.startsRequestSeries, true)
  admitRequest(agent)

  decision = await preStep(agent, { kind: 'enter', messages: [{ role: 'user' }] })
  assert.equal(decision.startsRequestSeries, undefined)

  await agentFiber.dispose()
  await fiber.dispose()
  await root.fiber.dispose()
})

test('retired contributor is not resurrected by a later prompt teardown event', async () => {
  const root = new Context()
  const fiber = root.plugin(ContextManagerRequestSeries)
  await fiber
  const { agent, fiber: agentFiber } = fakeAgent(root)

  const stop = root.dshContextRequestSeries.register(
    agent,
    () => false,
    () => {},
    () => false,
  )

  stop()
  root.emit('system-prompt/change')

  const decision = await preStep(agent, {
    kind: 'enter',
    messages: [{ role: 'user' }],
  })
  assert.deepEqual(decision, {
    kind: 'enter',
    messages: [{ role: 'user' }],
  })

  await agentFiber.dispose()
  await fiber.dispose()
  await root.fiber.dispose()
})
