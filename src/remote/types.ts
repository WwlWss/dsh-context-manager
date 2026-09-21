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
  readonly skills?: Readonly<Record<string, ContextManagerRemoteSkillBinding>>
  readonly prompts?: Readonly<Record<string, ContextManagerRemotePromptBinding>>
}

export interface ContextManagerRemoteProfile {
  readonly name: string
  readonly description?: string
  readonly basePreset: string
  readonly skills: Readonly<Record<string, ContextManagerRemoteSkillBinding>>
  readonly prompts: Readonly<Record<string, ContextManagerRemotePromptBinding>>
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
  readonly profiles: Readonly<Record<string, ContextManagerRemoteProfile>>
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
