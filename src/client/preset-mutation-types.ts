import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ContextManagerRemoteErrorCode } from '../remote/types.js'

export type ContextManagerClientPresetMutationKind = 'copy' | 'remove'

export type ContextManagerClientPresetMutationResult =
  | { readonly status: 'applied'; readonly refresh: 'fresh' | 'degraded' }
  | {
      readonly status: 'rejected'
      readonly error: {
        readonly kind: 'precondition' | 'business'
        readonly code: string | ContextManagerRemoteErrorCode
        readonly message: string
      }
      readonly refresh: 'not-requested' | 'fresh' | 'degraded'
    }
  | {
      readonly status: 'unknown'
      readonly error: {
        readonly kind: 'remote' | 'call-rejected'
        readonly code?: string
        readonly message: string
      }
      readonly refresh: 'fresh' | 'degraded'
    }
  | { readonly status: 'superseded' | 'detached' | 'disposed' | 'incompatible' }

export type ContextManagerClientPresetMutationOperation =
  | { readonly status: 'idle' }
  | {
      readonly status: 'running'
      readonly id: number
      readonly kind: ContextManagerClientPresetMutationKind
      readonly phase: 'mutating' | 'rehydrating'
    }
  | {
      readonly status: 'settled'
      readonly id: number
      readonly kind: ContextManagerClientPresetMutationKind
      readonly result: ContextManagerClientPresetMutationResult
    }

export interface ContextManagerClientPresetMutationSnapshot {
  readonly preset: ContextManagerClientPresetMutationOperation
}

export interface ContextManagerClientPresetMutations {
  copyPreset(from: string, id: string, name: string | null): Promise<ContextManagerClientPresetMutationResult>
  removePreset(id: string): Promise<ContextManagerClientPresetMutationResult>
}

export interface ContextManagerClientPresetMutationController extends ContextManagerClientPresetMutations {
  readonly state: SnapshotStore<ContextManagerClientPresetMutationSnapshot>
}
