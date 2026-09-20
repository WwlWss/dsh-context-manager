import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'

export const CONTEXT_MANAGER_REMOTE_API_VERSION = 1 as const

declare module '@deepseek-ai/cordis' {
  interface Context {
    dshContextRemote: ContextManagerRemoteController
  }
}

/**
 * M6A Host Remote owner.
 *
 * This deliberately exposes only the protocol handshake. Profile/resource
 * writes and runtime diagnostics belong to M6B/M6C after the generated Typert
 * boundary is proven across every retained DSH generation.
 */
export class ContextManagerRemoteController extends TypertRemoteService {
  constructor(ctx: Context) {
    super(ctx, 'dshContextRemote', { namespace: 'contextManager' })
  }

  /**
   * Small, side-effect-free capability handshake used to prove the strict
   * generated Remote path without coupling M6A to later browser state models.
   */
  @Remote('protocol')
  protocol(): {
    readonly apiVersion: number
    readonly transport: 'typert'
    readonly strict: true
  } {
    return Object.freeze({
      apiVersion: CONTEXT_MANAGER_REMOTE_API_VERSION,
      transport: 'typert',
      strict: true,
    })
  }
}
