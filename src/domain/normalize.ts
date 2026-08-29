import {
  SKILL_MODES,
  type ContextManagerDiagnostic,
  type ContextManagerPersistenceState,
  type ContextManagerSnapshot,
  type ContextProfile,
  type SkillBinding,
  type SkillMode,
} from './model.js'
import {
  classifyContextManagerSchemaVersion,
  CONTEXT_MANAGER_SCHEMA_VERSION,
  type StoredContextManagerSettings,
} from './schema.js'
import { isPlainObject } from './storage.js'

const skillModes = new Set<string>(SKILL_MODES)

export function parseSkillMode(value: unknown): SkillMode {
  if (typeof value !== 'string' || !skillModes.has(value)) {
    throw new TypeError('skill mode must be pinned, auto, manual, or off')
  }
  return value as SkillMode
}

export function parseSkillBinding(raw: unknown): SkillBinding {
  if (!isPlainObject(raw)) throw new TypeError('skill binding must be an object')
  let mode: SkillMode
  try {
    mode = parseSkillMode(raw.mode)
  } catch {
    throw new TypeError('skill binding.mode must be pinned, auto, manual, or off')
  }
  return Object.freeze({ mode })
}

export function parseProfile(raw: unknown): ContextProfile {
  if (!isPlainObject(raw)) throw new TypeError('profile must be an object')
  if (typeof raw.name !== 'string') throw new TypeError('profile.name must be a string')
  if (typeof raw.basePreset !== 'string') throw new TypeError('profile.basePreset must be a string')
  if (raw.description !== undefined && typeof raw.description !== 'string') {
    throw new TypeError('profile.description must be a string when present')
  }
  if (raw.skills !== undefined && !isPlainObject(raw.skills)) {
    throw new TypeError('profile.skills must be an object when present')
  }

  const skills: Record<string, SkillBinding> = Object.create(null) as Record<string, SkillBinding>
  for (const [name, binding] of Object.entries(raw.skills ?? {})) {
    try {
      skills[name] = parseSkillBinding(binding)
    } catch (error) {
      throw new TypeError(
        `profile.skills[${JSON.stringify(name)}] ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  return Object.freeze({
    name: raw.name,
    ...(raw.description === undefined ? {} : { description: raw.description }),
    basePreset: raw.basePreset,
    skills: Object.freeze(skills),
  })
}

function freezeDiagnostic(diagnostic: ContextManagerDiagnostic): Readonly<ContextManagerDiagnostic> {
  return Object.freeze(diagnostic)
}

function freezeSnapshot(snapshot: ContextManagerSnapshot): ContextManagerSnapshot {
  for (const diagnostic of snapshot.diagnostics) Object.freeze(diagnostic)
  Object.freeze(snapshot.profiles)
  Object.freeze(snapshot.diagnostics)
  Object.freeze(snapshot.persistence)
  return Object.freeze(snapshot)
}

function incompatibleSnapshot(
  stored: StoredContextManagerSettings,
  persistence: ContextManagerPersistenceState,
): ContextManagerSnapshot {
  const status = classifyContextManagerSchemaVersion(stored.schemaVersion)
  const diagnostic = status === 'invalid'
    ? freezeDiagnostic({
        code: 'invalid-schema-version',
        message: `settings schema version ${String(stored.schemaVersion)} is not a positive integer`,
      })
    : freezeDiagnostic({
        code: 'unsupported-schema-version',
        message: `settings schema version ${String(stored.schemaVersion)} is not supported; this build supports ${String(CONTEXT_MANAGER_SCHEMA_VERSION)}`,
      })

  return freezeSnapshot({
    schemaVersion: stored.schemaVersion,
    schemaCompatible: false,
    ...(stored.defaultProfileId === undefined
      ? {}
      : { configuredDefaultProfileId: stored.defaultProfileId }),
    profiles: Object.create(null) as Record<string, ContextProfile>,
    diagnostics: [diagnostic],
    persistence,
  })
}

/**
 * Build the usable Domain view without rewriting, trimming, falling back, or
 * otherwise repairing stored user-authored profile payloads.
 */
export function normalizeSettings(
  stored: StoredContextManagerSettings,
  persistence: ContextManagerPersistenceState,
): ContextManagerSnapshot {
  if (classifyContextManagerSchemaVersion(stored.schemaVersion) !== 'supported') {
    return incompatibleSnapshot(stored, persistence)
  }

  const profiles: Record<string, ContextProfile> = Object.create(null) as Record<string, ContextProfile>
  const diagnostics: ContextManagerDiagnostic[] = []

  for (const [id, raw] of Object.entries(stored.profiles)) {
    try {
      profiles[id] = parseProfile(raw)
    } catch (error) {
      diagnostics.push(freezeDiagnostic({
        code: 'invalid-profile',
        profileId: id,
        message: error instanceof Error ? error.message : String(error),
      }))
    }
  }

  let usableDefaultProfileId: string | undefined
  if (stored.defaultProfileId !== undefined) {
    if (!Object.hasOwn(stored.profiles, stored.defaultProfileId)) {
      diagnostics.push(freezeDiagnostic({
        code: 'missing-default-profile',
        profileId: stored.defaultProfileId,
        message: `default profile ${JSON.stringify(stored.defaultProfileId)} is not stored`,
      }))
    } else if (!Object.hasOwn(profiles, stored.defaultProfileId)) {
      diagnostics.push(freezeDiagnostic({
        code: 'invalid-default-profile',
        profileId: stored.defaultProfileId,
        message: `default profile ${JSON.stringify(stored.defaultProfileId)} is stored but is not structurally usable`,
      }))
    } else {
      usableDefaultProfileId = stored.defaultProfileId
    }
  }

  return freezeSnapshot({
    schemaVersion: stored.schemaVersion,
    schemaCompatible: true,
    ...(stored.defaultProfileId === undefined
      ? {}
      : { configuredDefaultProfileId: stored.defaultProfileId }),
    ...(usableDefaultProfileId === undefined ? {} : { usableDefaultProfileId }),
    profiles,
    diagnostics,
    persistence,
  })
}

export function parseProfileForWrite(raw: unknown): ContextProfile {
  return parseProfile(raw)
}
