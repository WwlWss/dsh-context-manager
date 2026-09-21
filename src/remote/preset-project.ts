import type { ContextManagerPresetDirectoryRemotePort } from './host-ports.js'
import type {
  ContextManagerRemoteBasePresetResolution,
  ContextManagerRemotePresetSnapshot,
} from './types.js'

function projectBasePreset(
  value: ContextManagerRemotePresetSnapshot['profiles'][string]['basePreset'],
): ContextManagerRemoteBasePresetResolution {
  switch (value.status) {
    case 'unavailable':
    case 'missing':
    case 'resolved':
      return Object.freeze({
        status: value.status,
        configuredId: value.configuredId,
      })
    case 'broken':
      return Object.freeze({
        status: 'broken',
        configuredId: value.configuredId,
        reason: value.reason,
      })
  }
}

export function projectPresetSnapshot(
  snapshot: Awaited<ReturnType<ContextManagerPresetDirectoryRemotePort['snapshot']>>,
): ContextManagerRemotePresetSnapshot {
  const profiles: Record<string, {
    readonly basePreset: ContextManagerRemoteBasePresetResolution
  }> = Object.create(null)

  for (const [profileId, state] of Object.entries(snapshot.profiles)) {
    profiles[profileId] = Object.freeze({
      basePreset: projectBasePreset(state.basePreset),
    })
  }

  const directory = snapshot.directory.status === 'unavailable'
    ? Object.freeze({ status: 'unavailable' as const })
    : Object.freeze({
        status: 'available' as const,
        defaultId: snapshot.directory.defaultId,
        authorable: snapshot.directory.authorable,
        presets: Object.freeze(snapshot.directory.presets.map(preset => Object.freeze({
          id: preset.id,
          trust: preset.trust,
          isDefault: preset.isDefault,
          ...(preset.name === undefined ? {} : { name: preset.name }),
          ...(preset.description === undefined ? {} : { description: preset.description }),
          ...(preset.broken === undefined ? {} : { broken: preset.broken }),
        }))),
      })

  return Object.freeze({
    directory,
    profiles: Object.freeze(profiles),
  })
}
