import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'

export const CONTEXT_MANAGER_REMOTE_API_VERSION = 1 as const

declare module '@deepseek-ai/cordis' {
  interface Context {
    dshContextRemote: ContextManagerRemoteController
  }
}

type ProtocolMethod = ContextManagerRemoteController['protocol']
type ProtocolInitializer = (this: ContextManagerRemoteController) => void

/**
 * Install the public Typert Remote marker without leaving decorator syntax in
 * the standalone package's runtime bundle.
 *
 * The disposable generation fixture adds the equivalent @Remote annotation
 * back to its source copy so the official Typert compiler still owns strict
 * descriptor/schema generation. At runtime we invoke the same public decorator
 * function and execute the initializer it supplies when each Service instance
 * is constructed.
 */
function createProtocolRemoteInitializer(): ProtocolInitializer {
  let initializer: ProtocolInitializer | undefined
  const decorator = Remote('protocol') as (
    method: ProtocolMethod,
    context: ClassMethodDecoratorContext<ContextManagerRemoteController, ProtocolMethod>,
  ) => void

  decorator(
    ContextManagerRemoteController.prototype.protocol,
    {
      kind: 'method',
      name: 'protocol',
      static: false,
      private: false,
      access: {
        has: (object: ContextManagerRemoteController) => 'protocol' in object,
        get: (object: ContextManagerRemoteController) => object.protocol,
      },
      addInitializer(value: ProtocolInitializer) {
        if (initializer !== undefined) {
          throw new TypeError('dsh-context-manager: Typert Remote decorator registered duplicate initializers')
        }
        initializer = value
      },
      metadata: undefined,
    } as unknown as ClassMethodDecoratorContext<ContextManagerRemoteController, ProtocolMethod>,
  )

  if (initializer === undefined) {
    throw new TypeError('dsh-context-manager: Typert Remote decorator did not provide an initializer')
  }
  return initializer
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
    PROTOCOL_REMOTE_INITIALIZER.call(this)
  }

  /**
   * Small, side-effect-free capability handshake used to prove the strict
   * generated Remote path without coupling M6A to later browser state models.
   */
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

const PROTOCOL_REMOTE_INITIALIZER = createProtocolRemoteInitializer()
