import {
  SKILL_MODES,
  type ContextManagerPersistenceState,
  type ContextManagerSnapshot,
  type ContextProfile,
  type SkillMode,
} from './model.js'
import {
  CONTEXT_MANAGER_SCHEMA_VERSION,
  type StoredContextManagerSettings,
} from './schema.js'

const skillModes = new Set<string>(SKILL_MODES)

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function parseProfile(raw: unknown): ContextProfile {
  if (!isPlainObject(raw)) throw new TypeError('profile must be an object')
  if (typeof raw.name !== 'string') throw new TypeError('profile.name must be a string')
  if (typeof raw.basePreset !== 'string') throw new TypeError('profile.basePreset must be a string')
  if (raw.description !== undefined && typeof raw.description !== 'string') {
    throw new TypeError('profile.description must be a string when present')
  }
  if (raw.skills !== undefined && !isPlainObject(raw.skills)) {
    throw new TypeError('profile.skills must be an object when present')
  }

  const skills: Record<string, SkillMode> = Object.create(null) as Record<string, SkillMode>
  for (const [name, mode] of Object.entries(raw.skills ?? {})) {
    if (typeof mode !== 'string' || !skillModes.has(mode)) {
      throw new TypeError(`profile.skills[${JSON.stringify(name)}] must be pinned, auto, manual, or off`)
    }
    skills[name] = mode as SkillMode
  }

  return Object.freeze({
    name: raw.name,
    ...(raw.description === undefined ? {} : { description: raw.description }),
    basePreset: raw.basePreset,
    skills: Object.freeze(skills),
  })
}

function freezeSnapshot(snapshot: ContextManagerSnapshot): ContextManagerSnapshot {
  Object.freeze(snapshot.profiles)
  Object.freeze(snapshot.diagnostics)
  Object.freeze(snapshot.persistence)
  return Object.freeze(snapshot)
}

/**
 * Build the usable domain view without rewriting, trimming, falling back, or
 * otherwise repairing user-authored data.
 */
export function normalizeSettings(
  stored: StoredContextManagerSettings,
  persistence: ContextManagerPersistenceState,
): ContextManagerSnapshot {
  if (stored.schemaVersion > CONTEXT_MANAGER_SCHEMA_VERSION) {
    return freezeSnapshot({
      schemaVersion: stored.schemaVersion,
      schemaCompatible: false,
      ...(stored.defaultProfileId === undefined
        ? {}
        : { configuredDefaultProfileId: stored.defaultProfileId }),
      profiles: Object.create(null) as Record<string, ContextProfile>,
      diagnostics: [{
        code: 'unsupported-schema-version',
        message: `settings schema ${String(stored.schemaVersion)} is newer than supported schema ${String(CONTEXT_MANAGER_SCHEMA_VERSION)}`,
      }],
      persistence,
    })
  }

  const profiles: Record<string, ContextProfile> = Object.create(null) as Record<string, ContextProfile>
  const diagnostics: ContextManagerSnapshot['diagnostics'][number][] = []

  for (const [id, raw] of Object.entries(stored.profiles)) {
    try {
      profiles[id] = parseProfile(raw)
    } catch (error) {
      diagnostics.push({
        code: 'invalid-profile',
        profileId: id,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  let defaultProfileId: string | undefined
  if (stored.defaultProfileId !== undefined) {
    if (Object.hasOwn(profiles, stored.defaultProfileId)) {
      defaultProfileId = stored.defaultProfileId
    } else {
      diagnostics.push({
        code: 'missing-default-profile',
        profileId: stored.defaultProfileId,
        message: `default profile ${JSON.stringify(stored.defaultProfileId)} is not currently usable`,
      })
    }
  }

  return freezeSnapshot({
    schemaVersion: stored.schemaVersion,
    schemaCompatible: true,
    ...(stored.defaultProfileId === undefined
      ? {}
      : { configuredDefaultProfileId: stored.defaultProfileId }),
    ...(defaultProfileId === undefined ? {} : { defaultProfileId }),
    profiles,
    diagnostics,
    persistence,
  })
}

export function parseProfileForWrite(raw: unknown): ContextProfile {
  return parseProfile(raw)
}
