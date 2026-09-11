import type { Context } from '@deepseek-ai/cordis'

/**
 * Effective AgentPreset identity recorded by one currently live DSH Session.
 *
 * This read model is deliberately Session-scoped rather than Profile-scoped:
 * a profile's configured base preset and a Session's recorded composition are
 * independent facts until a later binding milestone explicitly joins them.
 */
export type SessionPresetIdentity =
  | {
      readonly status: 'unavailable'
      readonly sessionId: string
    }
  | {
      readonly status: 'not-live'
      readonly sessionId: string
    }
  | {
      readonly status: 'known'
      readonly sessionId: string
      readonly presetId: string | null
    }

interface HostSession {
  readonly [key: string]: unknown
}

interface HostSessionEvent {
  readonly type?: unknown
  readonly data?: unknown
}

interface SessionsCapability {
  get(id: string): unknown
}

interface SessionProjectionsCapability {
  stateOf(session: HostSession, key: 'agentPreset'): unknown
}

function unsupportedSessionsApi(message: string): Error {
  return new Error(`dsh-context-manager: unsupported sessions API; ${message}`)
}

function unsupportedProjectionApi(message: string): Error {
  return new Error(`dsh-context-manager: unsupported sessionProjections API; ${message}`)
}

function unsupportedSessionShape(message: string): Error {
  return new Error(`dsh-context-manager: unsupported Session shape; ${message}`)
}

function getSessionsCapability(ctx: Context): SessionsCapability | undefined {
  const capability = ctx.get('sessions') as unknown
  if (capability === undefined) return undefined
  if (typeof capability !== 'object' || capability === null) {
    throw unsupportedSessionsApi('service value must be an object')
  }
  const candidate = capability as Record<string, unknown>
  if (typeof candidate.list !== 'function') {
    throw unsupportedSessionsApi('expected get()')
  }
  return capability as SessionsCapability
}

function getSessionProjectionsCapability(ctx: Context): SessionProjectionsCapability | undefined {
  const capability = ctx.get('sessionProjections') as unknown
  if (capability === undefined) return undefined
  if (typeof capability !== 'object' || capability === null) {
    throw unsupportedProjectionApi('service value must be an object')
  }
  const candidate = capability as Record<string, unknown>
  if (typeof candidate.stateOf !== 'function') {
    throw unsupportedProjectionApi('expected stateOf()')
  }
  return capability as SessionProjectionsCapability
}

function readProjectedPreset(
  projections: SessionProjectionsCapability | undefined,
  session: HostSession,
): string | null | undefined {
  if (projections === undefined) return undefined
  const value = projections.stateOf(session, 'agentPreset')
  if (value === undefined) return undefined
  if (value === null || typeof value === 'string') return value
  throw unsupportedProjectionApi('agentPreset state must be a string, null, or absent')
}

function readSessionEvents(session: HostSession): readonly HostSessionEvent[] {
  const snapshotEvents = session.snapshotEvents
  let raw: unknown
  if (snapshotEvents === undefined) {
    raw = session.events
  } else {
    if (typeof snapshotEvents !== 'function') {
      throw unsupportedSessionShape('snapshotEvents must be a function when used')
    }
    raw = snapshotEvents.call(session)
  }

  if (!Array.isArray(raw)) {
    throw unsupportedSessionShape('expected snapshotEvents() or events to provide an array')
  }
  return raw as readonly HostSessionEvent[]
}

function readCreationPreset(session: HostSession): string | null {
  const header = session.header
  if (typeof header !== 'object' || header === null || Array.isArray(header)) {
    throw unsupportedSessionShape('header must be an object when log fallback is used')
  }
  const creationPreset = (header as Record<string, unknown>).agentPreset
  if (creationPreset === undefined) return null
  if (typeof creationPreset !== 'string') {
    throw unsupportedSessionShape('header.agentPreset must be a string when present')
  }
  return creationPreset
}

function resolveRecordedPreset(session: HostSession): string | null {
  const events = readSessionEvents(session)
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (typeof event !== 'object' || event === null) continue
    if (event.type !== 'agent-preset/selected') continue

    if (typeof event.data !== 'object' || event.data === null || Array.isArray(event.data)) {
      throw unsupportedSessionShape(
        `events[${String(index)}] agent-preset/selected data must be an object`,
      )
    }
    const preset = (event.data as Record<string, unknown>).agentPreset
    if (typeof preset !== 'string') {
      throw unsupportedSessionShape(
        `events[${String(index)}] agent-preset/selected agentPreset must be a string`,
      )
    }
    return preset
  }

  return readCreationPreset(session)
}

/**
 * Observe one live Session without opening persistence or changing composition.
 *
 * Current DSH lines expose `agentPreset` as Session projection state. When the
 * projection key is genuinely absent, the adapter falls back to the older
 * public Session log representation: newest `agent-preset/selected` wins over
 * the immutable creation header. Validation is path-local: fallback-only
 * fields are inspected only when that fallback is actually needed. A malformed
 * present capability fails loud; it is never disguised as capability absence.
 */
export function observeSessionPresetIdentity(
  ctx: Context,
  sessionId: string,
): SessionPresetIdentity {
  const sessions = getSessionsCapability(ctx)
  if (sessions === undefined) {
    return Object.freeze({ status: 'unavailable', sessionId })
  }

  const found = sessions.get(sessionId)
  if (found === undefined) {
    return Object.freeze({ status: 'not-live', sessionId })
  }
  if (typeof found !== 'object' || found === null) {
    throw unsupportedSessionShape('live session must be an object')
  }

  const session = found as HostSession
  const projected = readProjectedPreset(getSessionProjectionsCapability(ctx), session)
  const presetId = projected === undefined ? resolveRecordedPreset(session) : projected

  return Object.freeze({
    status: 'known',
    sessionId,
    presetId,
  })
}
