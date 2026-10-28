import type {
  ContextManagerRemoteChangeSnapshot,
  ContextManagerRemotePresetSnapshot,
  ContextManagerRemoteProfilesSnapshot,
  ContextManagerRemotePromptPlacementCapability,
  ContextManagerRemotePromptResource,
  ContextManagerRemotePromptResourceListItem,
  ContextManagerRemoteSessionPresetIdentity,
  ContextManagerRemotePromptRuntimeInspection,
  ContextManagerRemoteSkillRuntimeInspection,
  ContextManagerRemotePinnedSkillInspection,
  ContextManagerRemoteErrorCode,
} from '../remote/types.js'

export type ContextManagerClientBaselineSurface =
  | 'profiles'
  | 'presets'
  | 'promptPlacement'

export type ContextManagerClientReadError =
  | {
      readonly kind: 'business'
      readonly code: ContextManagerRemoteErrorCode
      readonly message: string
    }
  | {
      readonly kind: 'remote'
      readonly code: string
      readonly message: string
    }
  | {
      readonly kind: 'call-rejected'
      readonly message: string
    }
  | {
      readonly kind: 'unstable-snapshot'
      readonly attempts: number
    }
  | {
      readonly kind: 'unstable-authority'
      readonly attempts: number
    }

export interface ContextManagerClientSurface<T> {
  readonly status: 'idle' | 'loading' | 'ready' | 'error'
  readonly stale: boolean
  readonly data?: T
  readonly error?: ContextManagerClientReadError
}

export type ContextManagerClientProtocolState =
  | { readonly status: 'unchecked' }
  | { readonly status: 'checking' }
  | {
      readonly status: 'compatible'
      readonly apiVersion: number
    }
  | {
      readonly status: 'incompatible'
      readonly expected: number
      readonly actual: number
    }
  | {
      readonly status: 'error'
      readonly error: ContextManagerClientReadError
    }

export type ContextManagerClientSyncState =
  | { readonly status: 'idle' }
  | { readonly status: 'syncing' }
  | {
      readonly status: 'error'
      readonly error: ContextManagerClientReadError
    }

export interface ContextManagerClientResourceState {
  readonly list: ContextManagerClientSurface<readonly ContextManagerRemotePromptResourceListItem[]>
  readonly documents: ReadonlyMap<string, ContextManagerClientSurface<ContextManagerRemotePromptResource>>
}

export interface ContextManagerClientDiagnosticState {
  readonly sessions: ReadonlyMap<string, ContextManagerClientSurface<ContextManagerRemoteSessionPresetIdentity>>
  readonly prompts: ReadonlyMap<string, ContextManagerClientSurface<ContextManagerRemotePromptRuntimeInspection>>
  readonly skills: ReadonlyMap<string, ContextManagerClientSurface<ContextManagerRemoteSkillRuntimeInspection>>
  readonly pinned: ReadonlyMap<string, ContextManagerClientSurface<ContextManagerRemotePinnedSkillInspection>>
}

export interface ContextManagerClientPromptResourceReadStamp {
  readonly instanceId: string
  readonly resourceAuthorityId: string
  readonly resourceId: string
  readonly incarnationId: string | null
  readonly revision: number
  readonly source: 'list' | 'document'
}

export type ContextManagerClientLazyReadResult = {
  readonly status: 'completed' | 'superseded' | 'detached' | 'disposed' | 'incompatible'
}

export interface ContextManagerClientSnapshot {
  readonly attachment: 'detached' | 'attached'
  readonly protocol: ContextManagerClientProtocolState
  readonly sync: ContextManagerClientSyncState
  readonly instanceId?: string
  readonly changes?: ContextManagerRemoteChangeSnapshot
  readonly profiles: ContextManagerClientSurface<ContextManagerRemoteProfilesSnapshot>
  readonly presets: ContextManagerClientSurface<ContextManagerRemotePresetSnapshot>
  readonly promptPlacement: ContextManagerClientSurface<ContextManagerRemotePromptPlacementCapability>
  readonly resources: ContextManagerClientResourceState
  readonly diagnostics: ContextManagerClientDiagnosticState
}

export type ContextManagerClientReconcileResult =
  | {
      readonly status: 'completed'
      readonly attempted: readonly ContextManagerClientBaselineSurface[]
    }
  | {
      readonly status: 'detached' | 'disposed' | 'incompatible'
      readonly attempted: readonly ContextManagerClientBaselineSurface[]
    }
