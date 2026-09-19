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
