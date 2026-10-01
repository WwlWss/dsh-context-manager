import {
  createSnapshotStore,
  type SnapshotStore,
} from '@deepseek-ai/dsh-client-store'
import type { RemoteFailure, RemoteResult } from '@deepseek-ai/dsh-typert-protocol'

import type {
  ContextManagerRemoteError,
  ContextManagerRemoteProfilesSnapshot,
  ContextManagerRemoteResult,
} from '../remote/types.js'
import type {
  ContextManagerClientMutationError,
  ContextManagerClientMutationSnapshot,
  ContextManagerClientMutationTransportError,
  ContextManagerClientProfileMutationKind,
  ContextManagerClientProfileMutationResult,
  ContextManagerClientProfileMutations,
} from './mutation-types.js'
import type { ContextManagerClientProfileMutationRemote } from './remote-port.js'

type Lifecycle = 'attached' | 'detached' | 'disposed'
type ProtocolStatus = 'unchecked' | 'checking' | 'compatible' | 'incompatible' | 'error'

type MutationInvokeOutcome =
  | { readonly kind: 'success' }
  | { readonly kind: 'business-failure'; readonly error: ContextManagerRemoteError }
  | { readonly kind: 'transport-failure'; readonly error: ContextManagerClientMutationTransportError }

interface ContextManagerProfileMutationControllerDeps {
  readonly getRemote: () => ContextManagerClientProfileMutationRemote | undefined
  readonly getLifecycle: () => Lifecycle
  readonly getProtocolStatus: () => ProtocolStatus
  readonly getProfileRevision: () => number | undefined
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

  const settle = (
    operationEpoch: number,
    id: number,
    kind: ContextManagerClientProfileMutationKind,
    result: ContextManagerClientProfileMutationResult,
  ): void => {
    if (!isOperationCurrent(operationEpoch, id)) return
    activeOperationId = undefined
    state.set({ profile: { status: 'settled', id, kind, result } })
  }

  const publishPrecondition = (
    kind: ContextManagerClientProfileMutationKind,
    result: ContextManagerClientProfileMutationResult,
  ): void => {
    nextOperationId += 1
    state.set({ profile: { status: 'settled', id: nextOperationId, kind, result } })
  }

  const lifecycleResult = (): ContextManagerClientProfileMutationResult | undefined => {
    const lifecycle = deps.getLifecycle()
    if (lifecycle === 'disposed') return { status: 'disposed' }
    if (lifecycle === 'detached') return { status: 'detached' }
    if (deps.getProtocolStatus() === 'incompatible') return { status: 'incompatible' }
    return undefined
  }

  const recover = async (
    operationEpoch: number,
    id: number,
    kind: ContextManagerClientProfileMutationKind,
    expectedRevision: number,
  ): Promise<'fresh' | 'degraded'> => {
    if (!isOperationCurrent(operationEpoch, id)) return 'degraded'
    state.set({
      profile: {
        status: 'running',
        id,
        kind,
        phase: 'rehydrating',
        expectedRevision,
      },
    })
    if (!isOperationCurrent(operationEpoch, id)) return 'degraded'
    try {
      const fresh = await deps.rehydrate()
      return isOperationCurrent(operationEpoch, id) && fresh ? 'fresh' : 'degraded'
    } catch {
      return 'degraded'
    }
  }

  const precondition = (
    kind: ContextManagerClientProfileMutationKind,
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
      publishPrecondition(kind, result)
      return result
    }

