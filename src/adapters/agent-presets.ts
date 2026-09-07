import type { Context } from '@deepseek-ai/cordis'

import type { ContextManagerSnapshot } from '../domain/model.js'

export type NativePresetTrust = 'system' | 'user'

/**
 * Path-free Context Manager view of one DSH-native AgentPreset roster entry.
 *
 * The Host AgentPreset object also carries filesystem/runtime implementation
 * details. Keep this DTO deliberately narrow so it is safe for later Remote/UI
 * use and does not make those details part of Context Manager's public model.
 */
export interface NativePresetRow {
  readonly id: string
  readonly trust: NativePresetTrust
  readonly isDefault: boolean
  readonly name?: string
  readonly description?: string
  readonly broken?: string
}

/** Resolution of one profile's configured base-preset reference. */
export type BasePresetResolution =
  | {
      readonly status: 'unavailable'
      readonly configuredId: string
    }
  | {
      readonly status: 'missing'
      readonly configuredId: string
    }
  | {
      readonly status: 'broken'
      readonly configuredId: string
      readonly preset: NativePresetRow
      readonly reason: string
    }
  | {
      readonly status: 'resolved'
      readonly configuredId: string
      readonly preset: NativePresetRow
    }

export interface ContextProfilePresetState {
  readonly basePreset: BasePresetResolution
}

export type NativePresetDirectory =
  | {
      readonly status: 'unavailable'
    }
  | {
      readonly status: 'available'
      readonly defaultId: string
      readonly authorable: boolean
      readonly presets: readonly NativePresetRow[]
    }

/**
 * Runtime/read-model snapshot for native preset discovery.
 *
 * This is intentionally separate from ContextManagerSnapshot: configured
 * profile intent remains Domain state while roster health is an observation of
 * the currently composed DSH process.
 */
export interface ContextManagerPresetSnapshot {
  readonly directory: NativePresetDirectory
  readonly profiles: Readonly<Record<string, ContextProfilePresetState>>
}

/**
 * Small structural slice of the Host AgentPreset value used by M3A.
 *
 * Do not add path/order/mount state here. The adapter projects only the stable
 * roster facts shared by the supported public Host service generations.
 */
interface HostAgentPreset {
  readonly id: string
  readonly trust: NativePresetTrust
  readonly name?: string
  readonly description?: string
  readonly broken?: string
}

/**
 * Public Host-service contract consumed by M3A.
 *
 * It is deliberately local instead of importing @deepseek-ai/dsh-agent-presets:
 * AgentPresets is an optional Cordis capability, and the stable 0.1.1 ->
 * current seam needed here is only defaultId/authorable/list(). This keeps an
 * absent optional Host capability from becoming a package-resolution
 * dependency and avoids coupling to newer Remote DTO exports.
 */
interface AgentPresetsCapability {
  readonly defaultId: string
  readonly authorable: boolean
  list(): Promise<readonly HostAgentPreset[]>
}

interface AgentPresetsObservation {
  readonly defaultId: string
  readonly authorable: boolean
  readonly presets: readonly HostAgentPreset[]
}

function unsupportedApi(message: string): Error {
  return new Error(`dsh-context-manager: unsupported agentPresets API; ${message}`)
}

function readOptionalString(
  row: Record<string, unknown>,
  key: 'name' | 'description' | 'broken',
  index: number,
): string | undefined {
  const value = row[key]
  if (value === undefined) return undefined
  if (typeof value !== 'string') {
    throw unsupportedApi(`list()[${String(index)}].${key} must be a string when present`)
  }
  return value
}

function validateRosterRow(value: unknown, index: number): HostAgentPreset {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw unsupportedApi(`list()[${String(index)}] must be an object`)
  }
  const row = value as Record<string, unknown>
  if (typeof row.id !== 'string') {
    throw unsupportedApi(`list()[${String(index)}].id must be a string`)
  }
  if (row.trust !== 'system' && row.trust !== 'user') {
    throw unsupportedApi(`list()[${String(index)}].trust must be "system" or "user"`)
  }

  const name = readOptionalString(row, 'name', index)
  const description = readOptionalString(row, 'description', index)
  const broken = readOptionalString(row, 'broken', index)

  return {
    id: row.id,
    trust: row.trust,
    ...(name === undefined ? {} : { name }),
    ...(description === undefined ? {} : { description }),
    ...(broken === undefined ? {} : { broken }),
  }
}

