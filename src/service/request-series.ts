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
    options?: { readonly prepend?: boolean },
  ): () => void
}

interface SessionEventContext {
  on(
    event: 'session/event',
    listener: (session: unknown, event: unknown) => void,
  ): () => void
}

interface RequestSeriesContributor {
  readonly guard: () => boolean
  readonly commit: () => void
  readonly retire: () => boolean
}

interface PendingAdmission {
  readonly forceRevision: number
  readonly commits: readonly (() => void)[]
}

interface SeriesEntry {
  readonly contributors: Set<RequestSeriesContributor>
  readonly stop: () => void
  forceRevision: number
  admittedForceRevision: number
  pendingAdmission?: PendingAdmission
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

function isRequestHeaderEvent(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false
  return (value as Record<string, unknown>).type === 'request/header'
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

function forceEntry(entry: SeriesEntry): void {
  entry.forceRevision += 1
}

/**
 * Process-local owner for one-shot native request-series fences.
 *
 * A pre-step enter is only a proposal: DSH still resolves agent/request and
 * prepareCall before committing model-visible prompt state. The coordinator
 * therefore records a pending boundary at pre-step and consumes it only after
 * the same Agent publishes a durable request/header Session event.
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

      // Host registry/domain change notifications are intentionally not
      // converted into request-series fences here. They are unfiltered and do
      // not prove that this Agent's model-visible CM contribution changed.
      // Contributor fingerprints own steady-state reconciliation; force() is
      // reserved for attach/resume and retirement cleanup.
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
      contributors: new Set<RequestSeriesContributor>(),
      forceRevision: 0,
      admittedForceRevision: 0,
      stop: () => {},
    } as SeriesEntry

    // Prepend so this wrapper observes the final downstream pre-step decision.
    // It still does not call a proposal "admitted": only request/header below
    // advances contributor baselines or consumes a pending force revision.
    const stopPreStep = (agent.ctx as unknown as PreStepContext).on(
      'agent/pre-step',
      async (_request, next) => {
        const decision = await next()
        if (!isEnterDecision(decision)) return decision
        if (decision.messages.length === 0) return decision

        const contributors = [...entry.contributors]
        let force = entry.forceRevision > entry.admittedForceRevision
        for (const contributor of contributors) {
          if (contributor.guard()) force = true
        }
        if (!force) return decision

        entry.pendingAdmission = Object.freeze({
          forceRevision: entry.forceRevision,
          commits: Object.freeze(contributors.map(contributor => contributor.commit)),
        })

        return decision.startsRequestSeries === true
          ? decision
          : {
              ...decision,
              startsRequestSeries: true as const,
            }
      },
      { prepend: true },
    )

    const stopSession = (agent.ctx as unknown as SessionEventContext).on(
      'session/event',
      (_session, event) => {
        if (!isRequestHeaderEvent(event)) return
        const pending = entry.pendingAdmission
        if (pending === undefined) return

        entry.pendingAdmission = undefined
        entry.admittedForceRevision = Math.max(
          entry.admittedForceRevision,
          pending.forceRevision,
        )
        for (const commit of pending.commits) commit()

        if (
          entry.contributors.size === 0
          && entry.forceRevision <= entry.admittedForceRevision
        ) {
          this.drop(agent)
        }
      },
    )

    const installed: SeriesEntry = {
      contributors: entry.contributors,
      forceRevision: 0,
      admittedForceRevision: 0,
      stop: () => {
        stopSession()
        stopPreStep()
      },
    }
    // Both listeners close over entry, so retain one mutable identity.
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
   * Force one live Agent's next admitted request to start a native request
   * series. Rejected/empty pre-steps and failures before request/header do not
   * consume the boundary.
   */
  force(agent: RuntimeAgent): void {
    forceEntry(this.ensure(agent))
  }

  /**
   * Register one Agent-local request-series contributor.
   *
   * guard() is evaluated after downstream pre-step listeners accept a non-empty
   * proposal. commit() runs only after DSH durably publishes request/header for
   * that fenced request. retire() runs exactly once on unregister; returning
   * true leaves a later one-shot fence after the contributor disappears.
   */
  register(
    agent: RuntimeAgent,
    guard: () => boolean,
    commit: () => void,
    retire: () => boolean,
  ): () => void {
    const entry = this.ensure(agent)
    const contributor = Object.freeze({ guard, commit, retire })
    entry.contributors.add(contributor)

    let active = true
    return () => {
      if (!active) return
      active = false
      entry.contributors.delete(contributor)
      if (retire()) forceEntry(entry)

      // A force created after a proposal was prepared must survive that
      // proposal's later request/header acknowledgement. The revision captured
      // in PendingAdmission makes this exact instead of clearing a boolean.
      if (
        entry.contributors.size === 0
        && entry.forceRevision <= entry.admittedForceRevision
      ) {
        this.drop(agent)
      }
    }
  }
}
