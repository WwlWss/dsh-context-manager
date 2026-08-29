export type ContextManagerErrorCode =
  | 'profile-exists'
  | 'profile-not-found'
  | 'profile-path-not-editable'
  | 'invalid-profile'
  | 'invalid-raw-profile'
  | 'invalid-skill-mode'
  | 'unsafe-path-key'
  | 'persistence-unavailable'
  | 'persistence-not-ready'
  | 'persistence-read-only'
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

/**
 * DSH Settings currently has an upstream TODO around property-safe construction
 * for the valid JSON key "__proto__". Refuse that key only; ordinary editor
 * data named "constructor" or "prototype" is not cosmetically restricted.
 */
export function assertSafePathKey(value: string, label: string): void {
  if (value === '__proto__') {
    throw new ContextManagerError(
      'unsafe-path-key',
      `${label} ${JSON.stringify(value)} is unsafe for the current DSH settings property implementation`,
    )
  }
}