/**
 * Look up the optional native AgentPreset Host capability without requiring it
 * as a Cordis injection. Absence is the only condition mapped to unavailable;
 * a present but incompatible service fails loud instead of being misreported as
 * an absent capability.
 */
export function getAgentPresetsCapability(ctx: Context): AgentPresetsCapability | undefined {
  const capability = ctx.get('agentPresets') as unknown
  if (capability === undefined) return undefined
  if (typeof capability !== 'object' || capability === null) {
    throw unsupportedApi('service value must be an object')
  }
  const candidate = capability as Record<string, unknown>
  if (typeof candidate.list !== 'function') {
    throw unsupportedApi('expected list()')
  }
  return capability as AgentPresetsCapability
}

/** Read and validate the minimum native Host contract M3A consumes. */
export async function observeAgentPresets(
  capability: AgentPresetsCapability,
): Promise<AgentPresetsObservation> {
  const defaultId = capability.defaultId
  const authorable = capability.authorable
  if (typeof defaultId !== 'string') {
    throw unsupportedApi('defaultId must be a string')
  }
  if (typeof authorable !== 'boolean') {
    throw unsupportedApi('authorable must be a boolean')
  }

  const rawPresets = await capability.list()
  if (!Array.isArray(rawPresets)) {
    throw unsupportedApi('list() must resolve to an array')
  }

  return {
    defaultId,
    authorable,
    presets: rawPresets.map((preset, index) => validateRosterRow(preset, index)),
  }
}

function projectPreset(preset: HostAgentPreset, defaultId: string): NativePresetRow {
  return Object.freeze({
    id: preset.id,
    trust: preset.trust,
    isDefault: preset.id === defaultId,
    ...(preset.name === undefined ? {} : { name: preset.name }),
    ...(preset.description === undefined ? {} : { description: preset.description }),
    ...(preset.broken === undefined ? {} : { broken: preset.broken }),
  })
}

function resolveBasePreset(
  configuredId: string,
  byId: ReadonlyMap<string, NativePresetRow>,
): BasePresetResolution {
  const preset = byId.get(configuredId)

  if (preset === undefined) {
    return Object.freeze({
      status: 'missing',
      configuredId,
    })
  }

  if (preset.broken !== undefined) {
    return Object.freeze({
      status: 'broken',
      configuredId,
      preset,
      reason: preset.broken,
    })
  }

  return Object.freeze({
    status: 'resolved',
    configuredId,
    preset,
  })
}

/** Build one best-effort Domain + native-roster observation. */
export function buildPresetSnapshot(
  domain: ContextManagerSnapshot,
  observation: AgentPresetsObservation,
): ContextManagerPresetSnapshot {
  const presets = Object.freeze(
    observation.presets.map(preset => projectPreset(preset, observation.defaultId)),
  )
  const byId = new Map(presets.map(preset => [preset.id, preset] as const))
  const profiles = Object.create(null) as Record<string, ContextProfilePresetState>

  for (const [profileId, profile] of Object.entries(domain.profiles)) {
    profiles[profileId] = Object.freeze({
      basePreset: resolveBasePreset(profile.basePreset, byId),
    })
  }

  Object.freeze(profiles)

  return Object.freeze({
    directory: Object.freeze({
      status: 'available',
      defaultId: observation.defaultId,
      authorable: observation.authorable,
      presets,
    }),
    profiles,
  })
}

/** Build the same read model when DSH has no AgentPreset capability composed. */
export function buildUnavailablePresetSnapshot(
  domain: ContextManagerSnapshot,
): ContextManagerPresetSnapshot {
  const profiles = Object.create(null) as Record<string, ContextProfilePresetState>

  for (const [profileId, profile] of Object.entries(domain.profiles)) {
    profiles[profileId] = Object.freeze({
      basePreset: Object.freeze({
        status: 'unavailable',
        configuredId: profile.basePreset,
      }),
    })
  }

  Object.freeze(profiles)

  return Object.freeze({
    directory: Object.freeze({ status: 'unavailable' }),
    profiles,
  })
}
