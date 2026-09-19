import type { ContextProfile } from '../domain/model.js'

export type EffectiveProfileResolution =
  | {
      readonly status: 'no-default-profile'
    }
  | {
      readonly status: 'profile-unusable'
      readonly configuredProfileId?: string
      readonly reason:
        | 'schema-incompatible'
        | 'missing-default-profile'
        | 'invalid-default-profile'
    }
  | {
      readonly status: 'preset-identity-unavailable'
      readonly profileId: string
      readonly reason: 'session-store-unavailable' | 'session-not-live'
    }
  | {
      readonly status: 'base-preset-mismatch'
      readonly profileId: string
      readonly expectedPresetId: string
      readonly actualPresetId: string | null
    }
  | {
      readonly status: 'active'
      readonly profileId: string
      readonly profile: ContextProfile
      readonly presetId: string
    }


export type PromptBindingPlanState =
  | {
      readonly state: 'disabled'
      readonly bindingId: string
      readonly resourceId: string
      readonly placement: import('../domain/model.js').PromptPlacement
      readonly order: number
    }
  | {
      readonly state: 'missing-resource' | 'invalid-resource' | 'empty-content'
      readonly bindingId: string
      readonly resourceId: string
      readonly placement: import('../domain/model.js').PromptPlacement
      readonly order: number
      readonly message?: string
    }
  | {
      readonly state: 'eligible'
      readonly bindingId: string
      readonly resourceId: string
      readonly placement: import('../domain/model.js').PromptPlacement
      readonly order: number
      readonly content: string
      readonly resourceRevision: number
    }

export interface PromptPlan {
  readonly bindings: readonly Readonly<PromptBindingPlanState>[]
  readonly eligible: readonly Readonly<Extract<PromptBindingPlanState, { state: 'eligible' }>>[]
}
