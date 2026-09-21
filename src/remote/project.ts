import type {
  ContextManagerRemoteProfilesSnapshot,
  ContextManagerRemotePromptResource,
  ContextManagerRemotePromptResourceListItem,
} from './types.js'
import type { ContextManagerProfileSnapshotPort, ContextManagerPromptRemotePort } from './host-ports.js'

export function projectProfilesSnapshot(
  snapshot: ContextManagerProfileSnapshotPort,
): ContextManagerRemoteProfilesSnapshot {
  const profiles: Record<string, ContextManagerRemoteProfilesSnapshot['profiles'][string]> = Object.create(null)
  for (const [id, profile] of Object.entries(snapshot.profiles)) {
    const skills: Record<string, { readonly mode: 'pinned' | 'auto' | 'manual' | 'off' }> = Object.create(null)
    for (const [name, binding] of Object.entries(profile.skills)) {
      skills[name] = Object.freeze({ mode: binding.mode })
    }

    const prompts: Record<string, {
      readonly resourceId: string
      readonly enabled: boolean
      readonly placement: 'before-persona' | 'after-persona' | 'before-tool-guidance' | 'after-tool-guidance' | 'runtime-context'
      readonly order: number
    }> = Object.create(null)
    for (const [bindingId, binding] of Object.entries(profile.prompts)) {
      prompts[bindingId] = Object.freeze({
        resourceId: binding.resourceId,
        enabled: binding.enabled,
        placement: binding.placement,
        order: binding.order,
      })
    }

    profiles[id] = Object.freeze({
      name: profile.name,
      ...(profile.description === undefined ? {} : { description: profile.description }),
      basePreset: profile.basePreset,
      skills: Object.freeze(skills),
      prompts: Object.freeze(prompts),
    })
  }

  return Object.freeze({
    schemaVersion: snapshot.schemaVersion,
    schemaCompatible: snapshot.schemaCompatible,
    ...(snapshot.configuredDefaultProfileId === undefined
      ? {}
      : { configuredDefaultProfileId: snapshot.configuredDefaultProfileId }),
    ...(snapshot.usableDefaultProfileId === undefined
      ? {}
      : { usableDefaultProfileId: snapshot.usableDefaultProfileId }),
    profiles: Object.freeze(profiles),
    diagnostics: Object.freeze(snapshot.diagnostics.map(item => Object.freeze({
      code: item.code,
      ...(item.profileId === undefined ? {} : { profileId: item.profileId }),
      message: item.message,
    }))),
    persistence: Object.freeze({
      available: snapshot.persistence.available,
      registered: snapshot.persistence.registered,
      writable: snapshot.persistence.writable,
      ...(snapshot.persistence.revision === undefined ? {} : { revision: snapshot.persistence.revision }),
    }),
  })
}

export function projectPromptResourceList(
  list: ReturnType<ContextManagerPromptRemotePort['list']>,
): readonly ContextManagerRemotePromptResourceListItem[] {
  return Object.freeze(list.map(item => item.status === 'usable'
    ? Object.freeze({
        status: 'usable' as const,
        id: item.id,
        name: item.name,
        ...(item.description === undefined ? {} : { description: item.description }),
        revision: item.revision,
      })
    : Object.freeze({
        status: 'invalid' as const,
        id: item.id,
        message: item.message,
      })))
}

export function projectPromptResource(
  snapshot: ReturnType<ContextManagerPromptRemotePort['get']>,
): ContextManagerRemotePromptResource {
  return Object.freeze({
    id: snapshot.id,
    name: snapshot.resource.name,
    ...(snapshot.resource.description === undefined ? {} : { description: snapshot.resource.description }),
    content: snapshot.resource.content,
    revision: snapshot.resource.revision,
  })
}
