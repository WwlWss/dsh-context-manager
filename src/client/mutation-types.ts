import type {
  ContextManagerRemoteErrorCode,
  ContextManagerRemoteProfileInput,
  ContextManagerRemotePromptBinding,
  ContextManagerRemotePromptPlacement,
  ContextManagerRemoteSkillMode,
} from '../remote/types.js'

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
    }
  | {
      readonly kind: 'precondition'
      readonly code:
        | 'busy'
        | 'profile-revision-unavailable'
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
  | { readonly status: 'detached' | 'disposed' | 'incompatible' }

export type ContextManagerClientProfileMutationOperation =
  | { readonly status: 'idle' }
  | {
      readonly status: 'running'
      readonly id: number
      readonly kind: ContextManagerClientProfileMutationKind
      readonly phase: 'mutating' | 'rehydrating'
      readonly expectedRevision: number
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
  createProfile(id: string, input: ContextManagerRemoteProfileInput): Promise<ContextManagerClientProfileMutationResult>
  deleteProfile(id: string): Promise<ContextManagerClientProfileMutationResult>
  setDefaultProfile(id: string | null): Promise<ContextManagerClientProfileMutationResult>
  setProfileName(profileId: string, name: string): Promise<ContextManagerClientProfileMutationResult>
  setProfileDescription(profileId: string, description: string | null): Promise<ContextManagerClientProfileMutationResult>
  setProfileBasePreset(profileId: string, basePreset: string): Promise<ContextManagerClientProfileMutationResult>
  setSkillMode(profileId: string, skillName: string, mode: ContextManagerRemoteSkillMode): Promise<ContextManagerClientProfileMutationResult>
  removeSkillBinding(profileId: string, skillName: string): Promise<ContextManagerClientProfileMutationResult>
  addPromptBinding(profileId: string, bindingId: string, input: ContextManagerRemotePromptBinding): Promise<ContextManagerClientProfileMutationResult>
  setPromptBindingResourceId(profileId: string, bindingId: string, resourceId: string): Promise<ContextManagerClientProfileMutationResult>
  setPromptBindingEnabled(profileId: string, bindingId: string, enabled: boolean): Promise<ContextManagerClientProfileMutationResult>
  setPromptBindingPlacement(profileId: string, bindingId: string, placement: ContextManagerRemotePromptPlacement): Promise<ContextManagerClientProfileMutationResult>
  setPromptBindingOrder(profileId: string, bindingId: string, order: number): Promise<ContextManagerClientProfileMutationResult>
  removePromptBinding(profileId: string, bindingId: string): Promise<ContextManagerClientProfileMutationResult>
}
