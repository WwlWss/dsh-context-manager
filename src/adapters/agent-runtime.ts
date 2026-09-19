import type { Context } from '@deepseek-ai/cordis'

export interface RuntimeAgent {
  readonly id: string
  readonly ctx: Context
}

interface AgentsCapability {
  get(id: string): unknown
  list(): readonly unknown[]
}

interface AgentLifecycleContext {
  on(
    event: 'agent/created' | 'agent/disposed',
    listener: (payload: unknown) => void | Promise<void>,
  ): () => void
}

export type AgentRuntimeCleanup = () => void | Promise<void>

function unsupportedAgentsApi(detail: string): TypeError {
  return new TypeError(`dsh-context-manager: unsupported agents API; ${detail}`)
}

function unsupportedAgentShape(detail: string): TypeError {
  return new TypeError(`dsh-context-manager: unsupported Agent shape; ${detail}`)
}

function agentsCapability(ctx: Context): AgentsCapability | undefined {
  const raw = ctx.get('agents') as unknown
  if (raw === undefined) return undefined
  if (typeof raw !== 'object' || raw === null) {
    throw unsupportedAgentsApi('service value must be an object')
  }

  const candidate = raw as Record<string, unknown>
  if (typeof candidate.get !== 'function') {
    throw unsupportedAgentsApi('expected get()')
  }
  if (typeof candidate.list !== 'function') {
    throw unsupportedAgentsApi('expected list()')
  }
  return raw as AgentsCapability
}

function runtimeAgent(raw: unknown, label: string): RuntimeAgent {
  if (typeof raw !== 'object' || raw === null) {
    throw unsupportedAgentShape(`${label} must be an object`)
  }

  const candidate = raw as Record<string, unknown>
  if (typeof candidate.id !== 'string') {
    throw unsupportedAgentShape(`${label}.id must be a string`)
  }
  if (typeof candidate.ctx !== 'object' || candidate.ctx === null) {
    throw unsupportedAgentShape(`${label}.ctx must be a Context-like object`)
  }

  const agentCtx = candidate.ctx as Record<string, unknown>
  if (
    typeof agentCtx.get !== 'function'
    || typeof agentCtx.effect !== 'function'
    || typeof agentCtx.on !== 'function'
  ) {
    throw unsupportedAgentShape(
      `${label}.ctx must expose get(), effect(), and on()`,
    )
  }

  return raw as RuntimeAgent
}

function lifecycleAgent(payload: unknown, event: 'agent/created' | 'agent/disposed'): RuntimeAgent {
  if (typeof payload !== 'object' || payload === null) {
    throw unsupportedAgentShape(`${event} payload must be an object`)
  }
  const rawAgent = (payload as Record<string, unknown>).agent
  return runtimeAgent(rawAgent, `${event} payload.agent`)
}

async function cleanupAll(cleanups: readonly AgentRuntimeCleanup[]): Promise<void> {
  const failures: unknown[] = []
  for (const cleanup of [...cleanups].reverse()) {
    try {
      await cleanup()
    } catch (error) {
      failures.push(error)
    }
  }
  if (failures.length === 1) throw failures[0]
  if (failures.length > 1) {
    throw new AggregateError(failures, 'failed to clean Context Manager Agent runtime')
  }
}

export interface AgentRuntimeBridge {
  readonly agents: ReadonlyMap<RuntimeAgent, AgentRuntimeCleanup>
  dispose(): Promise<void>
}

/**
 * Attach one runtime owner to every currently live Agent and every Agent
 * created later. Attachments are keyed by exact Agent object identity.
 *
 * Initial adoption is transactional: if one existing Agent fails to attach,
 * every earlier attachment from this bridge is cleaned before the failure is
 * propagated.
 */
export async function attachAgentRuntimeBridge(
  ctx: Context,
  attach: (agent: RuntimeAgent) => AgentRuntimeCleanup | Promise<AgentRuntimeCleanup>,
): Promise<AgentRuntimeBridge | undefined> {
  const agents = agentsCapability(ctx)
  if (agents === undefined) return undefined

  const attached = new Map<RuntimeAgent, AgentRuntimeCleanup>()
  let disposed = false

  const attachOne = async (agent: RuntimeAgent): Promise<void> => {
    if (disposed || attached.has(agent)) return
    const cleanup = await attach(agent)
    if (disposed) {
      await cleanup()
      return
    }
    attached.set(agent, cleanup)
  }

  let stopCreated: (() => void) | undefined
  let stopDisposed: (() => void) | undefined
  try {
    const lifecycle = ctx as unknown as AgentLifecycleContext
    stopCreated = lifecycle.on(
      'agent/created',
      async payload => {
        await attachOne(lifecycleAgent(payload, 'agent/created'))
      },
    )
    stopDisposed = lifecycle.on(
      'agent/disposed',
      payload => {
        // DSH disposes the Agent scope before publishing agent/disposed. The
        // scoped registrations are already gone; remove only our process-local
        // bookkeeping so a dead Agent cannot remain inspectable/retained.
        attached.delete(lifecycleAgent(payload, 'agent/disposed'))
      },
    )

    const live = agents.list()
    if (!Array.isArray(live)) {
      throw unsupportedAgentsApi('list() must return an array')
    }
    for (let index = 0; index < live.length; index += 1) {
      await attachOne(runtimeAgent(live[index], `list()[${String(index)}]`))
    }
  } catch (error) {
    disposed = true
    try {
      stopCreated?.()
      stopDisposed?.()
    } finally {
      const cleanups = [...attached.values()]
      attached.clear()
      try {
        await cleanupAll(cleanups)
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          'failed to attach Context Manager Agent runtime and roll back',
        )
      }
    }
    throw error
  }

  return Object.freeze({
    get agents(): ReadonlyMap<RuntimeAgent, AgentRuntimeCleanup> {
      return attached
    },
    async dispose(): Promise<void> {
      if (disposed) return
      disposed = true
      stopCreated?.()
      stopDisposed?.()
      const cleanups = [...attached.values()]
      attached.clear()
      await cleanupAll(cleanups)
    },
  })
}
