export const SKILL_MODES = ['pinned', 'auto', 'manual', 'off'] as const

export type SkillMode = (typeof SKILL_MODES)[number]

/**
 * Structured Domain view of one stored Context Manager profile payload.
 *
 * The stored payload may contain additional fields or may fail to parse
 * entirely. References remain declarative: a missing preset or skill does not
 * make this structure invalid and is resolved only by later runtime adapters.
 */
export interface ContextProfile {
  name: string
  description?: string
  basePreset: string
  skills: Record<string, SkillMode>
}

export type ContextManagerDiagnosticCode =
  | 'invalid-profile'
  | 'missing-default-profile'
  | 'invalid-default-profile'
  | 'invalid-schema-version'
  | 'unsupported-schema-version'

export interface ContextManagerDiagnostic {
  code: ContextManagerDiagnosticCode
  profileId?: string
  message: string
}

export interface ContextManagerPersistenceState {
  available: boolean
  writable: boolean
  revision?: number
}

/**
 * Immutable Domain snapshot. This is the usable/parsed layer only; later PRs
 * must keep runtime/effective resolution in a separate state model.
 */
export interface ContextManagerSnapshot {
  schemaVersion: number
  schemaCompatible: boolean
  configuredDefaultProfileId?: string
  usableDefaultProfileId?: string
  profiles: Readonly<Record<string, ContextProfile>>
  diagnostics: readonly Readonly<ContextManagerDiagnostic>[]
  persistence: Readonly<ContextManagerPersistenceState>
}
