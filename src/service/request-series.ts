import { Service, type Context } from '@deepseek-ai/cordis'

import {
  attachAgentRuntimeBridge,
  type AgentRuntimeBridge,
  type RuntimeAgent,
} from '../adapters/agent-runtime.js'

declare module '@deepseek-ai/cordis' {
  interface Context {
    dshContextRequestSeries: ContextManagerRequestSeries
  }
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

/**
 * Process-local owner for one-shot native request-series fences.
 *
 * The service is intentionally independent of Context Manager profile/Skill
 * capabilities. Runtime contributors register small guards while active; when
 * one unregisters after having admitted model-visible state, the service keeps
 * one pending fence so the next real request lets DSH reconcile its own
 * in-history system-prompt surface without Context Manager writing Session
 * events directly.
 */
export class ContextManagerRequestSeries extends Service {
  private bridge?: AgentRuntimeBridge
  private readonly entries = new Map<RuntimeAgent, SeriesEntry>()

  constructor(ctx: Context) {
    super(ctx, 'dshContextRequestSeries')

    ctx.inject(['agents'], async (runtimeCtx) => {
      await runtimeCtx.effect(async () => {
        const bridge = await attachAgentRuntimeBridge(
          runtimeCtx,
          agent => {
            const entry: SeriesEntry = {
              guards: new Set(),
              forceNext: false,
            }
            this.entries.set(agent, entry)

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

            return () => {
              stop()
              this.entries.delete(agent)
            }
          },
        )

        this.bridge = bridge
        return async () => {
          if (this.bridge === bridge) this.bridge = undefined
          await bridge?.dispose()
        }
      }, 'dshContextRequestSeries.lifecycle()')
    })
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
    const entry = this.entries.get(agent)
    if (entry === undefined) {
      throw new TypeError(
        'dsh-context-manager: request-series coordinator unavailable for live Agent',
      )
    }

    entry.guards.add(guard)
    let active = true
    return () => {
      if (!active) return
      active = false
      entry.guards.delete(guard)
      if (retire()) entry.forceNext = true
    }
  }
}
