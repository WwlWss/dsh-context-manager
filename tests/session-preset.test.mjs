import assert from 'node:assert/strict'
import { test } from 'node:test'

import { Context, Service } from '@deepseek-ai/cordis'

import { ContextManagerSessionPreset } from '../lib/index.js'

class FakeSessions extends Service {
  constructor(ctx, sessions = new Map()) {
    super(ctx, 'sessions')
    this.sessions = sessions
  }

  get(id) {
    return this.sessions.get(id)
  }
}

class FakeSessionProjections extends Service {
  constructor(ctx, stateOf) {
    super(ctx, 'sessionProjections')
    this.read = stateOf
  }

  stateOf(session, key) {
    return this.read(session, key)
  }
}

async function boot({ sessions, projection } = {}) {
  const ctx = new Context()
  const serviceFiber = ctx.plugin(ContextManagerSessionPreset)
  await serviceFiber

  let sessionsFiber
  if (sessions !== undefined) {
    sessionsFiber = ctx.plugin(FakeSessions, sessions)
    await sessionsFiber
  }

  let projectionFiber
  if (projection !== undefined) {
    projectionFiber = ctx.plugin(FakeSessionProjections, projection)
    await projectionFiber
  }

  return {
    ctx,
    service: ctx.get('dshContextSessionPreset'),
    serviceFiber,
    sessionsFiber,
    projectionFiber,
  }
}

function liveSession({ creationPreset, events = [], modern = true } = {}) {
  const header = creationPreset === undefined ? {} : { agentPreset: creationPreset }
  if (modern) {
    return {
      header,
      snapshotEvents() {
        return events
      },
    }
  }
  return { header, events }
}

function selected(agentPreset) {
  return {
    type: 'agent-preset/selected',
    data: { agentPreset },
  }
}

test('sessions capability absence is unavailable', async () => {
  const { service } = await boot()

  assert.deepEqual(service.snapshot('session-a'), {
    status: 'unavailable',
    sessionId: 'session-a',
  })
})

test('a session outside the live SessionStore is not-live rather than not-found', async () => {
  const { service } = await boot({ sessions: new Map() })

  assert.deepEqual(service.snapshot('cold-session'), {
    status: 'not-live',
    sessionId: 'cold-session',
  })
})

test('native Session projection is authoritative when registered', async () => {
  const session = liveSession({
    creationPreset: 'creation-preset',
    events: [selected('logged-preset')],
  })
  const sessions = new Map([['session-a', session]])
  const { service } = await boot({
    sessions,
    projection: (seen, key) => {
      assert.equal(seen, session)
      assert.equal(key, 'agentPreset')
      return 'projected-preset'
    },
  })

  assert.deepEqual(service.snapshot('session-a'), {
    status: 'known',
    sessionId: 'session-a',
    presetId: 'projected-preset',
  })
})

test('projection success does not validate fallback-only Session fields', async () => {
  const session = {
    header: 42,
    snapshotEvents: 'future-nonfunction-shape',
    events: { not: 'an array' },
  }
  const sessions = new Map([['session-a', session]])
  const { service } = await boot({ sessions, projection: () => 'projected-preset' })

  assert.equal(service.snapshot('session-a').presetId, 'projected-preset')
})

test('native null projection preserves the no-per-session-composition state', async () => {
  const sessions = new Map([['session-a', liveSession({ creationPreset: 'old' })]])
  const { service } = await boot({ sessions, projection: () => null })

  assert.deepEqual(service.snapshot('session-a'), {
    status: 'known',
    sessionId: 'session-a',
    presetId: null,
  })
})

test('an absent agentPreset projection key falls back to modern Session snapshots', async () => {
  const sessions = new Map([[
    'session-a',
    liveSession({
      creationPreset: 'creation-preset',
      events: [selected('first'), { type: 'other', data: {} }, selected('last')],
    }),
  ]])
  const { service } = await boot({ sessions, projection: () => undefined })

  assert.equal(service.snapshot('session-a').presetId, 'last')
})

test('fallback validates only the Session surface it actually consumes', async () => {
  const sessions = new Map([[
    'bad-snapshot',
    { header: {}, snapshotEvents: 'not-a-function', events: [selected('ignored')] },
  ], [
    'bad-events',
    { header: {}, events: { not: 'an array' } },
  ]])
  const { service } = await boot({ sessions, projection: () => undefined })

  assert.throws(
    () => service.snapshot('bad-snapshot'),
    /snapshotEvents must be a function when used/,
  )
  assert.throws(
    () => service.snapshot('bad-events'),
    /expected snapshotEvents\(\) or events to provide an array/,
  )
})

