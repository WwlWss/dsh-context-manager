import {
  createSnapshotStore,
  type SnapshotStore,
} from '@deepseek-ai/dsh-client-store'
import type { RemoteFailure, RemoteResult } from '@deepseek-ai/dsh-typert-protocol'

import type {
  ContextManagerRemoteError,
  ContextManagerRemoteProfileMutationBasis,
  ContextManagerRemoteProfilesSnapshot,
  ContextManagerRemoteResult,
} from '../remote/types.js'
import type {
  ContextManagerClientMutationError,
  ContextManagerClientMutationSnapshot,
  ContextManagerClientMutationTransportError,
  ContextManagerClientProfileMutationBasis,
  ContextManagerClientProfileMutationKind,
  ContextManagerClientProfileMutationResult,
  ContextManagerClientProfileMutations,
} from './mutation-types.js'
import type { ContextManagerClientProfileMutationRemote } from './remote-port.js'

type Lifecycle = 'attached' | 'detached' | 'disposed'
type ProtocolStatus = 'unchecked' | 'checking' | 'compatible' | 'incompatible' | 'error'
type RecoveryOutcome = 'fresh' | 'degraded' | 'superseded'

type MutationInvokeOutcome =
  | { readonly kind: 'success' }
  | { readonly kind: 'business-failure'; readonly error: ContextManagerRemoteError }
  | { readonly kind: 'transport-failure'; readonly error: ContextManagerClientMutationTransportError }

interface ContextManagerProfileMutationControllerDeps {
  readonly getRemote: () => ContextManagerClientProfileMutationRemote | undefined
  readonly getLifecycle: () => Lifecycle
  readonly getProtocolStatus: () => ProtocolStatus
  readonly getCurrentProfileMutationBasis: () => ContextManagerClientProfileMutationBasis | undefined
  readonly rehydrate: () => Promise<boolean>
}

export interface ContextManagerClientMutationController
  extends ContextManagerClientProfileMutations {
  readonly state: SnapshotStore<ContextManagerClientMutationSnapshot>
}

interface ContextManagerClientMutationControllerHandle {
  readonly controller: ContextManagerClientMutationController
  readonly reset: () => void
}

function initialSnapshot(): ContextManagerClientMutationSnapshot {
  return { profile: { status: 'idle' } }
}

function sameBasis(
  left: ContextManagerClientProfileMutationBasis | undefined,
  right: ContextManagerClientProfileMutationBasis,
): boolean {
  return (
    left !== undefined
    && left.instanceId === right.instanceId
    && left.revision === right.revision
  )
}

function wireBasis(
  basis: ContextManagerClientProfileMutationBasis,
): ContextManagerRemoteProfileMutationBasis {
  return {
    instanceId: basis.instanceId,
    revision: basis.revision,
  }
}

function remoteFailure(error: RemoteFailure): ContextManagerClientMutationTransportError {
  return { kind: 'remote', code: String(error.code), message: error.message }
}

function rejectedCall(error: unknown): ContextManagerClientMutationTransportError {
  return {
    kind: 'call-rejected',
    message: error instanceof Error ? error.message : 'Remote mutation call rejected',
  }
}

function businessError(error: ContextManagerRemoteError): ContextManagerClientMutationError {
  return {
    kind: 'business',
    code: error.code,
    message: error.message,
    ...(error.expectedRevision === undefined ? {} : { expectedRevision: error.expectedRevision }),
    ...(error.actualRevision === undefined ? {} : { actualRevision: error.actualRevision }),
    ...(error.expectedInstanceId === undefined ? {} : { expectedInstanceId: error.expectedInstanceId }),
    ...(error.actualInstanceId === undefined ? {} : { actualInstanceId: error.actualInstanceId }),
  }
}

