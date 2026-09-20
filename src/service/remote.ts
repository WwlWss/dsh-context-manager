import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'

export const CONTEXT_MANAGER_REMOTE_API_VERSION = 1

/** Stable browser-facing protocol metadata for the Context Manager Remote surface. */
export interface ContextManagerRemoteProtocol {
  readonly apiVersion: number
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    dshContextRemote: ContextManagerRemoteService
  }
}

/**
 * M6A Host Remote owner.
 *
 * This service is deliberately transport-only. Domain/runtime authority stays
 * in the existing Context Manager Host services; later M6 slices project those
 * services into JSON-safe Remote DTOs here rather than moving business logic
 * into the browser boundary.
 */
export class ContextManagerRemoteService extends TypertRemoteService {
  constructor(ctx: Context) {
    super(ctx, 'dshContextRemote', { namespace: 'contextManager' })
  }

  /** Return the version of the Context Manager wire contract. */
  @Remote
  protocol(): ContextManagerRemoteProtocol {
    return Object.freeze({ apiVersion: CONTEXT_MANAGER_REMOTE_API_VERSION })
  }
}
