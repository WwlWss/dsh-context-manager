import type { SessionPresetIdentity } from '../adapters/session-preset.js'
import type { DefaultProfileCandidate } from '../domain/model.js'
import type { EffectiveProfileResolution } from './types.js'

function frozen<const T extends object>(value: T): Readonly<T> {
  return Object.freeze(value)
}

/**
 * Resolve M4C2's current effective Context Profile without performing any Host
 * mutation or consulting the native preset roster.
 *
 * The global default is only the current selection source. Eligibility is
 * fenced by the exact live Session AgentPreset identity observed by M3B.
 */
export function resolveEffectiveProfile(
  candidate: DefaultProfileCandidate,
  presetIdentity: SessionPresetIdentity,
): EffectiveProfileResolution {
  if (candidate.status === 'schema-incompatible') {
    return frozen({
      status: 'profile-unusable',
      ...(candidate.configuredProfileId === undefined
        ? {}
        : { configuredProfileId: candidate.configuredProfileId }),
      reason: 'schema-incompatible',
    })
  }

  if (candidate.status === 'no-default-profile') {
    return frozen({ status: 'no-default-profile' })
  }

  if (candidate.status === 'missing-default-profile') {
    return frozen({
      status: 'profile-unusable',
      configuredProfileId: candidate.profileId,
      reason: 'missing-default-profile',
    })
  }

  if (candidate.status === 'invalid-default-profile') {
    return frozen({
      status: 'profile-unusable',
      configuredProfileId: candidate.profileId,
      reason: 'invalid-default-profile',
    })
  }

  const usableProfileId = candidate.profileId
  const profile = candidate.profile

  if (presetIdentity.status === 'unavailable') {
    return frozen({
      status: 'preset-identity-unavailable',
      profileId: usableProfileId,
      reason: 'session-store-unavailable',
    })
  }

  if (presetIdentity.status === 'not-live') {
    return frozen({
      status: 'preset-identity-unavailable',
      profileId: usableProfileId,
      reason: 'session-not-live',
    })
  }

  if (profile.basePreset !== presetIdentity.presetId) {
    return frozen({
      status: 'base-preset-mismatch',
      profileId: usableProfileId,
      expectedPresetId: profile.basePreset,
      actualPresetId: presetIdentity.presetId,
    })
  }

  // basePreset is always a string, so exact equality implies presetId is a
  // string rather than null.
  return frozen({
    status: 'active',
    profileId: usableProfileId,
    profile,
    presetId: profile.basePreset,
  })
}
