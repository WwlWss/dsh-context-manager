import assert from 'node:assert/strict'
import { test } from 'node:test'

import { Context, Service } from '@deepseek-ai/cordis'

import { attachAgentRuntimeBridge } from '../src/adapters/agent-runtime.ts'

class FakeAgents extends Service {
  constructor(ctx, agents = []) {
    super(ctx, 'agents')
    this.agents = agents
  }

  get(id) {
    return this.agents.find(agent => agent.id === id)
  }

  list() {
    return [...this.agents]
  }
}

function agent(id) {
  const ctx = new Context()
  return { id, ctx }
}

function emitCreated(ctx, value) {
  return ctx.emit('agent/created', { agent: value })
}

function emitDisposed(ctx, value) {
  return ctx.emit('agent/disposed', { agent: value })
}

test('Agent runtime bridge reports absent agents capability without attaching', async () => {
  const ctx = new Context()
  let calls = 0
  const bridge = await attachAgentRuntimeBridge(ctx, async () => {
    calls += 1
    return () => {}
  })

  assert.equal(bridge, undefined)
  assert.equal(calls, 0)
})

test('Agent runtime bridge adopts existing Agents and later created Agents once by object identity', async () => {
  const root = new Context()
  const first = agent('same-id')
  const second = agent('same-id')
  const agents = [first]
  await root.plugin(FakeAgents, agents)

  const attached = []
  const cleaned = []
  const bridge = await attachAgentRuntimeBridge(root, async current => {
    attached.push(current)
    return () => { cleaned.push(current) }
  })
  assert.ok(bridge)
  assert.deepEqual(attached, [first])

  await emitCreated(root, first)
  assert.deepEqual(attached, [first])

  agents.push(second)
  await emitCreated(root, second)
  assert.deepEqual(attached, [first, second])
  assert.equal(bridge.agents.size, 2)

  await bridge.dispose()
  assert.deepEqual(cleaned, [second, first])
  assert.equal(bridge.agents.size, 0)
})

test('Agent runtime bridge drops disposed Agent identity without re-disposing its already-owned scope effects', async () => {
  const root = new Context()
  const current = agent('a')
  await root.plugin(FakeAgents, [current])
  let cleanupCalls = 0

  const bridge = await attachAgentRuntimeBridge(root, async () => () => {
    cleanupCalls += 1
  })
  assert.ok(bridge)
  assert.equal(bridge.agents.has(current), true)

  await emitDisposed(root, current)
  assert.equal(bridge.agents.has(current), false)

  // In real DSH the Agent scope is disposed before agent/disposed; the bridge
  // must not invoke the same scoped disposer a second time.
  assert.equal(cleanupCalls, 0)

  await bridge.dispose()
  assert.equal(cleanupCalls, 0)
})

test('Agent runtime bridge initial adoption rolls back earlier Agents when a later attach fails', async () => {
  const root = new Context()
  const first = agent('a')
  const second = agent('b')
  await root.plugin(FakeAgents, [first, second])

  const cleaned = []
  await assert.rejects(
    attachAgentRuntimeBridge(root, async current => {
      if (current === second) throw new Error('attach failed')
      return () => { cleaned.push(current.id) }
    }),
    /attach failed/,
  )

  assert.deepEqual(cleaned, ['a'])
})

test('Agent runtime bridge cleans an attachment that finishes after bridge disposal begins', async () => {
  const root = new Context()
  await root.plugin(FakeAgents, [])
  const pending = Promise.withResolvers()
  const cleaned = []

  const bridge = await attachAgentRuntimeBridge(root, async current => {
    if (current.id === 'late') await pending.promise
    return () => { cleaned.push(current.id) }
  })
  assert.ok(bridge)

  const late = agent('late')
  const created = emitCreated(root, late)
  const disposing = bridge.dispose()
  pending.resolve()

  await created
  await disposing
  assert.deepEqual(cleaned, ['late'])
  assert.equal(bridge.agents.size, 0)
})

test('Agent runtime bridge validates malformed present Host capabilities and Agent shapes', async () => {
  class BrokenAgents extends Service {
    constructor(ctx) {
      super(ctx, 'agents')
    }
    get() {}
  }

  const broken = new Context()
  await broken.plugin(BrokenAgents)
  await assert.rejects(
    attachAgentRuntimeBridge(broken, async () => () => {}),
    /unsupported agents API; expected list\(\)/,
  )

  const malformed = new Context()
  await malformed.plugin(FakeAgents, [{ id: 'x', ctx: {} }])
  await assert.rejects(
    attachAgentRuntimeBridge(malformed, async () => () => {}),
    /ctx must expose get\(\), effect\(\), and on\(\)/,
  )
})

test('Agent runtime bridge dispose is idempotent', async () => {
  const root = new Context()
  const current = agent('a')
  await root.plugin(FakeAgents, [current])
  let cleaned = 0

  const bridge = await attachAgentRuntimeBridge(root, async () => () => {
    cleaned += 1
  })
  assert.ok(bridge)

  await bridge.dispose()
  await bridge.dispose()
  assert.equal(cleaned, 1)
})
