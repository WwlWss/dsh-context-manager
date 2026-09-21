import type {
  ContextManagerRemoteChangeSnapshot,
  ContextManagerRemoteDiagnosticCode,
  ContextManagerRemotePinnedSkillInspection,
  ContextManagerRemotePresetSnapshot,
  ContextManagerRemotePromptBinding,
  ContextManagerRemotePromptPlacement,
  ContextManagerRemotePromptPlacementCapability,
  ContextManagerRemotePromptRuntimeInspection,
  ContextManagerRemoteSessionPresetIdentity,
  ContextManagerRemoteSkillMode,
  ContextManagerRemoteSkillRuntimeInspection,
} from './types.js'

export interface ContextManagerProfileSnapshotPort {
  readonly schemaVersion: number
  readonly schemaCompatible: boolean
  readonly configuredDefaultProfileId?: string
  readonly usableDefaultProfileId?: string
  readonly profiles: {
    readonly [profileId: string]: {
      readonly name: string
      readonly description?: string
      readonly basePreset: string
      readonly skills: {
        readonly [skillName: string]: { readonly mode: ContextManagerRemoteSkillMode }
      }
      readonly prompts: {
        readonly [bindingId: string]: {
          readonly resourceId: string
          readonly enabled: boolean
          readonly placement: ContextManagerRemotePromptPlacement
          readonly order: number
        }
      }
    }
  }
  readonly diagnostics: readonly {
    readonly code: ContextManagerRemoteDiagnosticCode
    readonly profileId?: string
    readonly message: string
  }[]
  readonly persistence: {
    readonly available: boolean
    readonly registered: boolean
    readonly writable: boolean
    readonly revision?: number
  }
}

export interface ContextManagerProfileRemotePort {
  snapshotForWire(): ContextManagerProfileSnapshotPort
  createProfile(id: string, input: unknown, expectedRevision?: number): Promise<void>
  deleteProfile(id: string, expectedRevision?: number): Promise<void>
  setDefaultProfile(id: string | undefined, expectedRevision?: number): Promise<void>
  setProfileName(profileId: string, name: string, expectedRevision?: number): Promise<void>
  setProfileDescription(profileId: string, description: string | undefined, expectedRevision?: number): Promise<void>
  setProfileBasePreset(profileId: string, basePreset: string, expectedRevision?: number): Promise<void>
  setSkillMode(profileId: string, skillName: string, mode: ContextManagerRemoteSkillMode, expectedRevision?: number): Promise<void>
  removeSkillBinding(profileId: string, skillName: string, expectedRevision?: number): Promise<void>
  addPromptBinding(profileId: string, bindingId: string, input: ContextManagerRemotePromptBinding, expectedRevision?: number): Promise<void>
  setPromptBindingResourceId(profileId: string, bindingId: string, resourceId: string, expectedRevision?: number): Promise<void>
  setPromptBindingEnabled(profileId: string, bindingId: string, enabled: boolean, expectedRevision?: number): Promise<void>
  setPromptBindingPlacement(profileId: string, bindingId: string, placement: ContextManagerRemotePromptPlacement, expectedRevision?: number): Promise<void>
  setPromptBindingOrder(profileId: string, bindingId: string, order: number, expectedRevision?: number): Promise<void>
  removePromptBinding(profileId: string, bindingId: string, expectedRevision?: number): Promise<void>
}

export interface ContextManagerPromptRemotePort {
  list(): readonly (
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
  )[]
  get(id: string): {
    readonly id: string
    readonly resource: {
      readonly name: string
      readonly description?: string
      readonly content: string
      readonly revision: number
      readonly [key: string]: unknown
    }
  }
  createPrompt(id: string, input: { readonly name: string; readonly description?: string; readonly content: string }): Promise<{ readonly id: string; readonly revision: number }>
  replacePrompt(id: string, input: { readonly name: string; readonly description?: string; readonly content: string }, expectedRevision: number): Promise<{ readonly id: string; readonly revision: number }>
  deletePrompt(id: string, expectedRevision: number): Promise<void>
}


export interface ContextManagerPresetDirectoryRemotePort {
  snapshot(): Promise<ContextManagerRemotePresetSnapshot>
}

export interface ContextManagerPresetAuthoringRemotePort {
  read(id: string): Promise<string>
  copy(from: string, id: string, name?: string): Promise<void>
  remove(id: string): Promise<void>
}

export interface ContextManagerSessionPresetRemotePort {
  snapshot(sessionId: string): ContextManagerRemoteSessionPresetIdentity
}

export interface ContextManagerPromptPlacementRemotePort {
  snapshot(): ContextManagerRemotePromptPlacementCapability
}

export interface ContextManagerPromptRuntimeRemotePort {
  inspect(agentId: string): Promise<ContextManagerRemotePromptRuntimeInspection>
}

export interface ContextManagerSkillRuntimeRemotePort {
  inspect(agentId: string): Promise<ContextManagerRemoteSkillRuntimeInspection>
}

export interface ContextManagerPinnedSkillRuntimeRemotePort {
  inspect(agentId: string): Promise<ContextManagerRemotePinnedSkillInspection>
}

export interface ContextManagerChangeRemotePort {
  snapshot(): ContextManagerRemoteChangeSnapshot
}
