import type {
  ContextManagerRemoteErrorCode,
  ContextManagerRemoteProfileInput,
  ContextManagerRemotePromptBinding,
  ContextManagerRemotePromptPlacement,
  ContextManagerRemoteSkillMode,
} from '../remote/types.js'

export interface ContextManagerClientProfileMutationBasis {
  readonly instanceId: string
  readonly revision: number
}

export type ContextManagerClientProfileMutationKind =
  | 'create-profile'
  | 'delete-profile'
  | 'set-default-profile'
  | 'set-profile-name'
  | 'set-profile-description'
  | 'set-profile-base-preset'
  | 'set-skill-mode'
  | 'remove-skill-binding'
  | 'add-prompt-binding'
  | 'set-prompt-binding-resource-id'
  | 'set-prompt-binding-enabled'
  | 'set-prompt-binding-placement'
  | 'set-prompt-binding-order'
  | 'remove-prompt-binding'

export type ContextManagerClientMutationRefresh = 'not-requested' | 'fresh' | 'degraded'

export type ContextManagerClientMutationTransportError =
  | { readonly kind: 'remote'; readonly code: string; readonly message: string }
  | { readonly kind: 'call-rejected'; readonly message: string }

export type ContextManagerClientMutationError =
  | {
      readonly kind: 'business'
      readonly code: ContextManagerRemoteErrorCode
      readonly message: string
      readonly expectedRevision?: number
      readonly actualRevision?: number
      readonly expectedInstanceId?: string
      readonly actualInstanceId?: string
    }
  | {
      readonly kind: 'precondition'
      readonly code:
        | 'busy'
        | 'profile-basis-unavailable'
        | 'profile-basis-stale'
        | 'protocol-unavailable'
      readonly message: string
    }

export type ContextManagerClientProfileMutationResult =
  | { readonly status: 'applied'; readonly refresh: 'fresh' | 'degraded' }
  | {
      readonly status: 'rejected'
      readonly error: ContextManagerClientMutationError
      readonly refresh: ContextManagerClientMutationRefresh
    }
  | {
      readonly status: 'unknown'
      readonly error: ContextManagerClientMutationTransportError
      readonly refresh: 'fresh' | 'degraded'
    }
  | { readonly status: 'detached' | 'disposed' | 'incompatible' | 'superseded' }

export type ContextManagerClientProfileMutationOperation =
  | { readonly status: 'idle' }
  | {
      readonly status: 'running'
      readonly id: number
      readonly kind: ContextManagerClientProfileMutationKind
      readonly phase: 'mutating' | 'rehydrating'
      readonly basis: ContextManagerClientProfileMutationBasis
    }
  | {
      readonly status: 'settled'
      readonly id: number
      readonly kind: ContextManagerClientProfileMutationKind
      readonly result: ContextManagerClientProfileMutationResult
    }

export interface ContextManagerClientMutationSnapshot {
  readonly profile: ContextManagerClientProfileMutationOperation
}

export interface ContextManagerClientProfileMutations {
  createProfile(
    basis: ContextManagerClientProfileMutationBasis,
    id: string,
    input: ContextManagerRemoteProfileInput,
  ): Promise<ContextManagerClientProfileMutationResult>
  deleteProfile(
    basis: ContextManagerClientProfileMutationBasis,
    id: string,
  ): Promise<ContextManagerClientProfileMutationResult>
  setDefaultProfile(
    basis: ContextManagerClientProfileMutationBasis,
    id: string | null,
  ): Promise<ContextManagerClientProfileMutationResult>
  setProfileName(
    basis: ContextManagerClientProfileMutationBasis,
    profileId: string,
    name: string,
  ): Promise<ContextManagerClientProfileMutationResult>
  setProfileDescription(
    basis: ContextManagerClientProfileMutationBasis,
    profileId: string,
    description: string | null,
  ): Promise<ContextManagerClientProfileMutationResult>
  setProfileBasePreset(
    basis: ContextManagerClientProfileMutationBasis,
    profileId: string,
    basePreset: string,
  ): Promise<ContextManagerClientProfileMutationResult>
  setSkillMode(
    basis: ContextManagerClientProfileMutationBasis,
    profileId: string,
    skillName: string,
    mode: ContextManagerRemoteSkillMode,
  ): Promise<ContextManagerClientProfileMutationResult>
  removeSkillBinding(
    basis: ContextManagerClientProfileMutationBasis,
    profileId: string,
    skillName: string,
  ): Promise<ContextManagerClientProfileMutationResult>
  addPromptBinding(
    basis: ContextManagerClientProfileMutationBasis,
    profileId: string,
    bindingId: string,
    input: ContextManagerRemotePromptBinding,
  ): Promise<ContextManagerClientProfileMutationResult>
  setPromptBindingResourceId(
    basis: ContextManagerClientProfileMutationBasis,
    profileId: string,
    bindingId: string,
    resourceId: string,
  ): Promise<ContextManagerClientProfileMutationResult>
  setPromptBindingEnabled(
    basis: ContextManagerClientProfileMutationBasis,
    profileId: string,
    bindingId: string,
    enabled: boolean,
  ): Promise<ContextManagerClientProfileMutationResult>
  setPromptBindingPlacement(
    basis: ContextManagerClientProfileMutationBasis,
    profileId: string,
    bindingId: string,
    placement: ContextManagerRemotePromptPlacement,
  ): Promise<ContextManagerClientProfileMutationResult>
  setPromptBindingOrder(
    basis: ContextManagerClientProfileMutationBasis,
    profileId: string,
    bindingId: string,
    order: number,
  ): Promise<ContextManagerClientProfileMutationResult>
  removePromptBinding(
    basis: ContextManagerClientProfileMutationBasis,
    profileId: string,
    bindingId: string,
  ): Promise<ContextManagerClientProfileMutationResult>
}
