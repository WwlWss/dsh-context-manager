export const SKILL_MODES = ['pinned', 'auto', 'manual', 'off'] as const

export type SkillMode = (typeof SKILL_MODES)[number]

/**
 * User-authored Context Manager profile.
 *
 * References are intentionally declarative. A missing preset or skill remains
 * valid stored intent and is diagnosed by the integration that resolves it.
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

/** Immutable, normalized view consumed by future Host adapters and Remote UI. */
export interface ContextManagerSnapshot {
  schemaVersion: number
  schemaCompatible: boolean
  configuredDefaultProfileId?: string
  defaultProfileId?: string
  profiles: Readonly<Record<string, ContextProfile>>
  diagnostics: readonly ContextManagerDiagnostic[]
  persistence: Readonly<ContextManagerPersistenceState>
}
