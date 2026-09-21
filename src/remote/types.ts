export const CONTEXT_MANAGER_REMOTE_API_VERSION = 1

export interface ContextManagerRemoteProtocol {
  readonly apiVersion: number
}

export type ContextManagerRemoteSkillMode = 'pinned' | 'auto' | 'manual' | 'off'

export type ContextManagerRemotePromptPlacement =
  | 'before-persona'
  | 'after-persona'
  | 'before-tool-guidance'
  | 'after-tool-guidance'
  | 'runtime-context'

export interface ContextManagerRemoteSkillBinding {
  readonly mode: ContextManagerRemoteSkillMode
}

export interface ContextManagerRemotePromptBinding {
  readonly resourceId: string
  readonly enabled: boolean
  readonly placement: ContextManagerRemotePromptPlacement
  readonly order: number
}

export interface ContextManagerRemoteProfileInput {
  readonly name: string
  readonly description?: string
  readonly basePreset: string
  readonly skills?: Record<string, ContextManagerRemoteSkillBinding>
  readonly prompts?: Record<string, ContextManagerRemotePromptBinding>
}

export interface ContextManagerRemoteProfile {
  readonly name: string
  readonly description?: string
  readonly basePreset: string
  readonly skills: Record<string, ContextManagerRemoteSkillBinding>
  readonly prompts: Record<string, ContextManagerRemotePromptBinding>
}

export type ContextManagerRemoteDiagnosticCode =
  | 'invalid-profile'
  | 'missing-default-profile'
  | 'invalid-default-profile'
  | 'invalid-schema-version'
  | 'unsupported-schema-version'

export interface ContextManagerRemoteDiagnostic {
  readonly code: ContextManagerRemoteDiagnosticCode
  readonly profileId?: string
  readonly message: string
}

export interface ContextManagerRemotePersistence {
  readonly available: boolean
  readonly registered: boolean
  readonly writable: boolean
  readonly revision?: number
}

export interface ContextManagerRemoteProfilesSnapshot {
  readonly schemaVersion: number
  readonly schemaCompatible: boolean
  readonly configuredDefaultProfileId?: string
  readonly usableDefaultProfileId?: string
  readonly profiles: Record<string, ContextManagerRemoteProfile>
  readonly diagnostics: readonly ContextManagerRemoteDiagnostic[]
  readonly persistence: ContextManagerRemotePersistence
}

export interface ContextManagerRemotePromptResourceInput {
  readonly name: string
  readonly description?: string
  readonly content: string
}

export type ContextManagerRemotePromptResourceListItem =
  | {
      readonly status: 'usable'
      readonly id: string
      readonly name: string
      readonly description?: string
      readonly revision: number
    }
  | {
      readonly status: 'invalid'
      readonly id: string
      readonly message: string
    }

export interface ContextManagerRemotePromptResource {
  readonly id: string
  readonly name: string
  readonly description?: string
  readonly content: string
  readonly revision: number
}

export interface ContextManagerRemoteMutationReceipt {
  readonly id: string
  readonly revision: number
}

export interface ContextManagerRemoteDeleteReceipt {
  readonly id: string
}

export type ContextManagerRemoteErrorCode =
  | 'profile-conflict'
  | 'invalid-revision'
  | 'profile-exists'
  | 'profile-not-found'
  | 'profile-path-not-editable'
  | 'skill-binding-not-found'
  | 'prompt-binding-exists'
  | 'prompt-binding-not-found'
  | 'invalid-profile'
  | 'invalid-skill-mode'
  | 'invalid-prompt-binding'
  | 'invalid-prompt-placement'
  | 'invalid-prompt-order'
  | 'unsafe-path-key'
  | 'persistence-unavailable'
  | 'persistence-not-ready'
  | 'persistence-read-only'
  | 'persistence-document-invalid'
  | 'preset-authoring-unavailable'
  | 'prompt-library-not-ready'
  | 'prompt-resource-exists'
  | 'prompt-resource-not-found'
  | 'prompt-resource-conflict'
  | 'prompt-resource-path-not-editable'
  | 'invalid-prompt-resource'
  | 'invalid-schema-version'
  | 'unsupported-schema-version'

export interface ContextManagerRemoteError {
  readonly code: ContextManagerRemoteErrorCode
  readonly message: string
  readonly expectedRevision?: number
  readonly actualRevision?: number
}

export type ContextManagerRemoteResult<T> =
  | {
      readonly ok: true
      readonly value: T
    }
  | {
      readonly ok: false
      readonly error: ContextManagerRemoteError
    }


export type ContextManagerRemotePresetTrust = 'system' | 'user'

export interface ContextManagerRemotePresetRow {
  readonly id: string
  readonly trust: ContextManagerRemotePresetTrust
  readonly isDefault: boolean
  readonly name?: string
  readonly description?: string
  readonly broken?: string
}

export type ContextManagerRemotePresetDirectory =
  | {
      readonly status: 'unavailable'
    }
  | {
      readonly status: 'available'
      readonly defaultId: string
      readonly authorable: boolean
      readonly presets: readonly ContextManagerRemotePresetRow[]
    }

export type ContextManagerRemoteBasePresetResolution =
  | {
      readonly status: 'unavailable'
      readonly configuredId: string
    }
  | {
      readonly status: 'missing'
      readonly configuredId: string
    }
  | {
      readonly status: 'broken'
      readonly configuredId: string
      readonly reason: string
    }
  | {
      readonly status: 'resolved'
      readonly configuredId: string
    }

