export const SKILL_MODES = ['pinned', 'auto', 'manual', 'off'] as const

export type SkillMode = (typeof SKILL_MODES)[number]

export const PROMPT_PLACEMENTS = [
  'before-persona',
  'after-persona',
  'before-tool-guidance',
  'after-tool-guidance',
  'runtime-context',
] as const

export type PromptPlacement = (typeof PROMPT_PLACEMENTS)[number]

/**
 * Stable identity of one profile-local PromptBinding.
 *
 * This is deliberately distinct from PromptResourceId. Binding ids live as
 * DSH Settings path keys, while prompt resource ids are arbitrary authored
 * strings stored as ordinary values and may therefore use a wider vocabulary.
 */
export type PromptBindingId = string

/**
 * Structured Domain view of one stored prompt binding.
 *
 * Unknown stored siblings remain outside the current Domain view and must
 * survive every narrow mutation for forward-compatible editing.
 */
export interface PromptBinding {
  readonly resourceId: string
  readonly enabled: boolean
  readonly placement: PromptPlacement
  readonly order: number
}

/**
 * Structured authoring input for a new prompt binding.
 *
 * Known fields are validated, but caller-supplied JSON-shaped extension fields
 * are preserved verbatim in Stored state.
 */
export interface PromptBindingInput {
  readonly resourceId: string
  readonly enabled: boolean
  readonly placement: PromptPlacement
  readonly order: number
  readonly [key: string]: unknown
}

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
  readonly prompts: Readonly<Record<PromptBindingId, PromptBinding>>
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
