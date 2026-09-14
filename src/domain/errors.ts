export type ContextManagerErrorCode =
  | 'profile-exists'
  | 'profile-not-found'
  | 'profile-path-not-editable'
  | 'skill-binding-not-found'
  | 'invalid-profile'
  | 'invalid-raw-profile'
  | 'invalid-skill-mode'
  | 'unsafe-path-key'
  | 'persistence-unavailable'
  | 'persistence-not-ready'
  | 'persistence-read-only'
  | 'persistence-document-invalid'
  | 'preset-authoring-unavailable'
  | 'prompt-library-not-ready'
  | 'prompt-resource-exists'
  | 'prompt-resource-not-found'
  | 'prompt-resource-conflict'
  | 'prompt-resource-path-not-editable'
  | 'invalid-prompt-resource'
  | 'invalid-schema-version'
  | 'unsupported-schema-version'

export class ContextManagerError extends Error {
  constructor(
    readonly code: ContextManagerErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'ContextManagerError'
  }
}

const DSH_UNSAFE_PATH_KEY = ['__', 'proto', '__'].join('')

/**
 * DSH Settings currently has an upstream TODO around property-safe construction
 * for one valid JSON key that mutates object prototypes in ordinary assignment.
 * Refuse that key only; ordinary editor data named "constructor" or "prototype"
 * is not cosmetically restricted.
 */
export function assertSafePathKey(value: string, label: string): void {
  if (value === DSH_UNSAFE_PATH_KEY) {
    throw new ContextManagerError(
      'unsafe-path-key',
      `${label} ${JSON.stringify(value)} is unsafe for the current DSH settings property implementation`,
    )
  }
}