async function invokeMutation(
  call: () => Promise<
    RemoteResult<ContextManagerRemoteResult<ContextManagerRemoteProfilesSnapshot>>
  >,
): Promise<MutationInvokeOutcome> {
  try {
    const transport = await call()
    if (!transport.ok) {
      return { kind: 'transport-failure', error: remoteFailure(transport.error) }
    }
    if (!transport.value.ok) {
      return { kind: 'business-failure', error: transport.value.error }
    }
    return { kind: 'success' }
  } catch (error) {
    return { kind: 'transport-failure', error: rejectedCall(error) }
  }
}

export function createContextManagerProfileMutationController(
  deps: ContextManagerProfileMutationControllerDeps,
): ContextManagerClientMutationControllerHandle {
  const state = createSnapshotStore<ContextManagerClientMutationSnapshot>(initialSnapshot())
  let epoch = 0
  let nextOperationId = 0
  let activeOperationId: number | undefined

  const reset = (): void => {
    epoch += 1
    activeOperationId = undefined
    state.set(initialSnapshot())
  }

  const isOperationCurrent = (operationEpoch: number, id: number): boolean => (
    epoch === operationEpoch && activeOperationId === id
  )

  const lifecycleResult = (): ContextManagerClientProfileMutationResult | undefined => {
    const lifecycle = deps.getLifecycle()
    if (lifecycle === 'disposed') return { status: 'disposed' }
    if (lifecycle === 'detached') return { status: 'detached' }
    if (deps.getProtocolStatus() === 'incompatible') return { status: 'incompatible' }
    return undefined
  }

  const staleLifecycleResult = (): ContextManagerClientProfileMutationResult => (
    lifecycleResult() ?? { status: 'superseded' }
  )

  const settle = (
    operationEpoch: number,
    id: number,
    kind: ContextManagerClientProfileMutationKind,
    result: ContextManagerClientProfileMutationResult,
  ): boolean => {
    if (!isOperationCurrent(operationEpoch, id)) return false
    activeOperationId = undefined
    state.set({ profile: { status: 'settled', id, kind, result } })
    return epoch === operationEpoch
  }

  const publishPrecondition = (
    kind: ContextManagerClientProfileMutationKind,
    result: ContextManagerClientProfileMutationResult,
  ): ContextManagerClientProfileMutationResult => {
    const publicationEpoch = epoch
    nextOperationId += 1
    state.set({ profile: { status: 'settled', id: nextOperationId, kind, result } })
    return epoch === publicationEpoch ? result : staleLifecycleResult()
  }

  const recover = async (
    operationEpoch: number,
    id: number,
    kind: ContextManagerClientProfileMutationKind,
    basis: ContextManagerClientProfileMutationBasis,
  ): Promise<RecoveryOutcome> => {
    if (!isOperationCurrent(operationEpoch, id)) return 'superseded'

    state.set({
      profile: {
        status: 'running',
        id,
        kind,
        phase: 'rehydrating',
        basis: operationBasis,
      },
    })
    if (!isOperationCurrent(operationEpoch, id)) return 'superseded'

    try {
      const fresh = await deps.rehydrate()
      if (!isOperationCurrent(operationEpoch, id)) return 'superseded'
      return fresh ? 'fresh' : 'degraded'
    } catch {
      if (!isOperationCurrent(operationEpoch, id)) return 'superseded'
      return 'degraded'
    }
  }

  const precondition = (
    kind: ContextManagerClientProfileMutationKind,
    basis: ContextManagerClientProfileMutationBasis,
  ): ContextManagerClientProfileMutationResult | undefined => {
    const lifecycle = lifecycleResult()
    if (lifecycle !== undefined) return lifecycle

    if (activeOperationId !== undefined) {
      return {
        status: 'rejected',
        refresh: 'not-requested',
        error: {
          kind: 'precondition',
          code: 'busy',
          message: 'A profile mutation is already in progress',
        },
      }
    }

    if (deps.getProtocolStatus() !== 'compatible') {
      const result: ContextManagerClientProfileMutationResult = {
        status: 'rejected',
        refresh: 'not-requested',
        error: {
          kind: 'precondition',
          code: 'protocol-unavailable',
          message: 'A compatible Host protocol is required before mutation',
        },
      }
      return publishPrecondition(kind, result)
    }

    const currentBasis = deps.getCurrentProfileMutationBasis()
    if (currentBasis === undefined) {
      const result: ContextManagerClientProfileMutationResult = {
        status: 'rejected',
        refresh: 'not-requested',
        error: {
          kind: 'precondition',
          code: 'profile-basis-unavailable',
          message: 'A fresh authoritative profile mutation basis is required',
        },
      }
      return publishPrecondition(kind, result)
    }

    if (!sameBasis(currentBasis, basis)) {
      const result: ContextManagerClientProfileMutationResult = {
        status: 'rejected',
        refresh: 'not-requested',
        error: {
          kind: 'precondition',
          code: 'profile-basis-stale',
          message: 'The profile mutation basis no longer matches authoritative state',
        },
      }
      return publishPrecondition(kind, result)
    }

    return undefined
  }

  const run = async (
    kind: ContextManagerClientProfileMutationKind,
    basis: ContextManagerClientProfileMutationBasis,
    call: (
      remote: ContextManagerClientProfileMutationRemote,
      basis: ContextManagerRemoteProfileMutationBasis,
    ) => Promise<
      RemoteResult<ContextManagerRemoteResult<ContextManagerRemoteProfilesSnapshot>>
    >,
  ): Promise<ContextManagerClientProfileMutationResult> => {
    const operationBasis = Object.freeze({
      instanceId: basis.instanceId,
      revision: basis.revision,
    })

    const blocked = precondition(kind, operationBasis)
    if (blocked !== undefined) return blocked

    const remote = deps.getRemote()
    if (remote === undefined) return { status: 'detached' }

    nextOperationId += 1
    const id = nextOperationId
    const operationEpoch = epoch
    activeOperationId = id
    state.set({
      profile: {
        status: 'running',
        id,
        kind,
        phase: 'mutating',
        basis,
      },
    })

    if (!isOperationCurrent(operationEpoch, id)) {
      return staleLifecycleResult()
    }

    const afterPublicationLifecycle = lifecycleResult()
    if (afterPublicationLifecycle !== undefined) {
      if (!settle(operationEpoch, id, kind, afterPublicationLifecycle)) {
        return staleLifecycleResult()
      }
      return afterPublicationLifecycle
    }

    if (deps.getProtocolStatus() !== 'compatible') {
      const result: ContextManagerClientProfileMutationResult = {
        status: 'rejected',
        refresh: 'not-requested',
        error: {
          kind: 'precondition',
          code: 'protocol-unavailable',
          message: 'A compatible Host protocol is required before mutation',
        },
      }
      if (!settle(operationEpoch, id, kind, result)) {
        return staleLifecycleResult()
      }
      return result
    }

    if (
      !sameBasis(deps.getCurrentProfileMutationBasis(), operationBasis)
      || deps.getRemote() !== remote
    ) {
      const result: ContextManagerClientProfileMutationResult = {
        status: 'rejected',
        refresh: 'not-requested',
        error: {
          kind: 'precondition',
          code: 'profile-basis-stale',
          message: 'Profile authority changed before the mutation started',
        },
      }
      if (!settle(operationEpoch, id, kind, result)) {
        return staleLifecycleResult()
      }
      return result
    }

    const outcome = await invokeMutation(() => call(remote, wireBasis(operationBasis)))

    if (!isOperationCurrent(operationEpoch, id)) {
      return staleLifecycleResult()
    }

    if (outcome.kind === 'success') {
      const refresh = await recover(operationEpoch, id, kind, operationBasis)
      if (refresh === 'superseded') return staleLifecycleResult()

      const result: ContextManagerClientProfileMutationResult = { status: 'applied', refresh }
      if (!settle(operationEpoch, id, kind, result)) {
        return staleLifecycleResult()
      }
      return result
    }

    if (outcome.kind === 'business-failure') {
      if (
        outcome.error.code === 'profile-conflict'
        || outcome.error.code === 'host-instance-conflict'
      ) {
        const refresh = await recover(operationEpoch, id, kind, operationBasis)
        if (refresh === 'superseded') return staleLifecycleResult()

        const result: ContextManagerClientProfileMutationResult = {
          status: 'rejected',
          error: businessError(outcome.error),
          refresh,
        }
        if (!settle(operationEpoch, id, kind, result)) {
          return staleLifecycleResult()
        }
        return result
      }

      const result: ContextManagerClientProfileMutationResult = {
        status: 'rejected',
        error: businessError(outcome.error),
        refresh: 'not-requested',
      }
      if (!settle(operationEpoch, id, kind, result)) {
        return staleLifecycleResult()
      }
      return result
    }

    const refresh = await recover(operationEpoch, id, kind, operationBasis)
    if (refresh === 'superseded') return staleLifecycleResult()

    const result: ContextManagerClientProfileMutationResult = {
      status: 'unknown',
      error: outcome.error,
      refresh,
    }
    if (!settle(operationEpoch, id, kind, result)) {
      return staleLifecycleResult()
    }
    return result
  }

  const controller: ContextManagerClientMutationController = {
    state,
    createProfile: (basis, id, input) => run('create-profile', basis, (remote, wire) => remote.createProfile(id, input, wire)),
    deleteProfile: (basis, id) => run('delete-profile', basis, (remote, wire) => remote.deleteProfile(id, wire)),
    setDefaultProfile: (basis, id) => run('set-default-profile', basis, (remote, wire) => remote.setDefaultProfile(id, wire)),
    setProfileName: (basis, profileId, name) => run('set-profile-name', basis, (remote, wire) => remote.setProfileName(profileId, name, wire)),
    setProfileDescription: (basis, profileId, description) => run('set-profile-description', basis, (remote, wire) => remote.setProfileDescription(profileId, description, wire)),
    setProfileBasePreset: (basis, profileId, basePreset) => run('set-profile-base-preset', basis, (remote, wire) => remote.setProfileBasePreset(profileId, basePreset, wire)),
    setSkillMode: (basis, profileId, skillName, mode) => run('set-skill-mode', basis, (remote, wire) => remote.setSkillMode(profileId, skillName, mode, wire)),
    removeSkillBinding: (basis, profileId, skillName) => run('remove-skill-binding', basis, (remote, wire) => remote.removeSkillBinding(profileId, skillName, wire)),
    addPromptBinding: (basis, profileId, bindingId, input) => run('add-prompt-binding', basis, (remote, wire) => remote.addPromptBinding(profileId, bindingId, input, wire)),
    setPromptBindingResourceId: (basis, profileId, bindingId, resourceId) => run('set-prompt-binding-resource-id', basis, (remote, wire) => remote.setPromptBindingResourceId(profileId, bindingId, resourceId, wire)),
    setPromptBindingEnabled: (basis, profileId, bindingId, enabled) => run('set-prompt-binding-enabled', basis, (remote, wire) => remote.setPromptBindingEnabled(profileId, bindingId, enabled, wire)),
    setPromptBindingPlacement: (basis, profileId, bindingId, placement) => run('set-prompt-binding-placement', basis, (remote, wire) => remote.setPromptBindingPlacement(profileId, bindingId, placement, wire)),
    setPromptBindingOrder: (basis, profileId, bindingId, order) => run('set-prompt-binding-order', basis, (remote, wire) => remote.setPromptBindingOrder(profileId, bindingId, order, wire)),
    removePromptBinding: (basis, profileId, bindingId) => run('remove-prompt-binding', basis, (remote, wire) => remote.removePromptBinding(profileId, bindingId, wire)),
  }
  Object.freeze(controller)

  return Object.freeze({ controller, reset })
}
