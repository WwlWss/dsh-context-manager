import { Service, type Context } from '@deepseek-ai/cordis'

import type { RuntimeAgent } from '../adapters/agent-runtime.js'

declare module '@deepseek-ai/cordis' {
  interface Context {
    dshContextRequestSeries: ContextManagerRequestSeries
  }
}

interface AgentLifecycleContext {
  on(
    event: 'agent/disposed',
    listener: (payload: unknown) => void,
  ): () => void
}

interface PreStepContext {
  on(
    event: 'agent/pre-step',
    listener: (
      request: unknown,
      next: () => Promise<unknown>,
    ) => Promise<unknown> | unknown,
  ): () => void
}

interface SeriesEntry {
  readonly guards: Set<() => boolean>
  readonly stop: () => void
  forceNext: boolean
}

function isEnterDecision(value: unknown): value is {
  readonly kind: 'enter'
  readonly messages: unknown[]
  readonly startsRequestSeries?: true
} {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return candidate.kind === 'enter' && Array.isArray(candidate.messages)
}

function lifecycleAgent(payload: unknown): RuntimeAgent | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined
  const agent = (payload as Record<string, unknown>).agent
  if (typeof agent !== 'object' || agent === null) return undefined
  const candidate = agent as Record<string, unknown>
  if (typeof candidate.id !== 'string') return undefined
  if (typeof candidate.ctx !== 'object' || candidate.ctx === null) return undefined
  return agent as RuntimeAgent
}

/**
 * Process-local owner for one-shot native request-series fences.
 *
 * The service deliberately owns no prompt, Skill, or Session content. A
 * contributor registers a small guard while active. If that contributor
 * disappears after it had admitted model-visible state, one pending fence can
 * outlive the contributor until the Agent's next real pre-step. DSH then
 * reconciles its own in-history system-prompt nodes without Context Manager
 * writing Session surface events directly.
 */
export class ContextManagerRequestSeries extends Service {
  private readonly entries = new Map<RuntimeAgent, SeriesEntry>()

  constructor(ctx: Context) {
    super(ctx, 'dshContextRequestSeries')

    ctx.effect(() => {
      const lifecycle = ctx as unknown as AgentLifecycleContext
      const stopDisposed = lifecycle.on('agent/disposed', (payload: unknown) => {
        const agent = lifecycleAgent(payload)
        if (agent === undefined) return
        this.drop(agent)
      })
      return () => {
        stopDisposed()
        for (const agent of [...this.entries.keys()]) this.drop(agent)
      }
    }, 'dshContextRequestSeries.lifecycle()')
  }

  private ensure(agent: RuntimeAgent): SeriesEntry {
    const existing = this.entries.get(agent)
    if (existing !== undefined) return existing

    const entry = {
      guards: new Set<() => boolean>(),
      forceNext: false,
      stop: () => {},
    } as SeriesEntry

    const stop = (agent.ctx as unknown as PreStepContext).on(
      'agent/pre-step',
      async (_request, next) => {
        const decision = await next()
        if (!isEnterDecision(decision)) return decision

        let force = entry.forceNext
        entry.forceNext = false
        for (const guard of entry.guards) {
          if (guard()) force = true
        }

        if (!force || decision.startsRequestSeries === true) return decision
        return {
          ...decision,
          startsRequestSeries: true as const,
        }
      },
    )

    const installed: SeriesEntry = {
      guards: entry.guards,
      forceNext: false,
      stop,
    }
    // The listener closes over `entry`, so keep one mutable object rather
    // than replacing it after installation.
    Object.assign(entry, installed)
    this.entries.set(agent, entry)
    return entry
  }

  private drop(agent: RuntimeAgent): void {
    const entry = this.entries.get(agent)
    if (entry === undefined) return
    this.entries.delete(agent)
    entry.stop()
  }

  /**
   * Register one Agent-local request-series guard.
   *
   * The retire callback runs exactly once on unregister. Returning true leaves
   * a one-shot fence behind after the contributor itself has disappeared.
   */
  register(
    agent: RuntimeAgent,
    guard: () => boolean,
    retire: () => boolean,
  ): () => void {
    const entry = this.ensure(agent)
    entry.guards.add(guard)

    let active = true
    return () => {
      if (!active) return
      active = false
      entry.guards.delete(guard)
      if (retire()) entry.forceNext = true
      // Keep an empty entry while a one-shot fence is pending. Otherwise no
      // contributor needs this Agent listener anymore.
      if (entry.guards.size === 0 && !entry.forceNext) this.drop(agent)
    }
  }
}