export interface ContextManagerRemotePresetSnapshot {
  readonly directory: ContextManagerRemotePresetDirectory
  readonly profiles: Record<string, {
    readonly basePreset: ContextManagerRemoteBasePresetResolution
  }>
}

export interface ContextManagerRemotePresetDocument {
  readonly id: string
  readonly content: string
}

export interface ContextManagerRemotePresetReceipt {
  readonly id: string
}

export type ContextManagerRemoteSessionPresetIdentity =
  | {
      readonly status: 'unavailable'
      readonly sessionId: string
    }
  | {
      readonly status: 'not-live'
      readonly sessionId: string
    }
  | {
      readonly status: 'known'
      readonly sessionId: string
      readonly presetId: string | null
    }

export type ContextManagerRemotePromptPlacementChannel =
  | 'system-prompt'
  | 'runtime-context'

export type ContextManagerRemotePromptPlacementCapability =
  | {
      readonly status: 'unavailable'
    }
  | {
      readonly status: 'available'
      readonly placements: Record<
        ContextManagerRemotePromptPlacement,
        ContextManagerRemotePromptPlacementChannel
      >
    }

export type ContextManagerRemoteEffectiveProfileResolution =
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
      readonly reason:
        | 'session-store-unavailable'
        | 'session-not-live'
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
      readonly presetId: string
    }

export type ContextManagerRemotePromptRuntimeNativeState =
  | 'present'
  | 'suppressed'
  | 'transformed'

export type ContextManagerRemotePromptRuntimeBinding =
  | {
      readonly state: 'disabled'
      readonly bindingId: string
      readonly resourceId: string
      readonly placement: ContextManagerRemotePromptPlacement
      readonly order: number
    }
  | {
      readonly state: 'missing-resource' | 'invalid-resource' | 'empty-content'
      readonly bindingId: string
      readonly resourceId: string
      readonly placement: ContextManagerRemotePromptPlacement
      readonly order: number
      readonly message?: string
    }
  | {
      readonly state: 'native-suppressed'
      readonly bindingId: string
      readonly resourceId: string
      readonly placement: ContextManagerRemotePromptPlacement
      readonly order: number
    }
  | {
      readonly state: 'eligible'
      readonly bindingId: string
      readonly resourceId: string
      readonly placement: ContextManagerRemotePromptPlacement
      readonly order: number
      readonly resourceRevision: number
      readonly nativeState: ContextManagerRemotePromptRuntimeNativeState
    }

export type ContextManagerRemotePromptRuntimeInspection =
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
      readonly profile: ContextManagerRemoteEffectiveProfileResolution
      readonly bindings: readonly ContextManagerRemotePromptRuntimeBinding[]
    }

export interface ContextManagerRemoteSkillRuntimeInvocation {
  readonly modelInvocable: boolean
  readonly userInvocable: boolean
}

export interface ContextManagerRemoteSkillRuntimeWinner {
  readonly provider: string
  readonly invocation: ContextManagerRemoteSkillRuntimeInvocation
}

export type ContextManagerRemoteSkillRuntimeBinding =
  | {
      readonly state: 'native-pass-through'
      readonly skillName: string
      readonly mode: 'auto'
      readonly winner: ContextManagerRemoteSkillRuntimeWinner
    }
  | {
      readonly state: 'policy-applied'
      readonly skillName: string
      readonly mode: 'manual' | 'off' | 'pinned'
      readonly nativeProvider: string
      readonly expectedInvocation: ContextManagerRemoteSkillRuntimeInvocation
    }
  | {
      readonly state: 'policy-not-effective'
      readonly skillName: string
      readonly mode: 'manual' | 'off' | 'pinned'
      readonly nativeProvider?: string
      readonly expectedInvocation: ContextManagerRemoteSkillRuntimeInvocation
      readonly winner?: ContextManagerRemoteSkillRuntimeWinner
    }
  | {
      readonly state: 'missing-native-skill'
      readonly skillName: string
      readonly mode: ContextManagerRemoteSkillMode
    }
  | {
      readonly state: 'catalog-incomplete'
      readonly skillName: string
      readonly mode: ContextManagerRemoteSkillMode
    }

export type ContextManagerRemoteSkillRuntimeInspection =
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
      readonly profile: ContextManagerRemoteEffectiveProfileResolution
      readonly catalogComplete: boolean
      readonly bindings: readonly ContextManagerRemoteSkillRuntimeBinding[]
    }

export type ContextManagerRemotePinnedSkillBinding =
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

export type ContextManagerRemotePinnedSkillNativeState =
  | 'empty'
  | 'present'
  | 'native-suppressed'
  | 'transformed'

export type ContextManagerRemotePinnedSkillInspection =
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
      readonly profile: ContextManagerRemoteEffectiveProfileResolution
      readonly catalogComplete: boolean
      readonly nativeState: ContextManagerRemotePinnedSkillNativeState
      readonly bindings: readonly ContextManagerRemotePinnedSkillBinding[]
    }

export interface ContextManagerRemoteChangeSnapshot {
  readonly instanceId: string
  readonly generation: number
  readonly profiles: number
  readonly promptResources: number
  readonly presets: number
  readonly runtime: number
}
