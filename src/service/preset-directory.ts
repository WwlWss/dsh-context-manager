import { Service, type Context } from '@deepseek-ai/cordis'

import {
  buildPresetSnapshot,
  buildUnavailablePresetSnapshot,
  getAgentPresetsCapability,
  observeAgentPresets,
  type ContextManagerPresetSnapshot,
} from '../adapters/agent-presets.js'

declare module '@deepseek-ai/cordis' {
  interface Context {
    dshContextPresetDirectory: ContextManagerPresetDirectory
  }
}

/**
 * Read-only Host service that joins Context Manager profile intent to DSH's
 * current native AgentPreset roster.
 *
 * M3A deliberately does not mount, recompose, copy, remove, or otherwise
 * mutate a preset. Each snapshot performs at most one native list() call and
 * keeps no cross-snapshot roster cache.
 */
export class ContextManagerPresetDirectory extends Service {
  static inject = ['dshContextManager']

  private readonly ownerCtx: Context

  constructor(ctx: Context) {
    super(ctx, 'dshContextPresetDirectory')
    this.ownerCtx = ctx
  }

  async snapshot(): Promise<ContextManagerPresetSnapshot> {
    const domain = this.ownerCtx.dshContextManager.snapshot()
    const agentPresets = getAgentPresetsCapability(this.ownerCtx)

    if (agentPresets === undefined) {
      return buildUnavailablePresetSnapshot(domain)
    }

    // Settings and preset discovery do not share one transaction, so this is
    // authoritative best-effort state rather than an atomic cross-subsystem
    // snapshot. observeAgentPresets() reads list() exactly once and validates
    // only the minimum Host contract M3A actually consumes.
    const observation = await observeAgentPresets(agentPresets)
    return buildPresetSnapshot(domain, observation)
  }
}
