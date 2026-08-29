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
 * Refuse only the JSON property key that current DSH Settings cannot yet
 * construct losslessly. DSH itself carries an upstream property-safety TODO
 * for `__proto__`; ordinary names such as `constructor` and `prototype` remain
 * valid editor data.
 */
export function assertNoUnsafeDshPropertyKeys(value: unknown, label: string): void {
  const seen = new WeakSet<object>()

  const visit = (current: unknown, path: string): void => {
    if (typeof current !== 'object' || current === null) return
    if (seen.has(current)) return
    seen.add(current)

    if (Array.isArray(current)) {
      current.forEach((entry, index) => visit(entry, childPath(path, index)))
      return
    }

    // Non-plain objects are rejected later by native DSH Settings JSON-shape
    // validation. Do not duplicate that validator here.
    if (!isPlainObject(current)) return

    for (const [key, entry] of Object.entries(current)) {
      const nextPath = childPath(path, key)
      if (key === '__proto__') {
        throw new ContextManagerError(
          'unsafe-path-key',
          `${label} contains the DSH-unsafe property key "__proto__" at ${nextPath}`,
        )
      }
      visit(entry, nextPath)
    }
  }

  visit(value, '$')
}

/**
 * Additional checks needed by the advanced stored-payload editor before DSH
 * Settings takes over JSON-shape validation. In particular, DSH treats
 * `undefined` object fields as sparse omissions, which would make a raw editor
 * claim to store data that was actually discarded.
 */
export function assertRawProfileWriteSafe(value: unknown): void {
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

    // Let DSH reject Dates, Maps, cycles through non-plain containers, BigInts,
    // and other non-JSON values with its authoritative JSON-shape error.
    if (!isPlainObject(current)) return

    for (const [key, entry] of Object.entries(current)) {
      const nextPath = childPath(path, key)
      if (key === '__proto__') {
        throw new ContextManagerError(
          'unsafe-path-key',
          `raw profile contains the DSH-unsafe property key "__proto__" at ${nextPath}`,
        )
      }
      visit(entry, nextPath)
    }
  }

  visit(value, '$')
}
