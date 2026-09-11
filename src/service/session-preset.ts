import { Service, type Context } from '@deepseek-ai/cordis'

import {
  observeSessionPresetIdentity,
  type SessionPresetIdentity,
} from '../adapters/session-preset.js'

declare module '@deepseek-ai/cordis' {
  interface Context {
    dshContextSessionPreset: ContextManagerSessionPreset
  }
}

/**
 * Read-only Host service for the AgentPreset identity recorded by a live DSH
 * Session.
 *
 * The service deliberately does not depend on Session persistence, resume
 * machinery, AgentPreset discovery, or Context Manager profile storage. DSH
 * owns Session creation/resume and composition; M3B only observes the live
 * Session after those lifecycle operations have published it.
 */
export class ContextManagerSessionPreset extends Service {
  private readonly ownerCtx: Context

  constructor(ctx: Context) {
    super(ctx, 'dshContextSessionPreset')
    this.ownerCtx = ctx
  }

  snapshot(sessionId: string): SessionPresetIdentity {
    return observeSessionPresetIdentity(this.ownerCtx, sessionId)
  }
}
