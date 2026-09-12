import assert from 'node:assert/strict'

import { Context, Service } from '@deepseek-ai/cordis'
import { Session, SessionId } from '@deepseek-ai/dsh-session'

import { ContextManagerSessionPresetIdentity } from '../lib/index.js'

const agentPresetModule = await import('@deepseek-ai/dsh-agent-presets')

class NativeSessionSeat extends Service {
  constructor(ctx, session) {
    super(ctx, 'sessions')
    this.session = session
  }

  get(id) {
    return id === this.session.id ? this.session : undefined
  }
}

const ctx = new Context()
const session = Session.create(SessionId('m3b-upstream-runtime'))
session.append('agent-preset/selected', { agentPreset: 'native-selected' })

const seatFiber = ctx.plugin(NativeSessionSeat, session)
await seatFiber

let projectionFiber
let projectionRegistration
if ('agentPresetProjectionDefinition' in agentPresetModule) {
  const { SessionProjectionRegistry } = await import('@deepseek-ai/dsh-session-projection')
  projectionFiber = ctx.plugin(SessionProjectionRegistry)
  await projectionFiber
  projectionRegistration = ctx.sessionProjections.register(
    agentPresetModule.agentPresetProjectionDefinition,
  )
}

const serviceFiber = ctx.plugin(ContextManagerSessionPresetIdentity)
await serviceFiber

const result = ctx.dshContextSessionPresetIdentity.snapshot(session.id)
assert.deepEqual(result, {
  status: 'known',
  sessionId: session.id,
  presetId: 'native-selected',
})

if ('agentPresetProjectionDefinition' in agentPresetModule) {
  assert.equal(
    ctx.sessionProjections.stateOf(session, 'agentPreset'),
    'native-selected',
    'current-generation smoke must execute the native agentPreset projection',
  )
} else {
  assert.ok(
    Array.isArray(session.events),
    'legacy-generation smoke must expose the native Session.events fallback',
  )
  assert.equal(
    session.events.findLast(event => event.type === 'agent-preset/selected')?.data.agentPreset,
    'native-selected',
  )
}

projectionRegistration?.()
await serviceFiber.dispose()
if (projectionFiber !== undefined) await projectionFiber.dispose()
await seatFiber.dispose()
