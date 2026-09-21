import { randomUUID } from 'node:crypto'
import { Service, type Context } from '@deepseek-ai/cordis'

export interface ContextManagerChangeSnapshot {
  readonly instanceId: string
  readonly generation: number
  readonly profiles: number
  readonly promptResources: number
  readonly presets: number
  readonly runtime: number
}

interface ContextManagerChangeEvents {
  on(event: 'dsh-context-manager/change', listener: () => void): () => void
  on(event: 'settings/document-updated', listener: (ns: string, revision: number) => void): () => void
  on(event: 'agent/created' | 'agent/disposed', listener: (...args: unknown[]) => void): () => void
  on(event: 'agent-preset/selected', listener: (...args: unknown[]) => void): () => void
  on(event: 'skills/change' | 'system-prompt/change', listener: () => void): () => void
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    dshContextChanges: ContextManagerChangeTracker
  }
}

/**
 * Best-effort invalidation cursors for browser pulls.
 *
 * These counters are intentionally not persistence revisions and are never
 * valid write fences. They only tell a Client that one authoritative Remote
 * read may be stale and should be pulled again.
 */
export class ContextManagerChangeTracker extends Service {
  private readonly instanceId = randomUUID()
  private generation = 0
  private profiles = 0
  private promptResources = 0
  private presets = 0
  private runtime = 0

  constructor(ctx: Context) {
    super(ctx, 'dshContextChanges')

    const events = ctx as unknown as ContextManagerChangeEvents

    events.on('dsh-context-manager/change', () => {
      this.bump({ profiles: true, presets: true, runtime: true })
    })

    events.on('settings/document-updated', (ns) => {
      if (ns === 'agent-presets') this.bump({ presets: true })
    })

    events.on('agent/created', () => {
      this.bump({ runtime: true })
    })
    events.on('agent/disposed', () => {
      this.bump({ runtime: true })
    })
    events.on('agent-preset/selected', () => {
      this.bump({ runtime: true })
    })
    events.on('skills/change', () => {
      this.bump({ runtime: true })
    })
    events.on('system-prompt/change', () => {
      this.bump({ runtime: true })
    })
  }

  snapshot(): ContextManagerChangeSnapshot {
    return Object.freeze({
      instanceId: this.instanceId,
      generation: this.generation,
      profiles: this.profiles,
      promptResources: this.promptResources,
      presets: this.presets,
      runtime: this.runtime,
    })
  }

  markPromptResources(): void {
    this.bump({ promptResources: true, runtime: true })
  }

  markPresets(): void {
    this.bump({ presets: true })
  }

  markRuntime(): void {
    this.bump({ runtime: true })
  }

  private bump(channels: {
    readonly profiles?: boolean
    readonly promptResources?: boolean
    readonly presets?: boolean
    readonly runtime?: boolean
  }): void {
    this.generation += 1
    if (channels.profiles === true) this.profiles += 1
    if (channels.promptResources === true) this.promptResources += 1
    if (channels.presets === true) this.presets += 1
    if (channels.runtime === true) this.runtime += 1
  }
}