test('legacy Session.events fallback uses the newest selection and then creation header', async () => {
  const sessions = new Map([
    ['selected', liveSession({
      creationPreset: 'creation-preset',
      events: [selected('first'), selected('last')],
      modern: false,
    })],
    ['header-only', liveSession({ creationPreset: 'header-preset', modern: false })],
    ['none', liveSession({ modern: false })],
  ])
  const { service } = await boot({ sessions })

  assert.equal(service.snapshot('selected').presetId, 'last')
  assert.equal(service.snapshot('header-only').presetId, 'header-preset')
  assert.equal(service.snapshot('none').presetId, null)
})

test('preset ids are preserved exactly without normalization or default fallback', async () => {
  const exact = '  Mixed/Case Preset  '
  const sessions = new Map([['session-a', liveSession({ events: [selected(exact)] })]])
  const { service } = await boot({ sessions })

  assert.equal(service.snapshot('session-a').presetId, exact)
})

test('a malformed present projection value fails loud instead of falling back', async () => {
  const sessions = new Map([['session-a', liveSession({ events: [selected('fallback')] })]])
  const { service } = await boot({ sessions, projection: () => 42 })

  assert.throws(
    () => service.snapshot('session-a'),
    /unsupported sessionProjections API; agentPreset state must be a string, null, or absent/,
  )
})

test('a malformed matching legacy selection event fails loud', async () => {
  const sessions = new Map([[
    'session-a',
    liveSession({
      creationPreset: 'header-preset',
      events: [{ type: 'agent-preset/selected', data: { agentPreset: 42 } }],
      modern: false,
    }),
  ]])
  const { service } = await boot({ sessions })

  assert.throws(
    () => service.snapshot('session-a'),
    /agent-preset\/selected agentPreset must be a string/,
  )
})

test('a malformed fallback header fails only when no selection event supplies the answer', async () => {
  const sessions = new Map([
    ['selected', { header: 42, events: [selected('event-wins')] }],
    ['header-only', { header: 42, events: [] }],
  ])
  const { service } = await boot({ sessions })

  assert.equal(service.snapshot('selected').presetId, 'event-wins')
  assert.throws(
    () => service.snapshot('header-only'),
    /header must be an object when log fallback is used/,
  )
})

test('a malformed present sessions or projection service fails loud', async () => {
  class BrokenSessions extends Service {
    constructor(ctx) {
      super(ctx, 'sessions')
    }
  }
  class BrokenProjections extends Service {
    constructor(ctx) {
      super(ctx, 'sessionProjections')
    }
  }

  const first = await boot()
  const sessionsFiber = first.ctx.plugin(BrokenSessions)
  await sessionsFiber
  assert.throws(() => first.service.snapshot('session-a'), /unsupported sessions API; expected get\(\)/)

  await sessionsFiber.dispose()
  const liveSessions = first.ctx.plugin(FakeSessions, new Map([['session-a', liveSession()]]))
  await liveSessions
  const projectionsFiber = first.ctx.plugin(BrokenProjections)
  await projectionsFiber
  assert.throws(
    () => first.service.snapshot('session-a'),
    /unsupported sessionProjections API; expected stateOf\(\)/,
  )
})

test('optional SessionStore attach and detach are observed without cached identity', async () => {
  const { ctx, service } = await boot()
  assert.equal(service.snapshot('session-a').status, 'unavailable')

  const sessions = new Map([['session-a', liveSession({ creationPreset: 'first' })]])
  const fiber = ctx.plugin(FakeSessions, sessions)
  await fiber
  assert.equal(service.snapshot('session-a').presetId, 'first')

  sessions.set('session-a', liveSession({ creationPreset: 'second' }))
  assert.equal(service.snapshot('session-a').presetId, 'second')

  await fiber.dispose()
  assert.equal(service.snapshot('session-a').status, 'unavailable')
})

test('M3B reads only identity and never invokes composition-affecting APIs', async () => {
  let reads = 0
  const session = liveSession({ creationPreset: 'stable' })
  const sessions = new Map([['session-a', session]])
  const { ctx, service } = await boot({ sessions })

  class SentinelAgentPresets extends Service {
    constructor(owner) {
      super(owner, 'agentPresets')
    }
    mount() { throw new Error('M3B must not mount presets') }
    recompose() { throw new Error('M3B must not recompose presets') }
    select() { throw new Error('M3B must not select presets') }
    list() { reads += 1; throw new Error('M3B must not read the roster') }
  }

  const sentinelFiber = ctx.plugin(SentinelAgentPresets)
  await sentinelFiber

  assert.equal(service.snapshot('session-a').presetId, 'stable')
  assert.equal(reads, 0)
})

test('returned identity snapshots are immutable', async () => {
  const sessions = new Map([['session-a', liveSession({ creationPreset: 'stable' })]])
  const { service } = await boot({ sessions })
  const snapshot = service.snapshot('session-a')

  assert.equal(Object.isFrozen(snapshot), true)
  assert.throws(() => { snapshot.presetId = 'changed' }, TypeError)
})