    return undefined
  }

  const run = async (
    kind: ContextManagerClientProfileMutationKind,
    call: (
      remote: ContextManagerClientProfileMutationRemote,
      expectedRevision: number,
    ) => Promise<
      RemoteResult<ContextManagerRemoteResult<ContextManagerRemoteProfilesSnapshot>>
    >,
  ): Promise<ContextManagerClientProfileMutationResult> => {
    const blocked = precondition(kind)
    if (blocked !== undefined) return blocked

    const expectedRevision = deps.getProfileRevision()
    if (expectedRevision === undefined) {
      const result: ContextManagerClientProfileMutationResult = {
        status: 'rejected',
        refresh: 'not-requested',
        error: {
          kind: 'precondition',
          code: 'profile-revision-unavailable',
          message: 'A fresh authoritative profile revision is required before mutation',
        },
      }
      publishPrecondition(kind, result)
      return result
    }

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
        expectedRevision,
      },
    })

    if (!isOperationCurrent(operationEpoch, id)) {
      return lifecycleResult() ?? {
        status: 'rejected',
        refresh: 'not-requested',
        error: {
          kind: 'precondition',
          code: 'profile-revision-unavailable',
          message: 'Profile authority changed before the mutation started',
        },
      }
    }

    const afterPublicationLifecycle = lifecycleResult()
    if (afterPublicationLifecycle !== undefined) {
      activeOperationId = undefined
      return afterPublicationLifecycle
    }
    if (
      deps.getProtocolStatus() !== 'compatible'
      || deps.getProfileRevision() !== expectedRevision
      || deps.getRemote() !== remote
    ) {
      activeOperationId = undefined
      return {
        status: 'rejected',
        refresh: 'not-requested',
        error: {
          kind: 'precondition',
          code: 'profile-revision-unavailable',
          message: 'Profile authority changed before the mutation started',
        },
      }
    }

    const outcome = await invokeMutation(() => call(remote, expectedRevision))

    if (outcome.kind === 'success') {
      const refresh = await recover(operationEpoch, id, kind, expectedRevision)
      const result: ContextManagerClientProfileMutationResult = { status: 'applied', refresh }
      settle(operationEpoch, id, kind, result)
      return result
    }

    if (outcome.kind === 'business-failure') {
      if (outcome.error.code === 'profile-conflict') {
        const refresh = await recover(operationEpoch, id, kind, expectedRevision)
        const result: ContextManagerClientProfileMutationResult = {
          status: 'rejected',
          error: businessError(outcome.error),
          refresh,
        }
        settle(operationEpoch, id, kind, result)
        return result
      }

      const result: ContextManagerClientProfileMutationResult = {
        status: 'rejected',
        error: businessError(outcome.error),
        refresh: 'not-requested',
      }
      settle(operationEpoch, id, kind, result)
      return result
    }

    const refresh = await recover(operationEpoch, id, kind, expectedRevision)
    const result: ContextManagerClientProfileMutationResult = {
      status: 'unknown',
      error: outcome.error,
      refresh,
    }
    settle(operationEpoch, id, kind, result)
    return result
  }

  const controller: ContextManagerClientMutationController = Object.freeze({
    state,
    createProfile: (id, input) => run('create-profile', (remote, revision) => remote.createProfile(id, input, revision)),
    deleteProfile: id => run('delete-profile', (remote, revision) => remote.deleteProfile(id, revision)),
    setDefaultProfile: id => run('set-default-profile', (remote, revision) => remote.setDefaultProfile(id, revision)),
    setProfileName: (profileId, name) => run('set-profile-name', (remote, revision) => remote.setProfileName(profileId, name, revision)),
    setProfileDescription: (profileId, description) => run('set-profile-description', (remote, revision) => remote.setProfileDescription(profileId, description, revision)),
    setProfileBasePreset: (profileId, basePreset) => run('set-profile-base-preset', (remote, revision) => remote.setProfileBasePreset(profileId, basePreset, revision)),
    setSkillMode: (profileId, skillName, mode) => run('set-skill-mode', (remote, revision) => remote.setSkillMode(profileId, skillName, mode, revision)),
    removeSkillBinding: (profileId, skillName) => run('remove-skill-binding', (remote, revision) => remote.removeSkillBinding(profileId, skillName, revision)),
    addPromptBinding: (profileId, bindingId, input) => run('add-prompt-binding', (remote, revision) => remote.addPromptBinding(profileId, bindingId, input, revision)),
    setPromptBindingResourceId: (profileId, bindingId, resourceId) => run('set-prompt-binding-resource-id', (remote, revision) => remote.setPromptBindingResourceId(profileId, bindingId, resourceId, revision)),
    setPromptBindingEnabled: (profileId, bindingId, enabled) => run('set-prompt-binding-enabled', (remote, revision) => remote.setPromptBindingEnabled(profileId, bindingId, enabled, revision)),
    setPromptBindingPlacement: (profileId, bindingId, placement) => run('set-prompt-binding-placement', (remote, revision) => remote.setPromptBindingPlacement(profileId, bindingId, placement, revision)),
    setPromptBindingOrder: (profileId, bindingId, order) => run('set-prompt-binding-order', (remote, revision) => remote.setPromptBindingOrder(profileId, bindingId, order, revision)),
    removePromptBinding: (profileId, bindingId) => run('remove-prompt-binding', (remote, revision) => remote.removePromptBinding(profileId, bindingId, revision)),
  })

  return Object.freeze({ controller, reset })
}
