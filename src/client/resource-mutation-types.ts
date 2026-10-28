import type {
  ContextManagerRemoteErrorCode,
  ContextManagerRemotePromptResourceInput,
} from '../remote/types.js'
import type { ContextManagerClientPromptResourceReadStamp } from './model-types.js'
import type { ContextManagerClientMutationTransportError } from './mutation-types.js'

/** Create is fenced by the PromptLibrary source lifetime, independently of Profile Settings. */
export interface ContextManagerClientResourceCreateBasis {
  readonly resourceAuthorityId: string
}

export type ContextManagerClientResourceMutationKind =
  | 'create-prompt-resource'
  | 'replace-prompt-resource'
  | 'delete-prompt-resource'
  | 'set-prompt-resource-name'
  | 'set-prompt-resource-description'
  | 'set-prompt-resource-content'

export type ContextManagerClientResourceMutationError =
  | {
      readonly kind: 'business'
      readonly code: ContextManagerRemoteErrorCode
      readonly message: string
      readonly expectedRevision?: number
      readonly actualRevision?: number
    }
  | {
      readonly kind: 'precondition'
      readonly code:
        | 'busy'
        | 'protocol-unavailable'
        | 'resource-authority-unavailable'
        | 'resource-basis-unavailable'
        | 'resource-basis-stale'
        | 'invalid-resource-basis'
      readonly message: string
    }

export type ContextManagerClientResourceMutationRefresh = 'not-requested' | 'fresh' | 'degraded'
export type ContextManagerClientResourceMutationResult =
  | { readonly status: 'applied'; readonly refresh: 'fresh' | 'degraded' }
  | {
      readonly status: 'rejected'
      readonly error: ContextManagerClientResourceMutationError
      readonly refresh: ContextManagerClientResourceMutationRefresh
    }
  | {
      readonly status: 'unknown'
      readonly error: ContextManagerClientMutationTransportError
      readonly refresh: 'fresh' | 'degraded'
    }
  | { readonly status: 'detached' | 'disposed' | 'incompatible' | 'superseded' }

export type ContextManagerClientResourceMutationOperation =
  | { readonly status: 'idle' }
  | {
      readonly status: 'running'
      readonly id: number
      readonly kind: ContextManagerClientResourceMutationKind
      readonly phase: 'mutating' | 'rehydrating'
    }
  | {
      readonly status: 'settled'
      readonly id: number
      readonly kind: ContextManagerClientResourceMutationKind
      readonly result: ContextManagerClientResourceMutationResult
    }

export interface ContextManagerClientResourceMutationSnapshot {
  readonly resource: ContextManagerClientResourceMutationOperation
}

/** Stamp comes from draft creation, not from a new read at save time. */
export interface ContextManagerClientResourceMutations {
  createPromptResource(
    basis: ContextManagerClientResourceCreateBasis,
    id: string,
    input: ContextManagerRemotePromptResourceInput,
  ): Promise<ContextManagerClientResourceMutationResult>
  replacePromptResource(
    stamp: ContextManagerClientPromptResourceReadStamp,
    input: ContextManagerRemotePromptResourceInput,
  ): Promise<ContextManagerClientResourceMutationResult>
  deletePromptResource(
    stamp: ContextManagerClientPromptResourceReadStamp,
  ): Promise<ContextManagerClientResourceMutationResult>
  setPromptResourceName(
    stamp: ContextManagerClientPromptResourceReadStamp,
    name: string,
  ): Promise<ContextManagerClientResourceMutationResult>
  setPromptResourceDescription(
    stamp: ContextManagerClientPromptResourceReadStamp,
    description: string | null,
  ): Promise<ContextManagerClientResourceMutationResult>
  setPromptResourceContent(
    stamp: ContextManagerClientPromptResourceReadStamp,
    content: string,
  ): Promise<ContextManagerClientResourceMutationResult>
}
