import type { SessionPresetIdentity } from '../adapters/session-preset.js'
import type {
  ContextManagerDiagnosticCode,
  ContextManagerSnapshot,
} from '../domain/model.js'
import type { EffectiveProfileResolution } from './types.js'

function frozen<T extends object>(value: T): Readonly<T> {
  return Object.freeze(value)
}

function unusableDefaultReason(
  snapshot: ContextManagerSnapshot,
  configuredProfileId: string,
): 'missing-default-profile' | 'invalid-default-profile' {
  const diagnostic = snapshot.diagnostics.find(item =>
    item.profileId === configuredProfileId
    && (
      item.code === 'missing-default-profile'
      || item.code === 'invalid-default-profile'
    ),
  )

  if (diagnostic?.code === 'missing-default-profile') return 'missing-default-profile'
  if (diagnostic?.code === 'invalid-default-profile') return 'invalid-default-profile'

  // ContextManagerService snapshots should always include one of the two
  // diagnostics when a configured default is not usable. Treat a stored-but-
  // unparsable/otherwise inconsistent default as invalid rather than inventing
  // a runtime fallback.
  return Object.hasOwn(snapshot.profiles, configuredProfileId)
    ? 'invalid-default-profile'
    : 'missing-default-profile'
}

/**
 * Resolve M4C2's current effective Context Profile without performing any Host
 * mutation or consulting the native preset roster.
 *
 * The global default is only the current selection source. Eligibility is
 * fenced by the exact live Session AgentPreset identity observed by M3B.
 */
export function resolveEffectiveProfile(
  snapshot: ContextManagerSnapshot,
  presetIdentity: SessionPresetIdentity,
): EffectiveProfileResolution {
  if (!snapshot.schemaCompatible) {
    return frozen({
      status: 'profile-unusable',
      ...(snapshot.configuredDefaultProfileId === undefined
        ? {}
        : { configuredProfileId: snapshot.configuredDefaultProfileId }),
      reason: 'schema-incompatible',
    })
  }

  const configuredProfileId = snapshot.configuredDefaultProfileId
  if (configuredProfileId === undefined) {
    return frozen({ status: 'no-default-profile' })
  }

  const usableProfileId = snapshot.usableDefaultProfileId
  if (usableProfileId === undefined) {
    return frozen({
      status: 'profile-unusable',
      configuredProfileId,
      reason: unusableDefaultReason(snapshot, configuredProfileId),
    })
  }

  const profile = snapshot.profiles[usableProfileId]
  if (profile === undefined) {
    // This is an impossible state for snapshots produced by the current Domain
    // normalizer. Keep the failure visible instead of guessing another profile.
    return frozen({
      status: 'profile-unusable',
      configuredProfileId,
      reason: 'invalid-default-profile',
    })
  }

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
