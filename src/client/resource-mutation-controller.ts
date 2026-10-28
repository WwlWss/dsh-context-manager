import {
  createSnapshotStore,
  type SnapshotStore,
} from '@deepseek-ai/dsh-client-store'
import type { RemoteFailure, RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type {
  ContextManagerRemoteError,
  ContextManagerRemoteResult,
  ContextManagerRemoteMutationReceipt,
  ContextManagerRemoteDeleteReceipt,
  ContextManagerRemoteResourceCreateBasis,
  ContextManagerRemoteResourceMutationBasis,
} from '../remote/types.js'
import type { ContextManagerClientPromptResourceReadStamp } from './model-types.js'
import type { ContextManagerClientResourceMutationRemote } from './remote-port.js'
import type {
  ContextManagerClientResourceCreateBasis,
  ContextManagerClientResourceMutationError,
  ContextManagerClientResourceMutationKind,
  ContextManagerClientResourceMutationResult,
  ContextManagerClientResourceMutationSnapshot,
  ContextManagerClientResourceMutations,
} from './resource-mutation-types.js'
import type { ContextManagerClientMutationTransportError } from './mutation-types.js'

type Lifecycle = 'attached' | 'detached' | 'disposed'
type ProtocolStatus = 'unchecked' | 'checking' | 'compatible' | 'incompatible' | 'error'
type MutationResponse = ContextManagerRemoteMutationReceipt | ContextManagerRemoteDeleteReceipt
type Invocation =
  | { readonly kind: 'success' }
  | { readonly kind: 'business'; readonly error: ContextManagerRemoteError }
  | { readonly kind: 'transport'; readonly error: ContextManagerClientMutationTransportError }

export interface ContextManagerResourceRecoveryRequest {
  readonly id: string
  readonly kind: ContextManagerClientResourceMutationKind
  readonly resourceAuthorityId: string
  readonly refreshDocument: boolean
}

export interface ContextManagerResourceMutationControllerDeps {
  readonly getRemote: () => ContextManagerClientResourceMutationRemote | undefined
  readonly getLifecycle: () => Lifecycle
  readonly getProtocolStatus: () => ProtocolStatus
  readonly getCurrentCreateBasis: () => ContextManagerClientResourceCreateBasis | undefined
  readonly getCurrentReadStamp: (
    id: string,
    source: 'list' | 'document',
  ) => ContextManagerClientPromptResourceReadStamp | undefined
  /** Revoke stale keyed-read publication before write dispatch and before recovery. */
  readonly invalidate: (id: string) => void
  /** Must prove actual fresh surfaces, not merely lazy-read status=completed. */
  readonly rehydrate: (request: ContextManagerResourceRecoveryRequest) => Promise<boolean>
  readonly isDocumentCached: (id: string) => boolean
}

export interface ContextManagerClientResourceMutationController extends ContextManagerClientResourceMutations {
  readonly state: SnapshotStore<ContextManagerClientResourceMutationSnapshot>
}

export interface ContextManagerClientResourceMutationControllerHandle {
  readonly controller: ContextManagerClientResourceMutationController
  readonly reset: () => void
  readonly observeResourceAuthority: (id: string | null) => void
}

function sameHostBasis(
  a: ContextManagerClientPromptResourceReadStamp,
  b: ContextManagerClientPromptResourceReadStamp,
): boolean {
  return a.resourceAuthorityId === b.resourceAuthorityId
    && a.resourceId === b.resourceId
    && a.incarnationId === b.incarnationId
    && a.revision === b.revision
}

function validAuthority(id: unknown): id is string {
  return typeof id === 'string' && id.length > 0
}

function validStamp(stamp: ContextManagerClientPromptResourceReadStamp): boolean {
  return validAuthority(stamp?.resourceAuthorityId)
    && typeof stamp.resourceId === 'string'
    && stamp.resourceId.length > 0
    && (stamp.incarnationId === null || (typeof stamp.incarnationId === 'string' && stamp.incarnationId.length > 0))
    && Number.isSafeInteger(stamp.revision)
    && stamp.revision >= 1
    && (stamp.source === 'list' || stamp.source === 'document')
}

function errorResult(
  code: Extract<ContextManagerClientResourceMutationError, { kind: 'precondition' }>['code'],
  message: string,
): ContextManagerClientResourceMutationResult {
  return { status: 'rejected', refresh: 'not-requested', error: { kind: 'precondition', code, message } }
}

function transportError(error: RemoteFailure): ContextManagerClientMutationTransportError {
  return { kind: 'remote', code: String(error.code), message: error.message }
}

function callError(error: unknown): ContextManagerClientMutationTransportError {
  return { kind: 'call-rejected', message: error instanceof Error ? error.message : 'Remote mutation call rejected' }
}

async function invoke(call: () => Promise<RemoteResult<ContextManagerRemoteResult<MutationResponse>>>): Promise<Invocation> {
  try {
    const outer = await call()
    if (!outer.ok) return { kind: 'transport', error: transportError(outer.error) }
    if (!outer.value.ok) return { kind: 'business', error: outer.value.error }
    return { kind: 'success' }
  } catch (error) {
    return { kind: 'transport', error: callError(error) }
  }
}

/** This is an operation state machine, not another authoritative Resource cache. */
export function createContextManagerResourceMutationController(
  deps: ContextManagerResourceMutationControllerDeps,
): ContextManagerClientResourceMutationControllerHandle {
  const state = createSnapshotStore<ContextManagerClientResourceMutationSnapshot>({ resource: { status: 'idle' } })
  let epoch = 0
  let nextId = 0
  let activeId: number | undefined
  let knownAuthority: string | null | undefined

  const reset = (): void => {
    epoch += 1
    activeId = undefined
    knownAuthority = undefined
    state.set({ resource: { status: 'idle' } })
  }

  const observeResourceAuthority = (id: string | null): void => {
    if (knownAuthority === undefined) {
      knownAuthority = id
      return
    }
    if (knownAuthority === id) return
    epoch += 1
    activeId = undefined
    knownAuthority = id
    state.set({ resource: { status: 'idle' } })
  }

  const current = (e: number, id: number): boolean => epoch === e && activeId === id
  const lifecycleResult = (): ContextManagerClientResourceMutationResult | undefined => {
    const lifecycle = deps.getLifecycle()
    if (lifecycle === 'disposed') return { status: 'disposed' }
    if (lifecycle === 'detached') return { status: 'detached' }
    if (deps.getProtocolStatus() === 'incompatible') return { status: 'incompatible' }
    return undefined
  }
  const obsolete = (): ContextManagerClientResourceMutationResult => lifecycleResult() ?? { status: 'superseded' }

  const settle = (
    e: number,
    id: number,
    kind: ContextManagerClientResourceMutationKind,
    result: ContextManagerClientResourceMutationResult,
  ): ContextManagerClientResourceMutationResult => {
    if (!current(e, id)) return obsolete()
    activeId = undefined
    state.set({ resource: { status: 'settled', id, kind, result } })
    return e === epoch ? result : obsolete()
  }

  const check = (
    basis: ContextManagerClientResourceCreateBasis,
    stamp?: ContextManagerClientPromptResourceReadStamp,
    skipBusy = false,
  ): ContextManagerClientResourceMutationResult | undefined => {
    const lifecycle = lifecycleResult()
    if (lifecycle !== undefined) return lifecycle
    if (!skipBusy && activeId !== undefined) return errorResult('busy', 'A Resource mutation is already in progress')
    if (deps.getProtocolStatus() !== 'compatible') {
      return errorResult('protocol-unavailable', 'A compatible Remote v3 protocol is required')
    }
    if (!validAuthority(basis?.resourceAuthorityId) || (stamp !== undefined && !validStamp(stamp))) {
      return errorResult('invalid-resource-basis', 'The captured Resource basis is malformed')
    }
    const latest = deps.getCurrentCreateBasis()
    if (!latest) return errorResult('resource-authority-unavailable', 'Fresh Resource authority observation is unavailable')
    if (knownAuthority !== undefined && knownAuthority !== latest.resourceAuthorityId) {
      return errorResult('resource-authority-unavailable', 'Resource authority observations are inconsistent')
    }
    if (latest.resourceAuthorityId !== basis.resourceAuthorityId) {
      return errorResult('resource-basis-stale', 'The Resource storage source changed')
    }
    if (stamp !== undefined) {
      const observed = deps.getCurrentReadStamp(stamp.resourceId, stamp.source)
      if (!observed) return errorResult('resource-basis-unavailable', 'Current Resource read observation is unavailable')
      if (!sameHostBasis(observed, stamp)) {
        return errorResult('resource-basis-stale', 'Resource identity or revision changed since draft creation')
      }
    }
    return undefined
  }

  const run = async (
    kind: ContextManagerClientResourceMutationKind,
    basis: ContextManagerClientResourceCreateBasis,
    id: string,
    stamp: ContextManagerClientPromptResourceReadStamp | undefined,
    call: (remote: ContextManagerClientResourceMutationRemote) => Promise<RemoteResult<ContextManagerRemoteResult<MutationResponse>>>,
  ): Promise<ContextManagerClientResourceMutationResult> => {
    const frozenBasis = stamp === undefined
      ? Object.freeze({ resourceAuthorityId: basis.resourceAuthorityId })
      : Object.freeze({ ...stamp })
    const blocked = check(frozenBasis, stamp === undefined ? undefined : frozenBasis as ContextManagerClientPromptResourceReadStamp)
    if (blocked !== undefined) return blocked
    const remote = deps.getRemote()
    if (remote === undefined) return { status: 'detached' }
    const idNumber = ++nextId
    const operationEpoch = epoch
    activeId = idNumber
    const stillOwns = () => current(operationEpoch, idNumber)
    const preCallStamp = stamp === undefined ? undefined : frozenBasis as ContextManagerClientPromptResourceReadStamp
    const recheck = (): ContextManagerClientResourceMutationResult | undefined => {
      if (!stillOwns()) return obsolete()
      // Distinguish a real detach/disposal from attachment supersession.
      const lifetime = lifecycleResult()
      if (lifetime !== undefined) return lifetime
      if (deps.getRemote() !== remote) return { status: 'superseded' }
      return check(frozenBasis, preCallStamp, true)
    }
    state.set({ resource: { status: 'running', id: idNumber, kind, phase: 'mutating' } })
    const initial = recheck()
    if (initial !== undefined) return settle(operationEpoch, idNumber, kind, initial)

    // Fence already-started lazy reads before sending any mutation RPC.
    deps.invalidate(id)
    // Invalidation intentionally makes the source stamp stale. Do not require
    // freshness *again* after invalidation; only recheck lifecycle/authority.
    if (!stillOwns()) return obsolete()
    const afterFence = lifecycleResult()
    if (afterFence !== undefined) return settle(operationEpoch, idNumber, kind, afterFence)
    if (deps.getRemote() !== remote || deps.getProtocolStatus() !== 'compatible') {
      return settle(operationEpoch, idNumber, kind, { status: 'superseded' })
    }
    const currentAuthority = deps.getCurrentCreateBasis()
    if (currentAuthority?.resourceAuthorityId !== frozenBasis.resourceAuthorityId) {
      return settle(operationEpoch, idNumber, kind, errorResult('resource-authority-unavailable', 'Resource authority changed before dispatch'))
    }
    const outcome = await invoke(() => call(remote))
    if (!stillOwns()) return obsolete()

    const shouldRecover = outcome.kind !== 'business' || [
      'prompt-resource-conflict',
      'prompt-resource-authority-conflict',
      'prompt-resource-incarnation-conflict',
      'prompt-resource-not-found',
      'prompt-resource-exists',
    ].includes(outcome.error.code)
    if (!shouldRecover) {
      return settle(operationEpoch, idNumber, kind, {
        status: 'rejected',
        refresh: 'not-requested',
        error: { kind: 'business', code: outcome.error.code, message: outcome.error.message },
      })
    }
    state.set({ resource: { status: 'running', id: idNumber, kind, phase: 'rehydrating' } })
    if (!stillOwns()) return obsolete()
    let fresh = false
    try {
      deps.invalidate(id)
      if (!stillOwns()) return obsolete()
      fresh = await deps.rehydrate({
        id, kind, resourceAuthorityId: frozenBasis.resourceAuthorityId,
        refreshDocument: kind === 'replace-prompt-resource'
          || kind === 'set-prompt-resource-content'
          || (kind !== 'create-prompt-resource' && kind !== 'delete-prompt-resource' && deps.isDocumentCached(id)),
      })
    } catch {
      fresh = false
    }
    if (!stillOwns()) return obsolete()
    const refresh = fresh ? 'fresh' : 'degraded'
    if (outcome.kind === 'success') return settle(operationEpoch, idNumber, kind, { status: 'applied', refresh })
    if (outcome.kind === 'transport') return settle(operationEpoch, idNumber, kind, { status: 'unknown', error: outcome.error, refresh })
    return settle(operationEpoch, idNumber, kind, {
      status: 'rejected', refresh,
      error: {
        kind: 'business', code: outcome.error.code, message: outcome.error.message,
        ...(outcome.error.expectedRevision === undefined ? {} : { expectedRevision: outcome.error.expectedRevision }),
        ...(outcome.error.actualRevision === undefined ? {} : { actualRevision: outcome.error.actualRevision }),
      },
    })
  }

  const wire = (stamp: ContextManagerClientPromptResourceReadStamp): ContextManagerRemoteResourceMutationBasis => ({
    resourceAuthorityId: stamp.resourceAuthorityId,
    resourceId: stamp.resourceId,
    incarnationId: stamp.incarnationId,
    revision: stamp.revision,
  })
  const createWire = (basis: ContextManagerClientResourceCreateBasis): ContextManagerRemoteResourceCreateBasis => ({
    resourceAuthorityId: basis.resourceAuthorityId,
  })

  const controller: ContextManagerClientResourceMutationController = {
    state,
    createPromptResource: (basis, id, input) => {
      // The synchronous call owns an immutable wire basis even if a store
      // subscriber mutates its editable draft object before Remote dispatch.
      const captured = Object.freeze({ resourceAuthorityId: basis?.resourceAuthorityId })
      const capturedInput = Object.freeze({ ...input })
      return run('create-prompt-resource', captured, id, undefined,
        remote => remote.createPromptResource(id, capturedInput, createWire(captured)))
    },
    replacePromptResource: (stamp, input) => {
      const captured = Object.freeze({ ...stamp })
      const capturedInput = Object.freeze({ ...input })
      return run('replace-prompt-resource', captured, captured.resourceId, captured,
        remote => remote.replacePromptResource(captured.resourceId, capturedInput, wire(captured)))
    },
    deletePromptResource: stamp => {
      const captured = Object.freeze({ ...stamp })
      return run('delete-prompt-resource', captured, captured.resourceId, captured,
        remote => remote.deletePromptResource(captured.resourceId, wire(captured)))
    },
    setPromptResourceName: (stamp, name) => {
      const captured = Object.freeze({ ...stamp })
      return run('set-prompt-resource-name', captured, captured.resourceId, captured,
        remote => remote.setPromptResourceName(captured.resourceId, name, wire(captured)))
    },
    setPromptResourceDescription: (stamp, description) => {
      const captured = Object.freeze({ ...stamp })
      return run('set-prompt-resource-description', captured, captured.resourceId, captured,
        remote => remote.setPromptResourceDescription(captured.resourceId, description, wire(captured)))
    },
    setPromptResourceContent: (stamp, content) => {
      const captured = Object.freeze({ ...stamp })
      return run('set-prompt-resource-content', captured, captured.resourceId, captured,
        remote => remote.setPromptResourceContent(captured.resourceId, content, wire(captured)))
    },
  }
  Object.freeze(controller)
  return Object.freeze({ controller, reset, observeResourceAuthority })
}
