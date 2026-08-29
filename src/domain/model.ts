export const SKILL_MODES = ['pinned', 'auto', 'manual', 'off'] as const

export type SkillMode = (typeof SKILL_MODES)[number]

/**
 * Structured Domain view of one stored skill binding.
 *
 * PR2 only interprets `mode`. The stored binding may carry additional fields
 * for later placement, ordering, activation, transform, or runtime metadata;
 * narrow edits must preserve those unknown siblings.
 */
export interface SkillBinding {
  readonly mode: SkillMode
}

/**
 * Structured Domain view of one stored Context Manager profile payload.
 *
 * The stored payload may contain additional fields or may fail to parse
 * entirely. References remain declarative: a missing preset or skill does not
 * make this structure invalid and is resolved only by later runtime adapters.
 */
export interface ContextProfile {
  readonly name: string
  readonly description?: string
  readonly basePreset: string
  readonly skills: Readonly<Record<string, SkillBinding>>
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
  /** Whether a Settings provider is visible from the Context Manager scope. */
  available: boolean
  /** Whether the Context Manager namespace is currently registered on it. */
  registered: boolean
  /** Whether a Context Manager write can currently be attempted. */
  writable: boolean
  /** Raw user-section revision when the namespace is registered. */
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
