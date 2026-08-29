import { ContextManagerError } from './errors.js'

/** Whether a value is a plain data object rather than an array/class instance. */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function childPath(path: string, key: string | number): string {
  return typeof key === 'number'
    ? `${path}[${String(key)}]`
    : `${path}[${JSON.stringify(key)}]`
}

/**
 * Context Manager's narrow preflight for a profile payload before handing the
 * write to native DSH Settings. DSH remains the authoritative JSON-shape
 * validator; this helper only rejects cases where the current Settings
 * implementation would accept an operation but cannot preserve the editor's
 * payload semantics losslessly.
 */
export function assertStoredProfilePayloadSafe(value: unknown): void {
  if (value === undefined) {
    throw new ContextManagerError(
      'invalid-raw-profile',
      'undefined cannot be stored as a profile payload; delete the profile explicitly instead',
    )
  }

  const seen = new WeakSet<object>()

  const visit = (current: unknown, path: string): void => {
    if (current === undefined) {
      throw new ContextManagerError(
        'invalid-raw-profile',
        `undefined at ${path} cannot be represented losslessly by DSH Settings`,
      )
    }
    if (typeof current !== 'object' || current === null) return
    if (seen.has(current)) return
    seen.add(current)

    if (Array.isArray(current)) {
      current.forEach((entry, index) => visit(entry, childPath(path, index)))
      return
    }

    // Non-plain objects and cycles remain native DSH Settings concerns. Do not
    // grow a competing JSON validator in Context Manager.
    if (!isPlainObject(current)) return

    for (const [key, entry] of Object.entries(current)) {
      const nextPath = childPath(path, key)
      if (key === '__proto__') {
        throw new ContextManagerError(
          'unsafe-path-key',
          `profile payload contains the DSH-unsafe property key "__proto__" at ${nextPath}`,
        )
      }
      visit(entry, nextPath)
    }
  }

  visit(value, '$')
}
