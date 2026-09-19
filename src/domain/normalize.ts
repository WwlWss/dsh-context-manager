import {
  PROMPT_PLACEMENTS,
  SKILL_MODES,
  type ContextManagerDiagnostic,
  type ContextManagerPersistenceState,
  type ContextManagerSnapshot,
  type ContextProfile,
  type DefaultProfileCandidate,
  type PromptBinding,
  type PromptPlacement,
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
const promptPlacements = new Set<string>(PROMPT_PLACEMENTS)

export function parseSkillMode(value: unknown): SkillMode {
  if (typeof value !== 'string' || !skillModes.has(value)) {
    throw new TypeError('skill mode must be pinned, auto, manual, or off')
  }
  return value as SkillMode
}

export function parsePromptPlacement(value: unknown): PromptPlacement {
  if (typeof value !== 'string' || !promptPlacements.has(value)) {
    throw new TypeError(
      'prompt placement must be before-persona, after-persona, before-tool-guidance, after-tool-guidance, or runtime-context',
    )
  }
  return value as PromptPlacement
}

export function parsePromptOrder(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new TypeError('prompt binding.order must be a safe integer')
  }
  return value
}

export function parsePromptBinding(raw: unknown): PromptBinding {
  if (!isPlainObject(raw)) throw new TypeError('prompt binding must be an object')
  if (typeof raw.resourceId !== 'string') {
    throw new TypeError('prompt binding.resourceId must be a string')
  }
  if (typeof raw.enabled !== 'boolean') {
    throw new TypeError('prompt binding.enabled must be a boolean')
  }

  let placement: PromptPlacement
  try {
    placement = parsePromptPlacement(raw.placement)
  } catch {
    throw new TypeError(
      'prompt binding.placement must be before-persona, after-persona, before-tool-guidance, after-tool-guidance, or runtime-context',
    )
  }

  return Object.freeze({
    resourceId: raw.resourceId,
    enabled: raw.enabled,
    placement,
    order: parsePromptOrder(raw.order),
  })
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
  if (raw.prompts !== undefined && !isPlainObject(raw.prompts)) {
    throw new TypeError('profile.prompts must be an object when present')
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

  const prompts: Record<string, PromptBinding> = Object.create(null) as Record<string, PromptBinding>
  for (const [bindingId, binding] of Object.entries(raw.prompts ?? {})) {
    try {
      prompts[bindingId] = parsePromptBinding(binding)
    } catch (error) {
      throw new TypeError(
        `profile.prompts[${JSON.stringify(bindingId)}] ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  return Object.freeze({
    name: raw.name,
    ...(raw.description === undefined ? {} : { description: raw.description }),
    basePreset: raw.basePreset,
    skills: Object.freeze(skills),
    prompts: Object.freeze(prompts),
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
 * Resolve only the configured default profile for runtime hot paths.
 *
 * This deliberately avoids enumerating the reusable profile library. Invalid
 * sibling profiles therefore do not participate in the result or cost of this
 * read.
 */
export function normalizeDefaultProfileCandidate(
  stored: StoredContextManagerSettings,
): DefaultProfileCandidate {
  if (classifyContextManagerSchemaVersion(stored.schemaVersion) !== 'supported') {
    return Object.freeze({
      status: 'schema-incompatible',
      ...(stored.defaultProfileId === undefined
        ? {}
        : { configuredProfileId: stored.defaultProfileId }),
    })
  }

  const profileId = stored.defaultProfileId
  if (profileId === undefined) {
    return Object.freeze({ status: 'no-default-profile' })
  }

  if (!Object.hasOwn(stored.profiles, profileId)) {
    return Object.freeze({
      status: 'missing-default-profile',
      profileId,
    })
  }

  try {
    return Object.freeze({
      status: 'candidate',
      profileId,
      profile: parseProfile(stored.profiles[profileId]),
    })
  } catch {
    return Object.freeze({
      status: 'invalid-default-profile',
      profileId,
    })
  }
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
