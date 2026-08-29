export type ContextManagerErrorCode =
  | 'profile-exists'
  | 'profile-not-found'
  | 'invalid-profile'
  | 'unsafe-path-key'
  | 'persistence-unavailable'
  | 'persistence-read-only'
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
 * for JSON keys such as "__proto__". Refuse only keys that can cross that
 * technical integrity boundary; do not impose cosmetic naming policy.
 */
export function assertSafePathKey(value: string, label: string): void {
  if (value === '__proto__' || value === 'prototype' || value === 'constructor') {
    throw new ContextManagerError(
      'unsafe-path-key',
      `${label} ${JSON.stringify(value)} is unsafe for the current DSH settings path implementation`,
    )
  }
}
