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


export type PromptRuntimeNativeState = 'present' | 'suppressed' | 'transformed'

export type PromptRuntimeBindingInspection =
  | Readonly<Extract<PromptBindingPlanState, { state: 'disabled' | 'missing-resource' | 'invalid-resource' | 'empty-content' }>>
  | {
      readonly state: 'native-suppressed'
      readonly bindingId: string
      readonly resourceId: string
      readonly placement: import('../domain/model.js').PromptPlacement
      readonly order: number
    }
  | {
      readonly state: 'eligible'
      readonly bindingId: string
      readonly resourceId: string
      readonly placement: import('../domain/model.js').PromptPlacement
      readonly order: number
      readonly resourceRevision: number
      readonly nativeState: PromptRuntimeNativeState
    }

export type PromptRuntimeInspection =
  | {
      readonly status: 'runtime-unavailable'
    }
  | {
      readonly status: 'agent-not-live'
      readonly agentId: string
    }
  | {
      readonly status: 'assembly-bypassed'
      readonly agentId: string
    }
  | {
      readonly status: 'resolved'
      readonly agentId: string
      readonly profile: EffectiveProfileResolution
      readonly bindings: readonly PromptRuntimeBindingInspection[]
    }


export interface SkillRuntimeInvocation {
  readonly modelInvocable: boolean
  readonly userInvocable: boolean
}

export interface SkillRuntimeWinner {
  readonly provider: string
  readonly invocation: SkillRuntimeInvocation
}

export type SkillRuntimeBindingInspection =
  | {
      readonly state: 'native-pass-through'
      readonly skillName: string
      readonly mode: 'auto'
      readonly winner: SkillRuntimeWinner
    }
  | {
      readonly state: 'policy-applied'
      readonly skillName: string
      readonly mode: 'manual' | 'off' | 'pinned'
      readonly nativeProvider: string
      readonly expectedInvocation: SkillRuntimeInvocation
    }
  | {
      readonly state: 'policy-not-effective'
      readonly skillName: string
      readonly mode: 'manual' | 'off' | 'pinned'
      readonly nativeProvider?: string
      readonly expectedInvocation: SkillRuntimeInvocation
      readonly winner?: SkillRuntimeWinner
    }
  | {
      readonly state: 'missing-native-skill'
      readonly skillName: string
      readonly mode: import('../domain/model.js').SkillMode
    }
  | {
      readonly state: 'catalog-incomplete'
      readonly skillName: string
      readonly mode: import('../domain/model.js').SkillMode
    }

export type SkillRuntimeInspection =
  | {
      readonly status: 'runtime-unavailable'
    }
  | {
      readonly status: 'agent-not-live'
      readonly agentId: string
    }
  | {
      readonly status: 'resolved'
      readonly agentId: string
      readonly profile: EffectiveProfileResolution
      readonly catalogComplete: boolean
      readonly bindings: readonly SkillRuntimeBindingInspection[]
    }


export type PinnedSkillBindingInspection =
  | {
      readonly state: 'loaded'
      readonly skillName: string
      readonly nativeProvider: string
    }
  | {
      readonly state: 'missing-native-skill'
      readonly skillName: string
    }
  | {
      readonly state: 'catalog-incomplete'
      readonly skillName: string
    }
  | {
      readonly state: 'definition-unavailable'
      readonly skillName: string
      readonly nativeProvider: string
    }
  | {
      readonly state: 'policy-not-effective'
      readonly skillName: string
      readonly nativeProvider: string
      readonly winnerProvider?: string
    }

export type PinnedSkillRuntimeNativeState =
  | 'empty'
  | 'present'
  | 'native-suppressed'
  | 'transformed'

export type PinnedSkillRuntimeInspection =
  | {
      readonly status: 'runtime-unavailable'
    }
  | {
      readonly status: 'agent-not-live'
      readonly agentId: string
    }
  | {
      readonly status: 'assembly-bypassed'
      readonly agentId: string
    }
  | {
      readonly status: 'resolved'
      readonly agentId: string
      readonly profile: EffectiveProfileResolution
      readonly catalogComplete: boolean
      readonly nativeState: PinnedSkillRuntimeNativeState
      readonly bindings: readonly PinnedSkillBindingInspection[]
    }
